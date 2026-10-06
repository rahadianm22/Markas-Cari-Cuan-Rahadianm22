// Agregator lowongan: Adzuna (Australia, butuh key) + feed remote gratis (Jobicy, Himalayas, RemoteOK).
// Dipanggil dari browser sebagai /api/jobs?q=...&loc=Australia|Malaysia&type=contract
export const dynamic = 'force-dynamic';

const TTL = 20 * 60 * 1000;
const cache = new Map();

const ADZUNA_COUNTRY = { australia: 'au' };
const REGION_OK = {
  australia: /australia|apac|asia[- ]?pac|oceania|anz|asia|worldwide|anywhere|global|everywhere/i,
  malaysia: /malaysia|apac|asia[- ]?pac|southeast asia|\basia\b|worldwide|anywhere|global|everywhere/i
};

const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const iso = v => { const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'MarkasCariCuan/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

function relevant(title, q) {
  const t = title.toLowerCase();
  if (/product owner|product manager/i.test(q) && !/design/i.test(q)) return /product owner|product manager/.test(t);
  if (/interior|graphic|hardware|pcb|fashion|landscape|architect|jewel|floral|packaging|industrial|mechanical|civil|garment|\bgame|\b3d\b|animat|video|multimedia|\bintern\b|internship/.test(t)) return false;
  return /product design|\bux\b|\bui\b|design system|interaction design|digital product|experience design|service design|design lead|head of design|web design|visual design/.test(t);
}
function regionOk(text, region) {
  const t = (text || '').trim();
  return !t || REGION_OK[region].test(t); // kosong = tidak dibatasi
}

async function adzuna(q, region, contract) {
  const cc = ADZUNA_COUNTRY[region], id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!cc || !id || !key) return [];
  const p = new URLSearchParams({ app_id: id, app_key: key, what: q, results_per_page: '20', 'content-type': 'application/json', sort_by: 'date' });
  if (contract) p.set('contract', '1');
  const d = await getJson(`https://api.adzuna.com/v1/api/jobs/${cc}/search/1?${p}`);
  return (d.results || []).map(r => ({
    title: strip(r.title), jobId: String(r.id), company: r.company?.display_name || '', location: r.location?.display_name || 'Australia',
    posted: iso(r.created), type: r.contract_time || r.contract_type || '', url: r.redirect_url,
    comp: r.salary_min ? `AUD ${Math.round(r.salary_min).toLocaleString('en')}${r.salary_max ? ' - ' + Math.round(r.salary_max).toLocaleString('en') : ''}` : '',
    detail: strip(r.description), source: 'Adzuna'
  }));
}
// Jobstreet (MY) dan SEEK (AU) berbagi backend yang sama. Endpoint ini tidak resmi/tidak terdokumentasi,
// jadi bisa berubah atau diblok sewaktu-waktu; pemakaian dijaga kecil lewat cache.
const SEEK = {
  malaysia: { host: 'my.jobstreet.com', site: 'MY-Main', label: 'Jobstreet', country: 'Malaysia' },
  australia: { host: 'www.seek.com.au', site: 'AU-Main', label: 'SEEK', country: 'Australia' }
};
async function seek(q, region) {
  const c = SEEK[region];
  const d = await getJson(`https://${c.host}/api/jobsearch/v5/search?siteKey=${c.site}&keywords=${encodeURIComponent(q)}&pageSize=30&sortmode=ListedDate`);
  return (d.data || []).map(j => ({
    title: strip(j.title), jobId: String(j.id), company: j.companyName || j.advertiser?.description || '',
    location: j.locations?.[0]?.label || c.country, posted: iso(j.listingDate), type: j.workTypes?.join(', ') || '',
    url: `https://${c.host}/job/${j.id}`, comp: j.salaryLabel || '', detail: strip(j.teaser), source: c.label
  }));
}
async function jobicy(q, region) {
  const d = await getJson('https://jobicy.com/api/v2/remote-jobs?count=50&industry=design-multimedia');
  return (d.jobs || []).filter(j => regionOk(j.jobGeo, region)).map(j => ({
    title: strip(j.jobTitle), jobId: String(j.id), company: j.companyName, location: `Remote (${strip(j.jobGeo) || 'Anywhere'})`,
    posted: iso(j.pubDate), type: (j.jobType || []).join(', '), url: j.url, comp: '', detail: strip(j.jobExcerpt), source: 'Jobicy'
  }));
}
async function himalayas(q, region) {
  const d = await getJson(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&limit=40`);
  return (d.jobs || []).filter(j => {
    const loc = (j.locationRestrictions || []).join(', ');
    return regionOk(loc, region);
  }).map(j => ({
    title: strip(j.title), jobId: j.guid, company: j.companyName,
    location: j.locationRestrictions?.length ? `Remote (${j.locationRestrictions.slice(0, 4).join(', ')})` : 'Remote (Anywhere)',
    posted: iso(j.pubDate), type: j.employmentType || '', url: j.applicationLink || j.guid,
    comp: j.minSalary ? `${j.currency || ''} ${j.minSalary}${j.maxSalary ? ' - ' + j.maxSalary : ''} / ${j.salaryPeriod || 'tahun'}`.trim() : '',
    detail: strip(j.excerpt), source: 'Himalayas'
  }));
}
async function remoteok(q, region) {
  const d = (await getJson('https://remoteok.com/api')).slice(1);
  return d.filter(j => regionOk(j.location, region)).map(j => ({
    title: strip(j.position), jobId: String(j.id), company: j.company, location: `Remote (${j.location || 'Anywhere'})`,
    posted: iso(j.date), type: (j.tags || []).includes('contract') ? 'Contract' : '', url: j.url,
    comp: j.salary_min ? `USD ${j.salary_min} - ${j.salary_max}` : '', detail: strip(j.description).slice(0, 1500), source: 'RemoteOK'
  }));
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') || '').slice(0, 100), region = (sp.get('loc') || '').toLowerCase(), type = sp.get('type') || '';
  if (!q || !REGION_OK[region]) return Response.json({ error: 'Parameter q dan loc (Australia|Malaysia) wajib.' }, { status: 400 });

  const ck = `${q}|${region}|${type}`, hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body);

  const contract = type === 'contract';
  const names = ['Adzuna', 'Jobstreet/SEEK', 'Jobicy', 'Himalayas', 'RemoteOK'];
  const res = await Promise.allSettled([adzuna(q, region, contract), seek(q, region), jobicy(q, region), himalayas(q, region), remoteok(q, region)]);
  const errors = [], seen = new Set();
  let jobs = [];
  res.forEach((r, i) => r.status === 'fulfilled' ? jobs.push(...r.value) : errors.push(`${names[i]}: ${r.reason?.message || 'gagal'}`));
  jobs = jobs.filter(j => {
    if (!j.title || !j.company || !j.url || !relevant(j.title, q)) return false;
    if (contract && j.type && !/contract|freelance|part/i.test(j.type) && j.source !== 'Adzuna') return false;
    const k = `${j.company}|${j.title}`.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  }).slice(0, 40);

  if (!jobs.length && errors.length === res.length) return Response.json({ error: 'Semua sumber gagal: ' + errors.join('; ') }, { status: 502 });
  const body = { jobs, errors, adzuna: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) };
  cache.set(ck, { at: Date.now(), body });
  return Response.json(body);
}
