const STATUSES = ['Ide', 'Prototipe', 'Dibangun', 'Live', 'Jeda'];
const STATUS_COLOR = { Ide: '#9FB0CC', Prototipe: '#E8B54A', Dibangun: '#5B8DEF', Live: '#2FBF71', Jeda: '#7A8699' };
const PROFILE_STATUS = ['Belum dibuat', 'Draft', 'Aktif'];
const STORE_KEY = 'markas-cari-cuan-v1';

/* ---------- state (localStorage dengan fallback aman) ---------- */
function defaultState(){
  return {
    jobs: CONFIG.jobs.map(j => ({ ...j, since: Date.now() })),
    freelance: {
      platforms: { ...CONFIG.freelance.platforms },
      target: CONFIG.freelance.target,
      checklist: CONFIG.freelance.checklist.map(t => ({ t, done: false }))
    },
    projects: CONFIG.projects.map(p => ({ id: p.id, status: p.status, link: p.link })),
    vault: { ...CONFIG.vault },
    found: [], huntWanted: false, stats: { searches: 0, lastAt: 0 }, drafts: {}, sound: false, savedAt: 0,
    huntIdx: {},
    huntCfg: Object.fromEntries(CONFIG.agents.filter(a => a.hunt).map(a => [a.id, { queries: [...a.hunt.queries], locations: [...a.hunt.locations] }]))
  };
}
function mergeSaved(s, saved){
  if (!saved || typeof saved !== 'object') return s;
  if (Array.isArray(saved.jobs)) s.jobs = saved.jobs.map(j => ({ ...j, since: j.since || Date.now() }));
  if (saved.freelance) s.freelance = Object.assign(s.freelance, saved.freelance);
  if (saved.vault) s.vault = Object.assign(s.vault, saved.vault);
  if (Array.isArray(saved.found)) s.found = saved.found.map(f => ({ lane: 'kerja', ...f }));
  if (Number.isFinite(saved.huntIdx)) s.huntIdx = { scout: saved.huntIdx };
  else if (saved.huntIdx && typeof saved.huntIdx === 'object') s.huntIdx = { ...saved.huntIdx };
  if (saved.huntCfg && typeof saved.huntCfg === 'object') Object.keys(s.huntCfg).forEach(id => {
    const c = saved.huntCfg[id]; if (c && Array.isArray(c.queries) && Array.isArray(c.locations)) s.huntCfg[id] = { queries: c.queries, locations: c.locations }; });
  if (saved.huntWanted) s.huntWanted = true;
  if (saved.sound) s.sound = true;
  if (saved.drafts && typeof saved.drafts === 'object') s.drafts = saved.drafts;
  if (Number.isFinite(saved.savedAt)) s.savedAt = saved.savedAt;
  if (saved.stats) s.stats = Object.assign(s.stats, saved.stats);
  if (Array.isArray(saved.projects)) s.projects = s.projects.map(p => Object.assign(p, saved.projects.find(x => x.id === p.id) || {}));
  return s;
}
function loadState(){
  const s = defaultState();
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) mergeSaved(s, JSON.parse(raw)); }
  catch (e) { /* storage kosong atau diblokir: pakai default */ }
  return s;
}
function saveState(){ state.savedAt = Date.now(); try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} queueRemote(); }
let state = loadState();
const daysSince = ts => Math.floor((Date.now() - (ts || Date.now())) / 864e5);
function isStale(j){ return (j.col === 'melamar' || j.col === 'interview') && daysSince(j.since) >= CONFIG.hunt.staleDays; }

/* ---------- sinkron ke server (db), cadangan localStorage ---------- */
const sync = { ref: null, timer: 0, writing: false, last: '', status: 'local' };
function setSync(st){
  sync.status = st;
  const el = document.getElementById('syncChip'); if (!el) return;
  const t = { ok: 'Tersinkron ke server, bisa dibuka dari perangkat lain', local: 'Tersimpan di browser ini saja', error: 'Sinkron gagal, data tetap aman di browser ini', full: 'Penyimpanan server penuh, data tersimpan di browser ini' }[st];
  el.className = 'sync' + (st === 'ok' ? ' ok' : st === 'local' ? '' : ' err'); el.lastElementChild.textContent = t;
}
function remotePayload(){
  const o = JSON.parse(JSON.stringify(state));
  const nonNew = o.found.filter(f => f.status !== 'new').map(f => f.status === 'dismissed' ? { key: f.key, status: f.status, lane: f.lane, foundAt: f.foundAt, title: f.title, company: f.company, url: f.url, score: f.score } : f);
  const fresh = o.found.filter(f => f.status === 'new').slice(-60).map(f => { if (f.detail) f.detail = f.detail.slice(0, 600); return f; });
  o.found = [...nonNew, ...fresh];
  delete o.huntWanted; delete o.sound;
  return JSON.parse(JSON.stringify(o));
}
const cmpOf = p => JSON.stringify({ ...p, savedAt: 0 });
function queueRemote(){ if (!sync.ref) return; clearTimeout(sync.timer); sync.timer = setTimeout(pushRemote, 1500); }
async function pushRemote(){
  if (!sync.ref) return;
  if (sync.writing){ queueRemote(); return; }
  let payload = remotePayload(), cmp = cmpOf(payload);
  if (cmp.length > 200000){ payload.found = payload.found.slice(-30).map(f => ({ ...f, detail: undefined })); payload = JSON.parse(JSON.stringify(payload)); cmp = cmpOf(payload); }
  if (cmp === sync.last) return;
  sync.writing = true;
  try { await sync.ref.set({ savedAt: state.savedAt, state: payload }); sync.last = cmp; setSync('ok'); }
  catch (e) { setSync(e && e.code === 'quota_exceeded' ? 'full' : 'error'); }
  finally { sync.writing = false; }
}
function applyRemote(doc){
  const r = doc && doc.state; if (!r || typeof r !== 'object') return;
  const keep = { huntWanted: state.huntWanted, sound: state.sound };
  const localDetail = new Map(state.found.map(f => [f.key, f.detail]));
  const next = mergeSaved(defaultState(), r); Object.assign(next, keep);
  next.found.forEach(f => { const d = localDetail.get(f.key); if (d && (!f.detail || d.length > f.detail.length)) f.detail = d; });
  next.savedAt = doc.savedAt; state = next;
  sync.last = cmpOf(remotePayload());
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  refreshTextures(); renderPanel();
}
async function initSync(){
  if (!(window.claude && window.claude.use)) { setSync('local'); return; }
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user){ setSync('local'); return; }
    const uid = await user.id(); if (!uid){ setSync('local'); return; }
    sync.ref = db.doc('data/users/' + uid + '/state');
    const snap = await sync.ref.get();
    const d = snap.exists ? snap.data() : null;
    if (d && d.savedAt > state.savedAt) applyRemote(d); else queueRemote();
    sync.ref.onSnapshot(s => {
      if (!s.exists) return; const dd = s.data();
      if (dd && dd.savedAt > state.savedAt && !sync.writing && !(s.metadata && s.metadata.hasPendingWrites)) applyRemote(dd);
    }, () => setSync('error'));
    setSync('ok');
  } catch (e) { setSync('local'); }
}
const projectData = i => ({ ...CONFIG.projects[i], ...state.projects[i] });
const rupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =====================================================================
   SCENE
   ===================================================================== */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const IS_SMALL = Math.min(innerWidth, innerHeight) < 720;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_SMALL ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0E1A2E');
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 400);

// Lighting: ambient + directional hangat + titik lampu per zona
scene.add(new THREE.HemisphereLight('#AFC4F0', '#1A2640', 0.5));
scene.add(new THREE.AmbientLight('#ffffff', 0.12));
const sun = new THREE.DirectionalLight('#FFE2B8', 0.95);
sun.position.set(12, 22, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_SMALL ? 1024 : 2048, IS_SMALL ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
sun.shadow.bias = -0.0006;
scene.add(sun);
[[0, 5, 5.5], [6.5, 5, -4], [-8, 4.5, 1.5], [8, 4.5, 3.5], [-9, 4.5, -6]].forEach(p => {
  const l = new THREE.PointLight('#FFC27A', 0.7, 13, 2); l.position.set(...p); scene.add(l);
});

/* ---------- helpers geometri & tekstur ---------- */
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
const font = (w, s) => `${w} ${s}px ${FONT}`;
const textures = [];
function mat(color, o = {}){ return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, o)); }
function mesh(parent, geo, color, x, y, z, o){
  const m = new THREE.Mesh(geo, mat(color, o));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
const box = (p, w, h, d, c, x, y, z, o) => mesh(p, new THREE.BoxGeometry(w, h, d), c, x, y, z, o);
const cyl = (p, rt, rb, h, c, x, y, z, o, seg = 20) => mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, o);
function canvasTex(w, h, draw){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const t = { tex, redraw(){ ctx.clearRect(0, 0, w, h); draw(ctx, w, h); tex.needsUpdate = true; } };
  t.redraw(); textures.push(t); return t;
}
function screen(parent, w, h, t, x, y, z){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
  m.position.set(x, y, z); parent.add(m); return m;
}
function rr(ctx, x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function truncate(ctx, text, max){
  if (ctx.measureText(text).width <= max) return text;
  while (text.length && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}
function wrap(ctx, text, x, y, max, lh){
  const words = text.split(' '); let line = '';
  for (const w of words){
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > max && line){ ctx.fillText(line, x, y); line = w; y += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

/* ---------- ruangan ---------- */
const floorTex = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#22375C'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#2B4472'; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
});
floorTex.tex.wrapS = floorTex.tex.wrapT = THREE.RepeatWrapping; floorTex.tex.repeat.set(12, 9);
const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 18), [mat('#1B2C4A'), mat('#1B2C4A'), new THREE.MeshStandardMaterial({ map: floorTex.tex, roughness: 0.85 }), mat('#1B2C4A'), mat('#1B2C4A'), mat('#1B2C4A')]);
floor.position.set(0, -0.2, 0); floor.receiveShadow = true; scene.add(floor);
box(scene, 24.8, 1.4, 18.8, '#13223B', 0, -1.1, 0);
box(scene, 24.4, 7, 0.4, '#2A4170', -0.2, 3.5, -9.2);   // dinding belakang
box(scene, 0.4, 7, 18, '#263B66', -12.2, 3.5, 0);        // dinding kiri
box(scene, 24.4, 0.3, 0.5, '#E8B54A', -0.2, 0.15, -8.95, { roughness: 0.5 }); // list emas
box(scene, 0.5, 0.3, 18, '#E8B54A', -11.95, 0.15, 0, { roughness: 0.5 });

// jendela malam di dinding kiri
const cityTex = canvasTex(512, 256, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0A1424'); g.addColorStop(1, '#22406E');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let x = 0; x < w; ){
    const bw = 30 + rnd() * 50, bh = 70 + rnd() * 150;
    c.fillStyle = '#0D1A2E'; c.fillRect(x, h - bh, bw, bh);
    for (let wy = h - bh + 10; wy < h - 8; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 11)
      if (rnd() > 0.55){ c.fillStyle = rnd() > 0.3 ? '#FFD38A' : '#9FD8FF'; c.fillRect(wx, wy, 5, 7); }
    x += bw + 4;
  }
});
box(scene, 0.15, 2.5, 4.6, '#E8EDF5', -11.95, 4.6, 1.5);
screen(scene, 4.3, 2.2, cityTex, -11.86, 4.6, 1.5).rotation.y = Math.PI / 2;

// lampu dinding hangat
[-9.5, -4, 1.5, 6.5].forEach(x => box(scene, 0.8, 0.18, 0.25, '#FFD9A0', x, 6.2, -8.95, { emissive: '#FFC27A', emissiveIntensity: 1.2 }));

// tanaman
function plant(x, z, s = 1){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  cyl(g, 0.38, 0.3, 0.7, '#E8EDF5', 0, 0.35, 0);
  const leaf = (lx, ly, lz, r, c) => mesh(g, new THREE.IcosahedronGeometry(r, 0), c, lx, ly, lz, { flatShading: true });
  leaf(0, 1.15, 0, 0.55, '#2FBF71'); leaf(0.25, 1.55, 0.1, 0.38, '#3ACB7D'); leaf(-0.2, 1.45, -0.15, 0.36, '#26A862');
  return g;
}
const plants = [plant(-11, 8), plant(11, -8, 1.1), plant(3.6, 6.8, 0.9), plant(-5.8, -7.6), plant(11, 7.5, 0.8)];

// jam dinding (waktu asli)
const clockTex = canvasTex(256, 256, (c, w) => {
  const r = w / 2, now = new Date();
  c.fillStyle = '#F3F5F9'; c.beginPath(); c.arc(r, r, r - 4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#14233D';
  for (let i = 0; i < 12; i++){
    const a = i / 12 * Math.PI * 2; c.lineWidth = i % 3 ? 4 : 8;
    c.beginPath(); c.moveTo(r + Math.sin(a) * (r - 18), r - Math.cos(a) * (r - 18)); c.lineTo(r + Math.sin(a) * (r - 38), r - Math.cos(a) * (r - 38)); c.stroke();
  }
  const hand = (a, len, wd, col) => { c.strokeStyle = col; c.lineWidth = wd; c.lineCap = 'round'; c.beginPath(); c.moveTo(r, r); c.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len); c.stroke(); };
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, hh = (now.getHours() % 12) + m / 60;
  hand(hh / 12 * Math.PI * 2, r * 0.48, 10, '#14233D');
  hand(m / 60 * Math.PI * 2, r * 0.7, 7, '#14233D');
  hand(s / 60 * Math.PI * 2, r * 0.76, 3, '#E8B54A');
  c.fillStyle = '#E8B54A'; c.beginPath(); c.arc(r, r, 9, 0, Math.PI * 2); c.fill();
});
const clockRim = cyl(scene, 0.85, 0.85, 0.12, '#14233D', 10.6, 5.2, -8.94);
clockRim.rotation.x = Math.PI / 2;
const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.78, 48), new THREE.MeshBasicMaterial({ map: clockTex.tex, toneMapped: false }));
clockFace.position.set(10.6, 5.2, -8.87); scene.add(clockFace);

/* =====================================================================
   ZONA
   ===================================================================== */
const zones = {};
const pickables = [];
function makeZone(id, name, pos, rotY, anchor, cam){
  const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = rotY; g.userData.zone = id; scene.add(g);
  zones[id] = { id, name, group: g, anchor: new THREE.Vector3(...anchor), cam, meshes: [] };
  return g;
}
function registerZones(){
  Object.values(zones).forEach(z => z.group.traverse(o => {
    if (!o.isMesh) return;
    pickables.push(o); z.meshes.push(o);
    if (o.material.emissive){ o.userData.baseEm = o.material.emissive.clone(); o.userData.baseEi = o.material.emissiveIntensity; }
  }));
}

/* ---------- 1. Lobi ---------- */
const lobby = makeZone('lobby', 'Lobi', [0, 0, 5.5], 0, [0, 5.2, 4.2], { target: [0, 1.8, 4.5], theta: 0.6, phi: 1.05, radius: 13 });
const rug = cyl(lobby, 3.4, 3.4, 0.04, '#33507F', 0, 0.02, 0, {}, 48); rug.castShadow = false;
box(lobby, 4.6, 1.05, 1.0, '#DDE4EF', 0, 0.525, 1.6);
box(lobby, 4.8, 0.1, 1.2, '#E8B54A', 0, 1.1, 1.6, { roughness: 0.4, metalness: 0.3 });
const cardTex = canvasTex(1024, 640, (c, w, h) => {
  const p = CONFIG.profile;
  c.fillStyle = '#F3F5F9'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#E8B54A'; c.fillRect(0, 0, 28, h);
  c.fillStyle = '#14233D'; c.font = font(800, 84); c.fillText(p.name, 90, 190);
  c.fillStyle = '#2A4170'; c.font = font(600, 46); c.fillText(p.role, 92, 270);
  c.fillStyle = '#4A5670'; c.font = font(500, 36); wrap(c, p.tagline, 92, 360, 840, 50);
  c.fillStyle = '#6B7790'; c.font = font(600, 30); c.fillText(p.location, 92, 580);
  c.fillStyle = '#2FBF71'; c.textAlign = 'right'; c.fillText(p.years, w - 60, 580); c.textAlign = 'left';
});
const stand = new THREE.Group(); stand.position.set(0, 0, -0.6); stand.rotation.y = 0.45; lobby.add(stand);
cyl(stand, 0.08, 0.08, 1.8, '#C99A35', 0, 0.9, 0, { metalness: 0.5, roughness: 0.4 });
cyl(stand, 0.5, 0.55, 0.1, '#C99A35', 0, 0.05, 0, { metalness: 0.5, roughness: 0.4 });
box(stand, 3.8, 2.4, 0.12, '#14233D', 0, 3.0, 0);
screen(stand, 3.6, 2.25, cardTex, 0, 3.0, 0.065);

/* ---------- 2. Dinding Prestasi ---------- */
const hall = makeZone('hall', 'Dinding Prestasi', [0, 0, -8.95], 0, [-2.5, 5.6, -8.6], { target: [-2.5, 3, -8], theta: 0.22, phi: 1.2, radius: 15 });
const frameTex = CONFIG.experiences.map(exp => canvasTex(512, 384, (c, w, h) => {
  c.fillStyle = exp.color; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, h - 70, w, 70);
  c.fillStyle = '#fff'; c.font = font(800, exp.short.length > 5 ? 92 : 120); c.fillText(exp.short, 34, 170);
  c.fillStyle = 'rgba(255,255,255,.9)'; c.font = font(600, 28); wrap(c, exp.company, 36, 230, 440, 36);
  c.font = font(600, 24); c.fillText(`${exp.products.length} produk`, 36, h - 26);
}));
CONFIG.experiences.forEach((exp, i) => {
  const x = -7 + i * 3;
  const f = box(hall, 2.6, 2.0, 0.12, '#C99A35', x, 3.6, 0.06, { metalness: 0.45, roughness: 0.4 });
  const face = screen(hall, 2.3, 1.72, frameTex[i], x, 3.6, 0.13);
  f.userData.exp = i; face.userData.exp = i;
  box(hall, 0.9, 0.08, 0.3, '#FFD9A0', x, 4.85, 0.25, { emissive: '#FFC27A', emissiveIntensity: 0.9 });
});
box(hall, 3.6, 0.14, 0.8, '#C8A27A', -2.5, 0.5, 2.4);
[-1.5, 1.5].forEach(dx => box(hall, 0.12, 0.45, 0.6, '#14233D', -2.5 + dx, 0.22, 2.4));

/* ---------- 3. War Room ---------- */
const war = makeZone('war', 'Job Hunt War Room', [6.5, 0, -5], 0, [6.5, 5.6, -7], { target: [6.5, 2.2, -5.6], theta: 0.3, phi: 1.12, radius: 14 });
box(war, 4.6, 0.12, 2.2, '#E8EDF5', 0, 0.95, 0.9);
[[-2, 0.1], [2, 0.1], [-2, 1.7], [2, 1.7]].forEach(([x, z]) => cyl(war, 0.06, 0.06, 0.9, '#14233D', x, 0.45, z));
[[-1.2, -0.5], [1.2, -0.5], [-1.2, 2.3], [1.2, 2.3]].forEach(([x, z]) => {
  box(war, 0.7, 0.12, 0.7, '#33507F', x, 0.6, z); box(war, 0.7, 0.7, 0.1, '#33507F', x, 0.95, z + (z < 0 ? -0.32 : 0.32));
});
box(war, 0.5, 0.25, 0.35, '#E8B54A', 0.6, 1.13, 0.8);
const kanbanTex = canvasTex(1024, 576, (c, w, h) => {
  c.fillStyle = '#EEF2F8'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#14233D'; c.font = font(800, 40); c.fillText('Job hunt war room', 30, 58);
  c.font = font(600, 24); c.fillStyle = '#5A6680'; c.textAlign = 'right';
  c.fillText(`${state.jobs.length} lowongan`, w - 30, 56); c.textAlign = 'left';
  const fresh = state.found.filter(f => f.status === 'new').length;
  if (fresh){ c.font = font(700, 22); const txt = `${fresh} temuan baru`, tw = c.measureText(txt).width + 30;
    c.fillStyle = '#2FBF71'; rr(c, 400, 26, tw, 40, 20); c.fill(); c.fillStyle = '#14233D'; c.fillText(txt, 415, 54); }
  const cols = CONFIG.columns, gap = 12, colW = (w - 60 - gap * (cols.length - 1)) / cols.length;
  cols.forEach((col, i) => {
    const x = 30 + i * (colW + gap), y = 84;
    c.fillStyle = '#DCE3EE'; rr(c, x, y, colW, h - y - 24, 14); c.fill();
    c.fillStyle = '#14233D'; c.font = font(700, 22); c.fillText(col.name, x + 14, y + 34);
    state.jobs.filter(j => j.col === col.id).slice(0, 5).forEach((j, k) => {
      const cy = y + 52 + k * 82;
      c.fillStyle = '#fff'; rr(c, x + 8, cy, colW - 16, 72, 10); c.fill();
      c.fillStyle = col.id === 'offer' ? '#2FBF71' : '#E8B54A'; c.fillRect(x + 8, cy + 10, 5, 52);
      if (isStale(j)){ c.fillStyle = '#E9578F'; c.beginPath(); c.arc(x + colW - 24, cy + 20, 8, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#14233D'; c.font = font(700, 19); c.fillText(truncate(c, j.company, colW - 40), x + 22, cy + 30);
      c.fillStyle = '#5A6680'; c.font = font(500, 16); c.fillText(truncate(c, j.role, colW - 40), x + 22, cy + 55);
    });
  });
});
box(war, 6.3, 3.5, 0.14, '#33507F', 0, 3.05, -2.6);
screen(war, 6.0, 3.2, kanbanTex, 0, 3.05, -2.52);
[-2.8, 2.8].forEach(x => box(war, 0.14, 1.4, 0.14, '#33507F', x, 0.7, -2.6));
const alertLamp = box(war, 0.34, 0.34, 0.34, '#E9578F', 3.3, 5.0, -2.6, { emissive: '#E9578F', emissiveIntensity: 0.05 });

/* ---------- 4. Meja Freelance ---------- */
const free = makeZone('free', 'Meja Freelance', [-9.6, 0, 1.5], 0, [-9.6, 3.6, 1.5], { target: [-9.6, 1.8, 1.5], theta: 1.28, phi: 1.12, radius: 11 });
box(free, 1.8, 0.1, 4.6, '#E8EDF5', 0, 1.0, 0);
[[-0.75, -2.1], [0.75, -2.1], [-0.75, 2.1], [0.75, 2.1]].forEach(([x, z]) => cyl(free, 0.05, 0.05, 1.0, '#14233D', x, 0.5, z));
box(free, 0.5, 0.05, 1.4, '#14233D', 0.35, 1.08, 0);
box(free, 0.8, 0.12, 0.8, '#33507F', 1.5, 0.6, 0); box(free, 0.12, 0.9, 0.8, '#33507F', 1.9, 1.05, 0);
function monitorTex(key, title, accent){
  return canvasTex(512, 320, (c, w, h) => {
    const f = state.freelance, status = f.platforms[key];
    c.fillStyle = '#0F1B30'; c.fillRect(0, 0, w, h);
    c.fillStyle = accent; c.fillRect(0, 0, w, 52);
    c.fillStyle = '#fff'; c.font = font(800, 28); c.fillText(title, 22, 36);
    c.font = font(600, 22); c.fillStyle = '#9FB0CC'; c.fillText('Status profil', 22, 98);
    c.fillStyle = status === 'Aktif' ? '#2FBF71' : status === 'Draft' ? '#E8B54A' : '#7A8699';
    rr(c, 22, 112, c.measureText(status).width + 40, 40, 20); c.fill();
    c.fillStyle = '#14233D'; c.font = font(700, 22); c.fillText(status, 42, 140);
    if (key === 'dribbble'){
      const done = f.checklist.filter(x => x.done).length, tot = f.checklist.length || 1;
      c.fillStyle = '#F3F5F9'; c.font = font(600, 22); c.fillText(`Checklist portfolio ${done}/${f.checklist.length}`, 22, 210);
      c.fillStyle = '#24395E'; rr(c, 22, 228, w - 44, 18, 9); c.fill();
      c.fillStyle = '#2FBF71'; rr(c, 22, 228, Math.max(18, (w - 44) * done / tot), 18, 9); c.fill();
    } else {
      c.fillStyle = '#F3F5F9'; c.font = font(600, 22); c.fillText('Target per bulan', 22, 210);
      c.fillStyle = '#2FBF71'; c.font = font(800, 40); c.fillText(rupiah(f.target), 22, 262);
    }
  });
}
const screens = [];
[['dribbble', 'Dribbble', '#E9578F', -1.05, -0.22], ['upwork', 'Upwork', '#3DBE6C', 1.05, 0.22]].forEach(([key, title, accent, z, rot]) => {
  const m = new THREE.Group(); m.position.set(-0.4, 0, z); m.rotation.y = rot; free.add(m);
  cyl(m, 0.05, 0.05, 0.5, '#14233D', 0, 1.3, 0); box(m, 0.4, 0.04, 0.5, '#14233D', 0, 1.07, 0);
  box(m, 0.1, 1.3, 2.0, '#14233D', 0, 2.1, 0);
  const s = screen(m, 1.88, 1.18, monitorTex(key, title, accent), 0.06, 2.1, 0);
  s.rotation.y = Math.PI / 2; screens.push(s);
});
cyl(free, 0.12, 0.18, 0.08, '#14233D', 0.1, 1.09, 1.9); cyl(free, 0.03, 0.03, 0.8, '#14233D', 0.1, 1.5, 1.9);
box(free, 0.3, 0.15, 0.3, '#FFD9A0', 0.25, 1.9, 1.9, { emissive: '#FFC27A', emissiveIntensity: 1.1 });

/* ---------- 5. Lab Side Project ---------- */
const lab = makeZone('lab', 'Lab Side Project', [8, 0, 3.5], 0, [8, 4.4, 3.5], { target: [8, 1.8, 3.5], theta: 0.75, phi: 1.1, radius: 12.5 });
box(lab, 5.6, 0.14, 1.8, '#C8A27A', 0, 0.95, 0);
[[-2.6, -0.75], [2.6, -0.75], [-2.6, 0.75], [2.6, 0.75]].forEach(([x, z]) => box(lab, 0.12, 0.9, 0.12, '#14233D', x, 0.45, z));
box(lab, 5.6, 2.9, 0.5, '#1B2C4A', 0, 1.45, -1.5);
[0.7, 1.6, 2.5].forEach(y => box(lab, 5.4, 0.06, 0.45, '#33507F', 0, y, -1.38));
const projTex = CONFIG.projects.map((_, i) => canvasTex(384, 192, (c, w, h) => {
  const p = projectData(i);
  c.fillStyle = '#F3F5F9'; rr(c, 0, 0, w, h, 22); c.fill();
  c.fillStyle = p.color; c.fillRect(0, 0, 12, h);
  c.fillStyle = '#14233D'; c.font = font(800, 34); c.fillText(truncate(c, p.name, w - 50), 30, 56);
  c.font = font(500, 19); c.fillStyle = '#5A6680'; c.fillText(truncate(c, p.desc, w - 50), 30, 92);
  c.font = font(700, 20); const sw = c.measureText(p.status).width + 32;
  c.fillStyle = STATUS_COLOR[p.status] || '#9FB0CC'; rr(c, 30, 116, sw, 40, 20); c.fill();
  c.fillStyle = '#14233D'; c.fillText(p.status, 46, 143);
}));
const projShapes = [
  g => { [0, 1, 2].forEach(k => box(g, 0.55 - k * 0.1, 0.16, 0.55 - k * 0.1, ['#2F6FD6', '#5B8DEF', '#9FC0FF'][k], 0, 0.1 + k * 0.17, 0)); },
  g => { box(g, 0.6, 0.42, 0.06, '#14233D', 0, 0.4, 0); cyl(g, 0.05, 0.05, 0.08, '#2FBF71', 0, 0.66, 0.02); },
  g => { box(g, 0.65, 0.18, 0.28, '#E8B54A', 0, 0.12, 0); box(g, 0.3, 0.2, 0.28, '#E8B54A', -0.17, 0.3, 0); },
  g => { mesh(g, new THREE.SphereGeometry(0.28, 20, 16), '#E9578F', 0, 0.32, 0); cyl(g, 0.22, 0.26, 0.1, '#F3F5F9', 0, 0.05, 0); }
];
CONFIG.projects.forEach((p, i) => {
  const n = CONFIG.projects.length, x = -2.1 + (n > 1 ? i * 4.2 / (n - 1) : 2.1);
  const g = new THREE.Group(); g.position.set(x, 1.02, 0.1); lab.add(g);
  (projShapes[i] || projShapes[0])(g);
  const t = screen(lab, 1.25, 0.62, projTex[i], x, 2.1 + (i % 2) * 0.15, 0.55);
  t.rotation.y = 0.55;
});

/* ---------- 6. Brankas Cuan ---------- */
const vault = makeZone('vault', 'Brankas Cuan', [-9.8, 0, -6.6], Math.PI / 4, [-9.8, 4.4, -6.6], { target: [-9.8, 1.8, -6.6], theta: 0.78, phi: 1.1, radius: 10.5 });
box(vault, 2.2, 2.4, 1.8, '#3A4B66', 0, 1.2, 0, { metalness: 0.6, roughness: 0.45 });
const door = cyl(vault, 0.72, 0.72, 0.1, '#E8B54A', 0, 1.25, 0.92, { metalness: 0.7, roughness: 0.3 }, 32);
door.rotation.x = Math.PI / 2;
const wheel = new THREE.Group(); wheel.position.set(0, 1.25, 1.0); vault.add(wheel);
[0, Math.PI / 3, -Math.PI / 3].forEach(a => { const s = box(wheel, 0.9, 0.08, 0.08, '#14233D', 0, 0, 0); s.rotation.z = a; });
const vaultTex = canvasTex(512, 256, (c, w, h) => {
  const v = state.vault, pct = v.target > 0 ? Math.min(1, v.current / v.target) : 0;
  c.fillStyle = '#0F1B30'; rr(c, 0, 0, w, h, 20); c.fill();
  c.fillStyle = '#E8B54A'; c.font = font(700, 26); c.fillText('Brankas cuan', 26, 46);
  c.fillStyle = '#F3F5F9'; c.font = font(800, 46); c.fillText(truncate(c, rupiah(v.current), w - 52), 26, 110);
  c.fillStyle = '#9FB0CC'; c.font = font(500, 22); c.fillText('dari target ' + rupiah(v.target), 26, 148);
  c.fillStyle = '#24395E'; rr(c, 26, 176, w - 52, 26, 13); c.fill();
  if (pct > 0){ c.fillStyle = '#2FBF71'; rr(c, 26, 176, Math.max(26, (w - 52) * pct), 26, 13); c.fill(); }
  c.fillStyle = '#2FBF71'; c.font = font(700, 22); c.textAlign = 'right'; c.fillText(Math.round(pct * 100) + '%', w - 26, 236); c.textAlign = 'left';
});
cyl(vault, 0.05, 0.05, 0.6, '#14233D', 0, 2.7, 0.3);
screen(vault, 1.9, 0.95, vaultTex, 0, 3.4, 0.32);
[[1.4, 0.4], [1.6, -0.2], [-1.4, 0.5]].forEach(([x, z], k) => {
  for (let s = 0; s < 3 + k; s++) cyl(vault, 0.22, 0.22, 0.08, '#E8B54A', x, 0.05 + s * 0.09, z, { metalness: 0.7, roughness: 0.3 });
});

registerZones();

/* =====================================================================
   AGEN  — karakter yang jalan sendiri antar zona dan mengerjakan tugas
   ===================================================================== */
const V = (x, z) => new THREE.Vector3(x, 0, z);
const STATION = { lobby: V(2.9, 4.4), hall: V(-1.2, -5.7), war: V(4.1, -3.3), free: V(-7.6, 1.5), lab: V(8, 5.5), vault: V(-8.2, -5.0) };
const ENTRY   = { lobby: V(2.9, 2.8), hall: V(-1.2, -3.2), war: V(2.6, -1.6), free: V(-5.2, 1.5), lab: V(4.3, 5.7), vault: V(-6.0, -3.4) };
const HUB = V(0, 0.2);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const zoneName = z => zones[z].name;
function taskFor(ag, z){
  const id = ag.cfg.id;
  if (z === 'war'){
    const stale = state.jobs.filter(isStale);
    if (stale.length && Math.random() < 0.5){ const j = pickOne(stale); return `Mengingatkan follow-up ${j.company} (${daysSince(j.since)} hari tanpa kabar)`; }
    const j = pickOne(state.jobs); if (!j) return 'Mencari lowongan baru';
    const col = (CONFIG.columns.find(c => c.id === j.col) || {}).name;
    if (id === 'treasurer'){ const paid = state.found.filter(f => f.comp).length;
      return state.found.length ? `Mencatat ${paid} dari ${state.found.length} temuan yang mencantumkan gaji` : `Cek kisaran gaji ${j.role} di ${j.company}`; }
    if (id === 'freelancer') return 'Memeriksa papan sebelum mencari proyek kontrak';
    return pickOne([`Meninjau ${j.company} di kolom ${col}`, `Riset budaya kerja ${j.company}`, `Menyiapkan follow-up ${j.company}`]);
  }
  if (z === 'lobby') return id === 'scout' ? 'Memperbarui ringkasan profil' : 'Menyusun laporan mingguan';
  if (z === 'hall'){
    const e = pickOne(CONFIG.experiences);
    return id === 'curator' ? `Memilih case study ${e.short}` : `Mencocokkan pengalaman ${e.short} dengan lowongan`;
  }
  if (z === 'free'){
    if (id === 'freelancer') return 'Menyaring peluang kontrak remote';
    const c = state.freelance.checklist.filter(x => !x.done);
    return c.length ? `Mengerjakan: ${pickOne(c).t}` : 'Memoles profil Dribbble dan Upwork';
  }
  if (z === 'lab'){
    const pr = projectData(Math.floor(Math.random() * CONFIG.projects.length));
    if (id === 'freelancer') return `Menyiapkan sampel ${pr.name} untuk proposal`;
    return id === 'curator' ? `Memotret ${pr.name} untuk portfolio` : pickOne([`Ngoding ${pr.name}`, `Menguji ${pr.name}`, `Merapikan backlog ${pr.name}`]);
  }
  if (z === 'vault'){
    const v = state.vault, pct = v.target > 0 ? Math.round(Math.min(1, v.current / v.target) * 100) : 0;
    return `Menghitung progress cuan: ${pct}%`;
  }
  return 'Bekerja';
}

const agents = [];
const bubblesEl = document.getElementById('bubbles');
let agentsPaused = false, logs = [];
CONFIG.agents.forEach((cfg, i) => {
  const g = new THREE.Group(); g.userData.agent = cfg.id; scene.add(g);
  const legs = [-0.13, 0.13].map(x => { const pv = new THREE.Group(); pv.position.set(x, 0.55, 0); g.add(pv); box(pv, 0.16, 0.55, 0.18, '#14233D', 0, -0.27, 0); return pv; });
  cyl(g, 0.3, 0.36, 0.8, cfg.color, 0, 0.95, 0, { emissive: cfg.color, emissiveIntensity: 0.28, roughness: 0.55 });
  const arms = [-0.4, 0.4].map(x => { const pv = new THREE.Group(); pv.position.set(x, 1.3, 0); g.add(pv); box(pv, 0.13, 0.55, 0.15, cfg.color, 0, -0.26, 0, { emissive: cfg.color, emissiveIntensity: 0.28 }); return pv; });
  const head = mesh(g, new THREE.SphereGeometry(0.25, 20, 16), '#E9B98E', 0, 1.6, 0);
  cyl(head, 0.26, 0.27, 0.12, ['#2B1D14', '#14233D', '#3B2416', '#1A1A1A'][i % 4], 0, 0.16, 0);
  [-0.09, 0.09].forEach(x => mesh(head, new THREE.SphereGeometry(0.035, 8, 6), '#14233D', x, 0.02, 0.23));
  box(g, 0.36, 0.26, 0.04, '#E8EDF5', 0, 1.0, 0.36);              // tablet kerja
  g.traverse(o => { if (o.isMesh) pickables.push(o); });
  const ang = i / CONFIG.agents.length * Math.PI * 2 + 0.6;
  const off = new THREE.Vector3(Math.cos(ang) * 0.95, 0, Math.sin(ang) * 0.95);
  const start = cfg.zones[0];
  g.position.copy(STATION[start]).add(off);
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.style.setProperty('--c', cfg.color); bubblesEl.appendChild(bubble);
  const ag = { cfg, group: g, legs, arms, head, off, zone: start, next: null, path: [], mode: 'work', timer: 1 + Math.random() * 3, task: '', history: [], bubble, paused: false, phase: Math.random() * 6 };
  ag.task = taskFor(ag, start); agents.push(ag);
});
const agentById = id => agents.find(a => a.cfg.id === id);

function logAgent(ag, text){
  const t = new Date(), hhmm = t.toTimeString().slice(0, 5);
  logs.unshift({ id: ag.cfg.id, text, hhmm }); logs = logs.slice(0, 40);
  ag.history.unshift({ text, hhmm }); ag.history = ag.history.slice(0, 8);
  renderLog();
  if (currentZone === 'agent:' + ag.cfg.id) renderPanel();
}
function renderLog(){
  document.getElementById('logList').innerHTML = logs.slice(0, 14).map(l => {
    const a = agentById(l.id);
    return `<li><button data-agent="${l.id}"><time>${l.hhmm}</time><span><span class="agent-swatch" style="background:${a.cfg.color}"></span><b>${esc(a.cfg.name)}</b> ${esc(l.text)}</span></button></li>`;
  }).join('') || '<li class="muted" style="padding:6px;font-size:13px">Agen sedang bersiap.</li>';
}
function planNext(ag){
  const opts = ag.cfg.zones.filter(z => z !== ag.zone);
  ag.next = opts.length ? pickOne(opts) : ag.zone;
  const pts = ag.next === ag.zone ? [] : [ENTRY[ag.zone], HUB, ENTRY[ag.next]];
  ag.path = [...pts, STATION[ag.next]].map(p => p.clone().add(ag.off));
  ag.mode = 'walk';
}
/* ---------- PERBURUAN NYATA: Indeed (konektor) + penilaian Claude ---------- */
let mcpNs = null, sampleNs = null, dlNs = null;
const hunt = { on: false, busy: false, scoring: false, last: 0, error: '', note: '', sampleOff: false, sampleNote: '', who: null };
if (window.claude && window.claude.use){
  window.claude.use('mcp').then(n => { mcpNs = n; }).catch(() => {});
  window.claude.use('sample').then(n => { sampleNs = n; }).catch(() => {});
  window.claude.use('downloads').then(n => { dlNs = n; }).catch(() => {});
}
const jobKey = j => (j.url || `${j.company}|${j.title}`).toLowerCase();
function parseJobs(text){
  return String(text).split(/\*\*Job Title:\*\*/).slice(1).map(chunk => {
    const f = name => { const m = chunk.match(new RegExp('\\*\\*' + name + ':\\*\\*\\s*([^\\n]+)')); return m ? m[1].trim() : ''; };
    const na = v => (v && v !== 'N/A') ? v : '';
    return { title: chunk.split('\n')[0].trim(), jobId: f('Job Id'), company: f('Company'), location: f('Location'), posted: f('Posted on'), type: na(f('Job Type')), comp: na(f('Compensation')), url: f('View Job URL') };
  }).filter(j => j.title && j.company);
}
function quickScore(j){
  const t = j.title.toLowerCase(), c = j.company.toLowerCase(); let s = 40; const why = [];
  if (/senior|lead|principal|head|staff/.test(t)){ s += 18; why.push('level senior'); }
  if (/product designer/.test(t)){ s += 18; why.push('product design'); }
  else if (/ui|ux/.test(t)){ s += 10; why.push('UI/UX'); }
  if (/design system/.test(t)){ s += 15; why.push('design system'); }
  if (/product owner/.test(t)){ s += 8; why.push('product owner'); }
  if (/bank|financ|fintech|pay|syariah|capital|kredit|credit|amar|bri|bni|mandiri/.test(c)){ s += 12; why.push('fintech/bank'); }
  if (/intern|junior|writer|graphic|copy/.test(t)){ s -= 25; why.push('kurang sesuai level/role'); }
  if (/remote/.test((j.location || '').toLowerCase())){ s += 4; why.push('remote'); }
  const d = Date.parse(j.posted); if (d && Date.now() - d > 120 * 864e5){ s -= 15; why.push('posting lama'); }
  const det = (j.detail || '').toLowerCase();
  if (det){
    const basedIn = (det.match(/(?:based in|located in|relocat)[^.\n]{0,70}/) || [''])[0];
    if (basedIn && !/indonesia|jakarta|tangerang|remote|asia/.test(basedIn)){ s -= 30; why.push('syarat lokasi di luar Indonesia'); }
    if (/design system|tokens|component librar/.test(det)){ s += 6; why.push('menyebut design system'); }
    if (/fintech|banking|bank|payment|lending|kredit/.test(det)){ s += 6; why.push('domain fintech'); }
  }
  return { score: Math.max(5, Math.min(97, s)), reason: why.length ? 'Cepat: ' + why.join(', ') : 'Cepat: kecocokan umum' };
}
const MCP_COPY = {
  server_not_connected: 'Indeed belum tersambung. Tambahkan Indeed di Pengaturan claude.ai, bagian Konektor, lalu mulai lagi.',
  needs_reauth: 'Sambungan Indeed kedaluwarsa. Sambungkan ulang di Pengaturan claude.ai, bagian Konektor.',
  selection_required: 'Ada lebih dari satu sambungan Indeed. Pilih salah satu lewat prompt di claude.ai.',
  not_in_manifest: 'Akses Indeed untuk halaman ini tidak diizinkan. Aktifkan lewat menu izin artifact.',
  blocked_by_policy: 'Kebijakan organisasi memblokir pencarian Indeed.',
  approval_required: 'Pencarian Indeed perlu persetujuan organisasi.',
  not_granted: 'Halaman ini tidak punya akses konektor di tampilan ini.',
  capability_disabled: 'Konektor tidak bisa dipakai di tampilan ini.',
  server_unavailable: 'Indeed sedang tidak merespons. Rani mencoba lagi di putaran berikutnya.'
};
async function runSearch(ag){
  if (!mcpNs){ stopHunt('Pencarian Indeed hanya tersedia di versi artifact claude.ai (lewat konektor Indeed). Di versi web ini, kanban, agen, dan pencatatan tetap jalan.'); return; }
  const hc = ag.cfg.hunt, H = CONFIG.hunt, lane = hc.lane || 'kerja';
  const cfg = state.huntCfg[ag.cfg.id] || { queries: hc.queries, locations: hc.locations };
  hunt.last = performance.now();
  if (!cfg.queries.length || !cfg.locations.length){ logAgent(ag, 'Kata kunci atau lokasi kosong, pencarian dilewati'); return; }
  const idx = state.huntIdx[ag.cfg.id] || 0, n = cfg.queries.length;
  const q = cfg.queries[idx % n], loc = cfg.locations[Math.floor(idx / n) % cfg.locations.length];
  state.huntIdx[ag.cfg.id] = idx + 1; hunt.busy = true; hunt.who = ag; ag.hold = true;
  ag.task = `Mencari "${q}" di Indeed (${loc}${hc.jobType ? ', kontrak' : ''})`; logAgent(ag, ag.task);
  try {
    const input = { country_code: H.country, location: loc, search: q }; if (hc.jobType) input.job_type = hc.jobType;
    const res = await mcpNs.callTool('Indeed', 'search_jobs', input);
    const text = typeof res.payload === 'string' ? res.payload : (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const jobs = parseJobs(text), known = new Set(state.found.map(jobKey));
    let added = 0;
    jobs.forEach(j => { const k = jobKey(j); if (known.has(k)) return; known.add(k); added++;
      state.found.push({ ...j, key: k, ...quickScore(j), by: 'quick', status: 'new', query: q, agent: ag.cfg.id, lane, foundAt: Date.now() }); });
    state.found = state.found.slice(-200);
    state.stats.searches++; state.stats.lastAt = Date.now();
    hunt.error = ''; saveState(); refreshTextures();
    logAgent(ag, `Indeed "${q}" (${loc}): ${jobs.length} hasil, ${added} baru`);
    // baca detail lowongan teratas dari pencarian ini
    const fresh = state.found.filter(f => f.status === 'new' && f.agent === ag.cfg.id && f.query === q && !f.detail && f.jobId && f.foundAt > Date.now() - 60000)
      .sort((a, b) => b.score - a.score).slice(0, 3);
    for (const f of fresh){
      if (!hunt.on) break;
      ag.task = `Membaca detail ${f.title} di ${f.company}`;
      try {
        const r = await mcpNs.callTool('Indeed', 'get_job_details', { job_id: f.jobId });
        const t = typeof r.payload === 'string' ? r.payload : (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        const comp = (t.match(/\*\*Company:\*\*\s*([^\n]+)/) || [])[1];
        if (comp && comp.trim().toLowerCase() === f.company.toLowerCase()){
          const body = t.split(/\*\*Compensation:\*\*[^\n]*\n/)[1] || t;
          f.detail = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2200);
          Object.assign(f, quickScore(f)); f.by = 'quick';
        }
      } catch (e) { if (e && !['tool_error', 'server_unavailable', 'upstream_error'].includes(e.code)) throw e; }
    }
    ag.task = 'Melapor temuan ke papan War Room';
    saveState(); refreshTextures();
    const min = H.minToast, great = state.found.filter(f => f.status === 'new' && f.score >= min && f.foundAt > Date.now() - 120000 && f.agent === ag.cfg.id);
    if (great.length){ toast(`${ag.cfg.name} menemukan ${great.length} ${lane === 'freelance' ? 'peluang kontrak' : 'lowongan'} dengan skor ${min}+`, lane === 'freelance' ? 'free' : 'war'); ping(); }
  } catch (e) {
    const code = e && e.code, msg = MCP_COPY[code] || (code === 'tool_error' ? 'Indeed menolak pencarian: ' + e.message : 'Pencarian gagal: ' + (e && e.message || 'galat tidak dikenal'));
    if (e && e.retryable){ hunt.error = msg; logAgent(ag, msg); } else stopHunt(msg);
  } finally {
    hunt.busy = false; ag.hold = false; hunt.last = performance.now(); refreshHuntUI();
  }
}
async function runScoring(ag){
  const batch = state.found.filter(f => f.status === 'new' && f.by !== 'claude').sort((a, b) => b.score - a.score).slice(0, 8);
  if (!batch.length || !sampleNs || hunt.sampleOff) return false;
  hunt.scoring = true; ag.hold = true; ag.task = `Menilai ${batch.length} lowongan dengan Claude`; logAgent(ag, ag.task);
  const prompt = `Kamu menilai kecocokan lowongan untuk satu kandidat. CV kandidat:
${CONFIG.cv}

Catatan: kandidat tinggal di Jakarta dan tidak berencana pindah negara; lowongan remote hanya cocok bila menerima kandidat dari Indonesia. Bahasa Inggris tingkat menengah, jadi peran yang menuntut bahasa Inggris sangat fasih dinilai lebih rendah. Lowongan bertanda [KONTRAK] adalah peluang freelance atau kontrak remote.
Lowongan:
${batch.map((j, i) => `${i}. ${j.lane === 'freelance' ? '[KONTRAK] ' : ''}${j.title} di ${j.company}, ${j.location}, diposting ${j.posted || 'tidak diketahui'}${j.detail ? '\n   Detail: ' + j.detail.slice(0, 900).replace(/\s+/g, ' ') : ''}`).join('\n')}
Nilai berdasarkan level senior, domain fintech dan perbankan, kecocokan dengan pengalaman nyata di CV, syarat lokasi, dan umur posting.
Balas HANYA array JSON: [{"i":0,"score":0-100,"reason":"alasan singkat bahasa Indonesia, maks 16 kata"}] untuk setiap lowongan.`;
  try {
    const out = await sampleNs.json(prompt, { modelTier: 'quick' });
    (Array.isArray(out) ? out : []).forEach(r => { const j = batch[r.i]; if (!j || !Number.isFinite(+r.score)) return;
      j.score = Math.max(0, Math.min(100, Math.round(+r.score))); j.reason = String(r.reason || '').slice(0, 140); j.by = 'claude'; });
    saveState(); refreshTextures(); logAgent(ag, `Selesai menilai ${batch.length} lowongan`);
    const great = batch.filter(f => f.score >= CONFIG.hunt.minToast);
    if (great.length){ toast(`${ag.cfg.name}: ${great.length} lowongan dinilai sangat cocok`, 'war'); ping(); }
  } catch (e) {
    hunt.sampleOff = true;
    hunt.sampleNote = e && e.code === 'rate_limited' ? 'Penilaian Claude dihentikan karena batas pemakaian. Skor cepat tetap dipakai.'
      : e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(e.code) ? 'Penilaian Claude tidak diizinkan di tampilan ini. Skor cepat tetap dipakai.'
      : 'Penilaian Claude gagal, jadi Bima memakai skor cepat. Klik "Nilai ulang dengan Claude" untuk mencoba lagi.';
    logAgent(ag, hunt.sampleNote);
  } finally { hunt.scoring = false; ag.hold = false; refreshHuntUI(); }
  return true;
}
function startHunt(){
  hunt.on = true; hunt.error = ''; state.huntWanted = true; saveState(); hideToast();
  const rani = agentById('scout');
  if (!hunt.busy) runSearch(rani); // pencarian pertama langsung, dari klik
  refreshHuntUI();
}
function stopHunt(msg){ hunt.on = false; if (!msg){ state.huntWanted = false; saveState(); } if (msg){ hunt.error = msg; const r = agentById('scout'); if (r) logAgent(r, msg); } refreshHuntUI(); }
function refreshHuntUI(){
  const b = document.getElementById('btnHunt');
  if (b){ b.innerHTML = hunt.on ? '<span class="long">Hentikan perburuan</span><span class="short">Stop berburu</span>' : '<span class="long">Mulai berburu kerja</span><span class="short">Berburu kerja</span>'; b.classList.toggle('primary', !hunt.on); }
  if (['war', 'lobby', 'free'].includes(currentZone) || (currentZone || '').startsWith('agent:')) renderPanel();
}
const toastEl = document.getElementById('toast'), toastText = document.getElementById('toastText'), toastBtn = document.getElementById('toastBtn');
let toastAction = null, toastTimer = 0;
function toast(text, zone, label = 'Lihat', action = null, sticky = false){
  if (typeof hintEl !== 'undefined' && !hintEl.hidden) hideHint();
  toastText.textContent = text; toastBtn.textContent = label;
  toastAction = action || (() => openZone(zone));
  clearTimeout(toastTimer); toastEl.hidden = false; toastEl.classList.toggle('gold', !!sticky);
  requestAnimationFrame(() => requestAnimationFrame(() => toastEl.classList.add('show')));
  if (!sticky) toastTimer = setTimeout(hideToast, 9000);
}
function hideToast(){ toastEl.classList.remove('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 400); }
toastBtn.addEventListener('click', () => { const a = toastAction; hideToast(); if (a) a(); });
document.getElementById('toastClose').addEventListener('click', hideToast);
const ago = ts => { if (!ts) return 'belum pernah'; const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'baru saja' : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };

const advice = { text: '', err: '', busy: false };
async function askAdvice(){
  if (!sampleNs || advice.busy) return;
  advice.busy = true; advice.err = ''; advice.text = ''; renderPanel();
  const top = state.found.filter(f => f.status !== 'dismissed').sort((a, b) => b.score - a.score).slice(0, 6);
  const board = CONFIG.columns.map(c => `${c.name}: ${state.jobs.filter(j => j.col === c.id).map(j => j.company + ' (' + j.role + ')').join(', ') || '-'}`).join('\n');
  const prompt = `Kamu asisten karier untuk ${CONFIG.profile.name}, ${CONFIG.profile.role} ${CONFIG.profile.years}, spesialis fintech dan design system, tinggal di ${CONFIG.profile.location}.
Papan lamaran saat ini:
${board}
Temuan lowongan teratas:
${top.map(f => `- [${f.score}] ${f.title} di ${f.company}, ${f.location}: ${f.reason}`).join('\n') || '-'}
Freelance: Dribbble ${state.freelance.platforms.dribbble}, Upwork ${state.freelance.platforms.upwork}, checklist ${state.freelance.checklist.filter(c => c.done).length}/${state.freelance.checklist.length}.
Beri tepat 3 langkah berikutnya yang paling berdampak minggu ini, dalam bahasa Indonesia, masing-masing 1 sampai 2 kalimat, bernomor 1-3, tanpa pembuka atau penutup.`;
  try {
    const r = await sampleNs(prompt, { modelTier: 'default', onText: u => { advice.text = u.text; const el = panelBody.querySelector('.advice'); if (el) el.textContent = u.text; else renderPanel(); } });
    advice.text = r.text;
  } catch (e) {
    if (e && e.text) advice.text = e.text;
    advice.err = e && e.code === 'rate_limited' ? 'Batas pemakaian Claude tercapai. Coba lagi nanti.'
      : e && ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(e.code) ? 'Claude tidak diizinkan di tampilan ini.'
      : e && e.code === 'cancelled' ? '' : 'Saran gagal dibuat. Klik tombolnya lagi untuk mencoba.';
  } finally { advice.busy = false; renderPanel(); }
}

async function exportCsv(){
  if (!dlNs) return;
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Skor', 'Posisi', 'Perusahaan', 'Lokasi', 'Diposting', 'Jenis', 'Status', 'Alasan', 'Link']]
    .concat([...state.found].sort((a, b) => b.score - a.score).map(f => [f.score, f.title, f.company, f.location, f.posted, f.lane === 'freelance' ? 'Kontrak' : 'Kerja', { new: 'Baru', kept: 'Disimpan', dismissed: 'Diabaikan' }[f.status], f.reason, f.url]));
  try { await dlNs.save({ filename: `temuan-lowongan-${new Date().toISOString().slice(0, 10)}.csv`, data: '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\n') }); }
  catch (e) { if (e && e.code === 'unavailable') dlNs = null; renderPanel(); }
}

/* ---------- suara, perayaan, draft Claude ---------- */
let audioCtx = null;
function ping(){
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    [660, 880].forEach((fr, i) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(), st = t0 + i * 0.15;
      o.type = 'sine'; o.frequency.value = fr; g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.12, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.3);
      o.connect(g); g.connect(audioCtx.destination); o.start(st); o.stop(st + 0.32); });
  } catch (e) { /* audio tidak tersedia */ }
}
const fx = { until: 0 }, confetti = { group: null, items: [], active: false, t0: 0 };
function burst(){
  if (reduceMotion) return;
  if (!confetti.group){
    confetti.group = new THREE.Group(); scene.add(confetti.group);
    const geo = new THREE.BoxGeometry(0.26, 0.26, 0.05);
    const mats = ['#E8B54A', '#2FBF71', '#E9578F', '#5B8DEF', '#FFFFFF'].map(c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    for (let i = 0; i < 90; i++){ const m = new THREE.Mesh(geo, mats[i % 5]); confetti.group.add(m); confetti.items.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3() }); }
  }
  confetti.items.forEach(it => {
    it.m.position.set((Math.random() - 0.5) * 6, 5 + Math.random() * 2, 4 + (Math.random() - 0.5) * 5);
    it.v.set((Math.random() - 0.5) * 4, 3 + Math.random() * 5, (Math.random() - 0.5) * 4);
    it.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); it.m.scale.setScalar(1);
  });
  confetti.group.visible = true; confetti.active = true; confetti.t0 = performance.now();
}
function stepConfetti(dt){
  const age = performance.now() - confetti.t0, fade = age > 3500 ? Math.max(0, 1 - (age - 3500) / 1000) : 1;
  confetti.items.forEach(it => {
    it.v.y -= 9 * dt; it.m.position.addScaledVector(it.v, dt);
    if (it.m.position.y < 0.08){ it.m.position.y = 0.08; it.v.set(0, 0, 0); }
    it.m.rotation.x += it.spin.x * dt; it.m.rotation.y += it.spin.y * dt; it.m.scale.setScalar(fade);
  });
  if (age > 4600){ confetti.active = false; confetti.group.visible = false; }
}
function celebrate(msg){ fx.until = performance.now() + 6500; burst(); ping(); if (msg) toast(msg, null, 'Tutup', () => {}); }

const draft = { zone: null, kind: '', title: '', key: '', ctx: null, text: '', busy: false, err: '' };
const errCopy = e => { const c = e && e.code;
  return c === 'rate_limited' ? 'Batas pemakaian Claude tercapai. Coba lagi nanti.'
    : ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled'].includes(c) ? 'Claude tidak diizinkan di tampilan ini.'
    : c === 'refused' ? 'Claude menolak membuat teks ini. Coba ubah konteksnya.'
    : c === 'cancelled' ? '' : 'Draft gagal dibuat. Klik Buat ulang untuk mencoba lagi.'; };
function draftPrompt(kind, ctx){
  const cv = CONFIG.cv, p = CONFIG.profile, sign = `${p.name}\n${p.email} | ${p.site}`;
  const rules = 'Gunakan hanya fakta yang ada di CV. Jangan mengarang angka, perusahaan, atau tools. Jangan memakai tanda pisah panjang atau bullet. Balas HANYA teksnya, tanpa pembuka atau penjelasan.';
  if (kind === 'cover' || kind === 'proposal'){
    const f = ctx.f;
    return `Tulis ${kind === 'cover' ? 'surat lamaran singkat (maks 220 kata)' : 'proposal singkat untuk pekerjaan kontrak remote (maks 150 kata)'} dari kandidat ini.
CV:
${cv}

Lowongan: ${f.title} di ${f.company}, ${f.location}${f.posted ? ', diposting ' + f.posted : ''}.
${f.detail ? 'Deskripsi: ' + f.detail.slice(0, 1800) : 'Deskripsi lengkap tidak tersedia, jadi jangan menebak detail pekerjaan.'}

Aturan: tulis dalam bahasa yang sama dengan deskripsi lowongan; kalau tidak jelas, pakai Bahasa Indonesia. Kalau bahasa Inggris, pakai kalimat sederhana dan jelas karena kandidat berbahasa Inggris tingkat menengah. Pilih 2 sampai 3 pencapaian di CV yang paling relevan dengan lowongan ini. Nada profesional dan hangat. Akhiri dengan tanda tangan:
${sign}
${rules}`;
  }
  if (kind === 'followup'){
    const j = ctx.j;
    return `Tulis pesan follow-up singkat (maks 90 kata) kepada recruiter untuk lamaran posisi ${j.role} di ${j.company}, yang dikirim ${daysSince(j.since)} hari lalu tanpa kabar. Sopan, tidak menuntut, tunjukkan antusiasme, tawarkan informasi tambahan. Bahasa Indonesia, kecuali perusahaan jelas internasional (pakai bahasa Inggris sederhana). Akhiri dengan:
${sign}
Profil singkat kandidat untuk konteks:
${cv.slice(0, 700)}
${rules}`;
  }
  if (kind === 'upwork') return `Tulis bio profil Upwork (maks 170 kata) untuk freelancer ini dalam bahasa Inggris sederhana dan jelas (kandidat berbahasa Inggris tingkat menengah).
CV:
${cv}
Fokus: product design untuk fintech dan perbankan, workflow multi-role, dashboard data-heavy, design system. Paragraf pertama langsung menyebut masalah klien yang bisa diselesaikan. Sebut jenis proyek yang dicari. Jangan mengarang rate atau testimoni.
${rules}`;
  return `Tulis caption Dribbble (60 sampai 90 kata, bahasa Inggris) untuk shot case study berikut. Perusahaan: ${ctx.exp.company}. Produk: ${ctx.product}.
Konteks dari CV:
${cv}
Struktur: satu kalimat masalah, satu kalimat pendekatan desain, satu kalimat hasil (hanya pakai hasil yang ada di CV). Tutup dengan satu baris hashtag (maks 5). Jangan mengarang metrik.
${rules}`;
}
async function makeDraft(kind, ctx, zone, title, key, force){
  if (!sampleNs || draft.busy) return;
  Object.assign(draft, { zone, kind, title, key, ctx, err: '', text: '' });
  const saved = state.drafts[key];
  if (saved && !force){ draft.text = saved.text; renderPanel(); panelBody.scrollTop = 0; return; }
  draft.busy = true; renderPanel(); panelBody.scrollTop = 0;
  try {
    const r = await sampleNs(draftPrompt(kind, ctx), { modelTier: 'default', onText: u => { draft.text = u.text; const ta = panelBody.querySelector('#draftText'); if (ta) ta.value = u.text; } });
    draft.text = (r.text || '').trim();
    state.drafts[key] = { text: draft.text, at: Date.now(), kind, title };
    Object.keys(state.drafts).sort((a, b) => state.drafts[b].at - state.drafts[a].at).slice(12).forEach(k => { delete state.drafts[k]; });
    saveState();
  } catch (e) { if (e && e.text) draft.text = e.text; draft.err = errCopy(e); }
  finally { draft.busy = false; renderPanel(); }
}
function draftCard(zone){
  if (draft.zone !== zone || (!draft.text && !draft.busy && !draft.err)) return '';
  return `<div class="draft"><div class="draft-top"><strong>${esc(draft.title)}</strong><button class="icon" data-action="draftclose" aria-label="Tutup draft">×</button></div>
    <textarea id="draftText" rows="12" spellcheck="false" aria-label="${esc(draft.title)}" ${draft.busy ? 'readonly' : ''}>${esc(draft.text)}</textarea>
    ${draft.busy ? '<p class="muted" style="font-size:13px!important">Claude sedang menulis…</p>' : ''}
    ${draft.err ? `<div class="alert">${esc(draft.err)}</div>` : ''}
    <div class="row"><button class="btn primary small" data-action="draftcopy" ${draft.text ? '' : 'disabled'}>Salin</button>${dlNs ? `<button class="btn small" data-action="draftdl" ${draft.text ? '' : 'disabled'}>Unduh .txt</button>` : ''}<button class="btn small" data-action="draftredo" ${draft.busy ? 'disabled' : ''}>Buat ulang</button></div>
    <p class="muted" style="font-size:12.5px!important;margin-top:8px">Dibuat dari CV-mu. Periksa isinya dan kirim sendiri.</p></div>`;
}
async function copyDraft(){
  const ta = panelBody.querySelector('#draftText'), text = ta ? ta.value : draft.text;
  try { await navigator.clipboard.writeText(text); toast('Draft tersalin', null, 'Tutup', () => {}); }
  catch (e) {
    let ok = false;
    if (ta){ ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (_) {} }
    toast(ok ? 'Draft tersalin' : 'Teks sudah dipilih, tekan Ctrl atau Cmd + C', null, 'Tutup', () => {});
  }
}
async function downloadDraft(){
  if (!dlNs) return;
  const slug = draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'draft';
  try { await dlNs.save({ filename: slug + '.txt', data: draft.text }); } catch (e) { if (e && e.code === 'unavailable'){ dlNs = null; renderPanel(); } }
}
let draftSaveT = 0;

function onArrive(ag){
  if (!hunt.on) return;
  if (ag.cfg.hunt && ag.zone === 'war' && !hunt.busy && performance.now() - hunt.last > CONFIG.hunt.intervalSec * 1000) runSearch(ag);
  if (ag.cfg.id === 'curator' && ag.zone === 'war' && !hunt.scoring) runScoring(ag);
}

// Penjadwal berburu berbasis timer: tetap jalan saat tab di latar belakang (tidak bergantung animasi)
const huntRun = {};
function huntTick(){
  if (!hunt.on || hunt.busy || hunt.scoring) return;
  if (performance.now() - hunt.last < CONFIG.hunt.intervalSec * 1000) return;
  const hunters = agents.filter(a => a.cfg.hunt).sort((a, b) => (huntRun[a.cfg.id] || 0) - (huntRun[b.cfg.id] || 0));
  if (!hunters.length) return;
  huntRun[hunters[0].cfg.id] = Date.now();
  runSearch(hunters[0]);
}
function scoreTick(){
  if (!hunt.on || hunt.busy || hunt.scoring || hunt.sampleOff) return;
  const cur = agentById('curator');
  if (cur && state.found.some(f => f.status === 'new' && f.by !== 'claude')) runScoring(cur);
}
setInterval(huntTick, 5000);
setInterval(scoreTick, 15000);
const LAST_KEY = 'markas-cari-cuan-lastvisit';
function stampVisit(){ try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.hidden) stampVisit(); });
addEventListener('pagehide', stampVisit);

function updateAgent(ag, dt, t){
  const g = ag.group;
  if (agentsPaused || ag.paused){ ag.legs.forEach(l => l.rotation.x *= 0.8); ag.arms.forEach(l => l.rotation.x *= 0.8); return; }
  if (!reduceMotion && performance.now() < fx.until){
    ag.legs.forEach(l => l.rotation.x *= 0.8);
    ag.arms.forEach((l, k) => { l.rotation.x = -2.6 + Math.sin(t * 12 + k * 2) * 0.3; });
    g.position.y = Math.abs(Math.sin(t * 8 + ag.phase)) * 0.35; return;
  }
  if (ag.mode === 'work'){
    ag.timer -= dt;
    if (!reduceMotion){ ag.head.rotation.x = Math.sin(t * 3 + ag.phase) * 0.12; g.position.y = 0; }
    ag.legs.forEach(l => l.rotation.x *= 0.85);
    if (!reduceMotion){ ag.arms[0].rotation.x = -0.5 + Math.sin(t * 6 + ag.phase) * 0.12; ag.arms[1].rotation.x = -0.5 - Math.sin(t * 6 + ag.phase) * 0.12; }
    if (ag.hold) return;
    if (ag.timer <= 0) planNext(ag);
    return;
  }
  const target = ag.path[0], d = target.clone().sub(g.position); d.y = 0;
  const dist = d.length(), step = 2.3 * dt;
  if (dist <= step){
    g.position.x = target.x; g.position.z = target.z; ag.path.shift();
    if (!ag.path.length){
      ag.zone = ag.next; ag.mode = 'work'; ag.timer = 5 + Math.random() * 5;
      ag.task = taskFor(ag, ag.zone); ag.head.rotation.x = 0;
      logAgent(ag, `${ag.task} (${zoneName(ag.zone)})`);
      onArrive(ag);
    }
  } else {
    d.multiplyScalar(step / dist); g.position.add(d);
    const want = Math.atan2(d.x, d.z); let diff = want - g.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); g.rotation.y += diff * Math.min(1, dt * 10);
  }
  ag.phase += dt * 9;
  const sw = Math.sin(ag.phase) * 0.6; ag.legs[0].rotation.x = sw; ag.legs[1].rotation.x = -sw;
  ag.arms[0].rotation.x = -sw * 0.7; ag.arms[1].rotation.x = sw * 0.7;
  // saling menghindar agar tidak bertabrakan
  agents.forEach(o => { if (o === ag) return; const dx = g.position.x - o.group.position.x, dz = g.position.z - o.group.position.z, dd = Math.hypot(dx, dz);
    if (dd > 0.001 && dd < 0.75){ g.position.x += dx / dd * (0.75 - dd) * 0.5; g.position.z += dz / dd * (0.75 - dd) * 0.5; } });
  if (!reduceMotion) g.position.y = Math.abs(Math.cos(ag.phase)) * 0.05;
}
function updateBubbles(){
  const placed = [];
  agents.map(ag => { tmp.copy(ag.group.position); tmp.y += 2.25; tmp.project(camera); return { ag, x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight, vis: tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 }; })
  .sort((a, b) => b.y - a.y).forEach(b => {
    const ag = b.ag;
    ag.bubble.style.display = b.vis ? '' : 'none'; if (!b.vis) return;
    const w = ag.bubble.offsetWidth || 150; let y = b.y;
    for (let k = 0; k < 4; k++){ const hit = placed.find(p => Math.abs(p.x - b.x) < (p.w + w) / 2 + 4 && Math.abs(p.y - y) < 27); if (!hit) break; y = hit.y - 28; }
    placed.push({ x: b.x, y, w });
    ag.bubble.style.transform = `translate(${b.x}px, ${y}px) translate(-50%,-100%)`;
    const paused = agentsPaused || ag.paused;
    const txt = paused ? 'Jeda' : ag.mode === 'walk' ? `Jalan ke ${zoneName(ag.next)}` : ag.task;
    ag.bubble.classList.toggle('walk', ag.mode === 'walk' || paused);
    const html = `<b>${esc(ag.cfg.name)}</b>${esc(txt)}`;
    if (ag.bubble._h !== html){ ag.bubble.innerHTML = html; ag.bubble._h = html; }
  });
}

/* =====================================================================
   KAMERA & INTERAKSI
   ===================================================================== */
const view = { target: new THREE.Vector3(0, 0.5, 0), theta: Math.PI / 4, phi: 0.95, radius: 38 };
const LIMITS = { thetaMin: -0.25, thetaMax: Math.PI / 2 + 0.25, phiMin: 0.35, phiMax: 1.28, rMin: 6, rMax: 130 };
const fitScale = () => camera.aspect >= 1.35 ? 1 : Math.min(2.9, 1.35 / camera.aspect);
const overviewRadius = () => 38 * fitScale();
const overview = () => ({ target: [0, 0.5, 0], theta: Math.PI / 4, phi: 0.95, radius: overviewRadius(), fit: false });
view.radius = overviewRadius();
function clampView(){
  view.theta = Math.min(LIMITS.thetaMax, Math.max(LIMITS.thetaMin, view.theta));
  view.phi = Math.min(LIMITS.phiMax, Math.max(LIMITS.phiMin, view.phi));
  view.radius = Math.min(LIMITS.rMax, Math.max(LIMITS.rMin, view.radius));
}
function applyView(){
  const sp = Math.sin(view.phi);
  camera.position.set(
    view.target.x + view.radius * sp * Math.sin(view.theta),
    view.target.y + view.radius * Math.cos(view.phi),
    view.target.z + view.radius * sp * Math.cos(view.theta));
  camera.lookAt(view.target);
}

// tween kamera
let tween = null;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function flyTo(p, dur = 1100){
  const r = p.radius * (p.fit === false ? 1 : Math.min(1.9, Math.max(1, fitScale() * 0.75)));
  tween = { from: { target: view.target.clone(), theta: view.theta, phi: view.phi, radius: view.radius },
            to: { target: new THREE.Vector3(...p.target), theta: p.theta, phi: p.phi, radius: r },
            start: performance.now(), dur: reduceMotion ? 0 : dur };
}
function stepTween(now){
  if (!tween) return;
  const t = tween.dur ? Math.min(1, (now - tween.start) / tween.dur) : 1, e = ease(t), f = tween.from, to = tween.to;
  view.target.lerpVectors(f.target, to.target, e);
  view.theta = f.theta + (to.theta - f.theta) * e;
  view.phi = f.phi + (to.phi - f.phi) * e;
  view.radius = f.radius + (to.radius - f.radius) * e;
  if (t >= 1) tween = null;
}

// picking
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(x, y){
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit) return null;
  let o = hit.object, exp = null;
  while (o){
    if (o.userData.agent) return { agent: o.userData.agent };
    if (exp === null && o.userData.exp !== undefined) exp = o.userData.exp;
    if (o.userData.zone) return { zone: o.userData.zone, exp };
    o = o.parent;
  }
  return null;
}

// highlight hover
let hovered = null;
const labelEl = document.getElementById('label');
function setHover(id){
  if (hovered === id) return;
  if (hovered && zones[hovered]) zones[hovered].meshes.forEach(m => { if (m.userData.baseEm){ m.material.emissive.copy(m.userData.baseEm); m.material.emissiveIntensity = m.userData.baseEi; } });
  hovered = id;
  if (id && zones[id]) zones[id].meshes.forEach(m => { if (m.userData.baseEm){ m.material.emissive.set('#E8B54A'); m.material.emissiveIntensity = 0.32; } });
  const ag = id && id.startsWith('agent:') ? agentById(id.slice(6)) : null;
  labelEl.textContent = !id ? '' : ag ? `${ag.cfg.name}, ${ag.cfg.role}` : zones[id].name;
  labelEl.classList.toggle('show', !!id);
  canvas.style.cursor = id ? 'pointer' : 'grab';
}

// orbit sederhana: drag putar, scroll/pinch zoom
const pointers = new Map(); let moved = 0, pinch = null;
const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0; if (pointers.size === 2) pinch = pinchDist();
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)){
    if (e.pointerType === 'mouse'){ const p = pick(e.clientX, e.clientY); setHover(p ? (p.agent ? 'agent:' + p.agent : p.zone) : null); }
    return;
  }
  const prev = pointers.get(e.pointerId), dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1){
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 5){ tween = null; canvas.style.cursor = 'grabbing'; setHover(null); if (moved > 60 && !hintEl.hidden) hideHint(); view.theta -= dx * 0.005; view.phi -= dy * 0.005; clampView(); }
  } else if (pointers.size === 2){
    const d = pinchDist(); if (pinch){ tween = null; view.radius *= pinch / d; clampView(); }
    pinch = d; moved += 10;
  }
});
function endPointer(e){
  if (pointers.size === 1 && moved <= 5 && e.type === 'pointerup'){
    const p = pick(e.clientX, e.clientY);
    if (p) p.agent ? openAgent(p.agent) : openZone(p.zone, p.exp);
  }
  pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
  if (!pointers.size) canvas.style.cursor = hovered ? 'pointer' : 'grab';
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pointers.size) setHover(null); });
canvas.addEventListener('wheel', e => { e.preventDefault(); tween = null; view.radius *= Math.exp(e.deltaY * 0.0012); clampView(); }, { passive: false });

/* =====================================================================
   UI: panel, navigasi zona
   ===================================================================== */
const panel = document.getElementById('panel'), panelTitle = document.getElementById('panelTitle'), panelBody = document.getElementById('panelBody');
const zoneNav = document.getElementById('zoneNav');
const NAV = [['lobby', 'Lobi'], ['hall', 'Prestasi'], ['war', 'War Room'], ['free', 'Freelance'], ['lab', 'Lab'], ['vault', 'Brankas']];
zoneNav.innerHTML = NAV.map(([id, n]) => `<button data-zone="${id}">${n}</button>`).join('');
zoneNav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) openZone(b.dataset.zone); });
document.getElementById('hudSub').textContent = `${CONFIG.profile.name}, ${CONFIG.profile.role}`;
document.getElementById('btnHome').addEventListener('click', () => { closePanel(); flyTo(overview()); });
document.getElementById('panelClose').addEventListener('click', closePanel);
document.getElementById('btnHunt').addEventListener('click', () => { hunt.on ? stopHunt() : startHunt(); if (!currentZone) openZone('war'); });
const btnPause = document.getElementById('btnPause'), btnLog = document.getElementById('btnLog'), logEl = document.getElementById('agentLog');
btnPause.addEventListener('click', () => {
  agentsPaused = !agentsPaused; btnPause.textContent = agentsPaused ? 'Lanjutkan' : 'Jeda'; btnPause.setAttribute('aria-pressed', agentsPaused);
  if (currentZone && currentZone.startsWith('agent:')) renderPanel();
});
const btnSound = document.getElementById('btnSound');
const syncSoundBtn = () => { btnSound.setAttribute('aria-pressed', String(!!state.sound)); btnSound.textContent = state.sound ? 'Suara: nyala' : 'Suara'; };
btnSound.addEventListener('click', () => { state.sound = !state.sound; saveState(); syncSoundBtn(); if (state.sound) ping(); });
syncSoundBtn();
if (innerWidth <= 720) logEl.classList.add('collapsed');
const syncLogBtn = () => btnLog.setAttribute('aria-expanded', !logEl.classList.contains('collapsed'));
btnLog.addEventListener('click', () => { logEl.classList.toggle('collapsed'); syncLogBtn(); }); syncLogBtn();
logEl.addEventListener('click', e => { const b = e.target.closest('[data-agent]'); if (b) openAgent(b.dataset.agent); });
const HINT_KEY = 'markas-cari-cuan-hint';
const hintEl = document.getElementById('hint');
const hideHint = () => { hintEl.hidden = true; try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {} };
try { if (!localStorage.getItem(HINT_KEY)) hintEl.hidden = false; } catch (e) { hintEl.hidden = false; }
document.getElementById('hintOk').addEventListener('click', hideHint);
setTimeout(() => {
  let last = 0; try { last = +localStorage.getItem(LAST_KEY) || 0; } catch (e) {}
  const fresh = last ? state.found.filter(f => f.foundAt > last && f.status === 'new') : [];
  const top = fresh.reduce((m, f) => Math.max(m, f.score || 0), 0);
  if (fresh.length) toast(`Sejak kunjungan terakhir: ${fresh.length} lowongan baru, skor tertinggi ${top}.`, 'war', 'Lihat');
  if (state.huntWanted && mcpNs) startHunt();
  else if (state.huntWanted) toast('Perburuan sebelumnya butuh konektor Indeed (hanya di claude.ai).', null, 'Tutup', () => {}, true);
  stampVisit();
}, 1800);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

let currentZone = null, selectedExp = 0, follow = null, findFilter = 0;
function showPanel(navId){
  if (typeof hideHint === 'function' && !hintEl.hidden) hideHint();
  renderPanel();
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  document.body.classList.toggle('sheet-open', innerWidth <= 720);
  document.body.classList.toggle('panel-open', innerWidth > 720);
  [...zoneNav.children].forEach(b => b.setAttribute('aria-current', b.dataset.zone === navId));
}
function openAgent(id){
  const ag = agentById(id); if (!ag) return;
  currentZone = 'agent:' + id; follow = id;
  const p = ag.group.position;
  flyTo({ target: [p.x, 1.2, p.z], theta: view.theta, phi: 1.05, radius: 10 }, 900);
  showPanel(null);
}
function openZone(id, exp = null){
  currentZone = id; follow = null;
  if (id === 'hall' && exp !== null) selectedExp = exp;
  flyTo(zones[id].cam);
  if (!hintEl.hidden) hideHint();
  if ((id === 'war' || id === 'free') && state.found.some(f => !f.seen)){ state.found.forEach(f => { f.seen = true; }); saveState(); }
  renderPanel();
  panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
  document.body.classList.toggle('sheet-open', innerWidth <= 720);
  document.body.classList.toggle('panel-open', innerWidth > 720);
  [...zoneNav.children].forEach(b => b.setAttribute('aria-current', b.dataset.zone === id));
}
function closePanel(){
  currentZone = null; follow = null; panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open', 'panel-open');
  [...zoneNav.children].forEach(b => b.setAttribute('aria-current', false));
}

const scoreBg = sc => sc >= 75 ? '#2FBF71' : sc >= 55 ? '#E8B54A' : '#9FB0CC';
const safeUrl = u => /^https?:\/\//i.test(u) ? u : '';
function findCard(f){
  const fl = f.lane === 'freelance', dk = (fl ? 'proposal:' : 'cover:') + f.key, has = !!state.drafts[dk];
  return `<div class="find"><div class="find-top"><span class="score" style="background:${scoreBg(f.score)}" title="${f.by === 'claude' ? 'Dinilai Claude' : 'Skor cepat'}">${f.score}</span>
    <div><h4>${esc(f.title)}</h4><div class="meta">${esc(f.company)}, ${esc(f.location)}${f.posted ? ', diposting ' + esc(f.posted) : ''}${f.type ? ', ' + esc(f.type) : ''}${f.comp ? ', ' + esc(f.comp) : ''}</div></div></div>
    <p class="why">${esc(f.reason)}</p>${f.detail ? '<span class="tag">Detail sudah dibaca</span>' : ''}${fl ? '<span class="lane">Kontrak / freelance</span>' : ''}
    <div class="row">${safeUrl(f.url) ? `<a class="btn small" href="${esc(f.url)}" target="_blank" rel="noopener">Buka di Indeed</a>` : ''}
      ${sampleNs ? `<button class="btn small" data-action="cover" data-key="${esc(f.key)}">${has ? 'Lihat draft' : fl ? 'Draft proposal' : 'Draft surat lamaran'}</button>` : ''}
      <button class="btn primary small" data-action="keep" data-key="${esc(f.key)}">${fl ? 'Simpan' : 'Tambah ke Incaran'}</button>
      <button class="btn ghost small" data-action="dismiss" data-key="${esc(f.key)}">Abaikan</button></div></div>`;
}
const RENDER = {
  lobby(){
    const p = CONFIG.profile, active = state.jobs.filter(j => j.col !== 'offer').length, staleN = state.jobs.filter(isStale).length;
    return `<p class="lede">${esc(p.tagline)}</p>
      <dl class="facts"><dt>Role</dt><dd>${esc(p.role)}</dd><dt>Pengalaman</dt><dd>${esc(p.years)}</dd><dt>Lokasi</dt><dd>${esc(p.location)}</dd></dl>
      <h3>Keahlian</h3><ul class="chips">${p.skills.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <h3>Status perburuan</h3>
      <p>${active} lowongan sedang dikejar, ${state.found.filter(f => f.status === 'new').length} temuan agen menunggu ditinjau.${staleN ? ` ${staleN} lamaran perlu follow-up.` : ''} Profil Dribbble: ${esc(state.freelance.platforms.dribbble)}, Upwork: ${esc(state.freelance.platforms.upwork)}.</p>
      <div class="row"><button class="btn primary small" data-go="war">Buka War Room</button><button class="btn small" data-go="free">Buka Meja Freelance</button></div>
      ${(() => { const counts = CONFIG.columns.map(c => state.jobs.filter(j => j.col === c.id).length), mx = Math.max(1, ...counts), nf = state.found;
        return `<h3>Ringkasan pipeline</h3>${CONFIG.columns.map((c, i) => `<div class="fun"><span>${esc(c.name)}</span><div class="bar"><i style="width:${counts[i] / mx * 100}%"></i></div><b>${counts[i]}</b></div>`).join('')}<p class="muted" style="font-size:13px!important;margin-top:8px">Temuan agen: ${nf.filter(f => f.status === 'new').length} baru, ${nf.filter(f => f.status === 'kept').length} disimpan, ${nf.filter(f => f.status === 'dismissed').length} diabaikan. ${state.stats.searches} pencarian.</p>`; })()}
      ${(() => { const top = state.found.filter(f => f.status === 'new').sort((a, b) => b.score - a.score).slice(0, 3);
        return top.length ? `<h3>Temuan terbaik</h3><ul class="top3">${top.map(f => `<li><button data-go="war"><span class="score" style="background:${f.score >= 75 ? '#2FBF71' : f.score >= 55 ? '#E8B54A' : '#9FB0CC'}">${f.score}</span><span><strong>${esc(f.title)}</strong><br><span class="muted">${esc(f.company)}</span></span></button></li>`).join('')}</ul>` : ''; })()}
      <h3>Tim agen</h3>
      <ul class="team">${agents.map(a => `<li><button data-agent="${a.cfg.id}"><span class="agent-swatch" style="background:${a.cfg.color}"></span><strong>${esc(a.cfg.name)}</strong>, ${esc(a.cfg.role)}<small>${a.mode === 'walk' ? 'Jalan ke ' + esc(zoneName(a.next)) : esc(a.task)}</small></button></li>`).join('')}</ul>`;
  },
  hall(){
    const exps = CONFIG.experiences, e = exps[selectedExp];
    return `<p class="muted">Klik bingkai di dinding atau pilih dari timeline.</p>
      <ol class="timeline">${exps.map((x, i) => `<li><button data-action="exp" data-i="${i}" aria-current="${i === selectedExp}"><span class="dot" style="background:${x.color}"></span>${esc(x.company)}</button></li>`).join('')}</ol>
      <div class="exp-card">
        <h3>${esc(e.company)}</h3>
        <p class="muted">${[e.role, e.via, e.period].filter(Boolean).map(esc).join(', ')}</p>
        <h4>Produk yang dikerjakan</h4><ul>${e.products.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <h4>Fokus dan dampak</h4><ul>${e.impact.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`;
  },
  war(){
    const cols = CONFIG.columns;
    const colHtml = cols.map((c, ci) => {
      const jobs = state.jobs.filter(j => j.col === c.id);
      return `<section class="col"><h3>${esc(c.name)} <span class="count">${jobs.length}</span></h3>
        ${jobs.length ? jobs.map(j => `<div class="job${c.id === 'offer' ? ' offer' : ''}">
          <div><strong>${esc(j.company)}</strong><span>${esc(j.role)}</span></div>
          <button class="icon" data-action="move" data-id="${esc(j.id)}" data-dir="-1" aria-label="Pindah ke ${ci ? esc(cols[ci - 1].name) : ''}" ${ci === 0 ? 'disabled' : ''}>‹</button>
          <button class="icon" data-action="move" data-id="${esc(j.id)}" data-dir="1" aria-label="Pindah ke ${ci < cols.length - 1 ? esc(cols[ci + 1].name) : ''}" ${ci === cols.length - 1 ? 'disabled' : ''}>›</button>
          <button class="icon" data-action="del" data-id="${esc(j.id)}" aria-label="Hapus ${esc(j.company)}">×</button>
          ${isStale(j) ? `<div class="fu"><span class="stale">Belum ada kabar ${daysSince(j.since)} hari</span>${sampleNs ? `<button class="btn small" data-action="followup" data-id="${esc(j.id)}">${state.drafts['followup:' + j.id] ? 'Lihat draft follow-up' : 'Draft follow-up'}</button>` : ''}</div>` : ''}
        </div>`).join('') : `<p class="empty">Kosong.</p>`}</section>`;
    }).join('');
    const H = CONFIG.hunt, all = state.found.filter(f => f.status === 'new' && f.lane !== 'freelance');
    const list = all.filter(f => f.score >= findFilter).sort((a, b) => b.score - a.score).slice(0, 25);
    const hunters = agents.filter(a => a.cfg.hunt);
    const findHtml = `<div class="hunt">
        <div class="hunt-status"><span class="pulse${hunt.on ? ' on' : ''}"></span>${hunt.busy && hunt.who ? esc(hunt.who.cfg.name) + ' sedang mencari di Indeed' : hunt.on ? 'Perburuan otomatis aktif' : 'Perburuan otomatis mati'}</div>
        <p class="muted" style="font-size:13px!important">${state.stats.searches} pencarian, terakhir ${ago(state.stats.lastAt)}.</p>
        <details class="how"><summary>Cara kerja agen</summary><p>${hunters.map(a => esc(a.cfg.name)).join(', ')} mencari di Indeed bergantian tiap tiba di War Room (paling cepat tiap ${H.intervalSec} detik) dan membaca detail 3 lowongan teratas. Rani dan Sari memburu pekerjaan tetap, Nia khusus kontrak dan freelance remote. Bima menilai kecocokannya dengan CV-mu memakai Claude. Agen tidak melamar atas namamu.</p></details>
        <details class="how"><summary>Atur kata kunci pencarian</summary>
          ${hunters.map(a => { const c = state.huntCfg[a.cfg.id] || { queries: [], locations: [] }; return `<div class="cfgbox"><strong style="font-size:14px">${esc(a.cfg.name)}, ${esc(a.cfg.role)}</strong>
            <label>Kata kunci (satu per baris)<textarea id="hq-${a.cfg.id}" rows="4" data-action="hq" data-id="${a.cfg.id}">${esc(c.queries.join('\n'))}</textarea></label>
            <label>Lokasi (pisahkan koma, boleh remote)<input type="text" id="hl-${a.cfg.id}" data-action="hl" data-id="${a.cfg.id}" value="${esc(c.locations.join(', '))}"></label></div>`; }).join('')}
        </details>
        <div class="row"><button class="btn ${hunt.on ? '' : 'primary'} small" data-action="hunt">${hunt.on ? 'Hentikan perburuan' : 'Mulai berburu kerja'}</button>
        ${list.some(f => f.by !== 'claude') && sampleNs ? '<button class="btn small" data-action="rescore">Nilai ulang dengan Claude</button>' : ''}
        ${state.found.length && dlNs ? '<button class="btn small" data-action="export">Unduh daftar (CSV)</button>' : ''}
        ${sampleNs && (state.found.length || state.jobs.length) ? `<button class="btn small" data-action="advice" ${advice.busy ? 'disabled' : ''}>${advice.busy ? 'Bima sedang berpikir…' : 'Minta saran langkah berikutnya'}</button>` : ''}</div>
        ${advice.text ? `<div class="advice">${esc(advice.text)}</div>` : ''}${advice.err ? `<div class="alert">${esc(advice.err)}</div>` : ''}
        ${hunt.error ? `<div class="alert">${esc(hunt.error)}</div>` : ''}
        ${hunt.sampleNote ? `<div class="alert">${esc(hunt.sampleNote)}</div>` : ''}
      </div>
      <h3>Temuan agen <span class="count">${all.length}</span></h3>
      ${all.length ? `<div class="filters" role="group" aria-label="Saring skor">${[[0, 'Semua'], [55, 'Skor 55+'], [75, 'Skor 75+']].map(([v, n]) => `<button data-action="filter" data-v="${v}" aria-pressed="${findFilter === v}">${n}</button>`).join('')}</div>` : ''}
      ${list.length ? list.map(findCard).join('')
        : `<p class="empty">${all.length ? 'Tidak ada temuan dengan skor setinggi ini.' : hunt.on ? 'Belum ada temuan. Para pemburu akan melapor di sini.' : 'Klik "Mulai berburu kerja" supaya agen mencarikan lowongan.'}</p>`}
      <h3>Papan lamaran</h3>`;
    return `${draftCard('war')}${findHtml}${colHtml}
      <h3>Tambah lowongan</h3>
      <div class="form">
        <input type="text" id="jobCompany" placeholder="Perusahaan" aria-label="Perusahaan">
        <input type="text" id="jobRole" placeholder="Posisi" aria-label="Posisi">
        <select id="jobCol" aria-label="Kolom">${cols.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <button class="btn primary" data-action="add">Tambah lowongan</button>
      </div>`;
  },
  free(){
    const f = state.freelance, done = f.checklist.filter(x => x.done).length;
    const plat = (k, n) => `<div class="platform"><strong>${n}</strong>
      <label class="field" style="margin-top:8px">Status profil
        <select data-action="platform" data-p="${k}">${PROFILE_STATUS.map(s => `<option ${s === f.platforms[k] ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>`;
    const gigs = state.found.filter(x => x.lane === 'freelance' && x.status === 'new').sort((a, b) => b.score - a.score).slice(0, 8);
    const kept = state.found.filter(x => x.lane === 'freelance' && x.status === 'kept');
    const prodOpts = CONFIG.experiences.flatMap((e, i) => e.products.map((pr, j) => `<option value="${i}:${j}">${esc(e.short)}: ${esc(pr.length > 44 ? pr.slice(0, 42) + '…' : pr)}</option>`)).join('');
    return `${draftCard('free')}${plat('dribbble', 'Dribbble')}${plat('upwork', 'Upwork')}
      <h3>Copywriting portfolio</h3>
      ${sampleNs ? `<div class="row" style="margin-top:0"><button class="btn small" data-action="upwork">Buat bio Upwork</button></div>
        <div class="form" style="grid-template-columns:1fr auto"><select id="capProduct" aria-label="Produk untuk caption Dribbble">${prodOpts}</select><button class="btn small" data-action="dribbble">Caption Dribbble</button></div>`
        : '<p class="empty">Fitur ini butuh akses Claude di tampilan ini.</p>'}
      <h3>Peluang kontrak dari Nia <span class="count">${gigs.length}</span></h3>
      ${gigs.length ? gigs.map(findCard).join('') : `<p class="empty">${hunt.on ? 'Nia belum menemukan peluang kontrak.' : 'Mulai perburuan supaya Nia mencari proyek kontrak remote.'}</p>`}
      ${kept.length ? `<h3>Disimpan <span class="count">${kept.length}</span></h3>${kept.map(x => `<div class="job"><div><strong>${esc(x.company)}</strong><span>${esc(x.title)}</span></div>${safeUrl(x.url) ? `<a class="btn small" href="${esc(x.url)}" target="_blank" rel="noopener">Buka</a>` : ''}</div>`).join('')}` : ''}
      <h3>Checklist portfolio <span class="count">${done}/${f.checklist.length}</span></h3>
      <div class="bar"><i style="width:${f.checklist.length ? done / f.checklist.length * 100 : 0}%"></i></div>
      ${f.checklist.map((c, i) => `<label class="check${c.done ? ' done' : ''}"><input type="checkbox" data-action="check" data-i="${i}" ${c.done ? 'checked' : ''}><span>${esc(c.t)}</span></label>`).join('')}
      <div class="form" style="grid-template-columns:1fr auto"><input type="text" id="newCheck" placeholder="Item checklist baru" aria-label="Item checklist baru"><button class="btn small" data-action="addcheck">Tambah</button></div>
      <h3>Target penghasilan bulanan</h3>
      <p class="big">${rupiah(f.target)}</p>
      <label class="field">Ubah target (Rp)<input type="number" min="0" step="500000" data-action="ftarget" value="${Number(f.target) || 0}"></label>`;
  },
  lab(){
    return CONFIG.projects.map((_, i) => {
      const p = projectData(i);
      return `<div class="proj"><div class="proj-top"><strong>${esc(p.name)}</strong><span class="status" style="background:${STATUS_COLOR[p.status] || '#9FB0CC'}">${esc(p.status)}</span></div>
        <p class="muted">${esc(p.desc)}</p>
        <div class="form">
          <select data-action="pstatus" data-i="${i}" aria-label="Status ${esc(p.name)}">${STATUSES.map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <input type="url" data-action="plink" data-i="${i}" value="${esc(p.link)}" placeholder="Tempel link project" aria-label="Link ${esc(p.name)}">
          ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Buka ${esc(p.name)}</a>` : ''}
        </div></div>`;
    }).join('');
  },
  vault(){
    const v = state.vault, pct = v.target > 0 ? Math.min(100, v.current / v.target * 100) : 0;
    return `<p class="big">${rupiah(v.current)}</p>
      <p class="muted">dari target ${rupiah(v.target)} (${Math.round(pct)}%)</p>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <h3>Catat pemasukan</h3>
      <div class="form" style="grid-template-columns:1fr auto"><input type="number" min="0" step="100000" id="vaultAdd" placeholder="Jumlah (Rp)" aria-label="Jumlah pemasukan"><button class="btn primary small" data-action="vadd">Masukkan ke brankas</button></div>
      <h3>Atur angka</h3>
      <div class="form">
        <label class="field">Terkumpul (Rp)<input type="number" min="0" data-action="vcurrent" value="${Number(v.current) || 0}"></label>
        <label class="field">Target (Rp)<input type="number" min="0" data-action="vtarget" value="${Number(v.target) || 0}"></label>
      </div>`;
  }
};
function renderAgentPanel(ag){
  const paused = agentsPaused || ag.paused;
  const now = paused ? 'Sedang jeda' : ag.mode === 'walk' ? `Jalan ke ${zoneName(ag.next)}` : ag.task;
  return `<p class="lede"><span class="agent-swatch" style="background:${ag.cfg.color}"></span>${esc(ag.cfg.role)}</p>
    <h3>Sedang dikerjakan</h3><p>${esc(now)}</p>
    <h3>Wilayah kerja</h3><ul class="chips">${ag.cfg.zones.map(z => `<li>${esc(zoneName(z))}</li>`).join('')}</ul>
    <h3>Riwayat tugas</h3>
    ${ag.history.length ? `<ul>${ag.history.map(h => `<li><span class="muted">${h.hhmm}</span> ${esc(h.text)}</li>`).join('')}</ul>` : '<p class="empty">Belum ada tugas selesai.</p>'}
    <div class="row">
      <button class="btn primary small" data-action="agentpause" data-id="${ag.cfg.id}">${ag.paused ? 'Lanjutkan agen ini' : 'Jeda agen ini'}</button>
      <button class="btn small" data-action="follow" data-id="${ag.cfg.id}">${follow === ag.cfg.id ? 'Berhenti mengikuti' : 'Ikuti dengan kamera'}</button>
    </div>`;
}
function renderPanel(){
  if (!currentZone) return;
  const top = panelBody.scrollTop, keep = {};
  panelBody.querySelectorAll('input[id],textarea[id],select[id]').forEach(el => { if (el.id !== 'draftText') keep[el.id] = el.value; });
  const ae = document.activeElement, fid = ae && panelBody.contains(ae) && ae.id ? ae.id : null;
  const sel = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  if (currentZone.startsWith('agent:')){
    const ag = agentById(currentZone.slice(6));
    panelTitle.textContent = ag.cfg.name; panelBody.innerHTML = renderAgentPanel(ag);
  } else {
    panelTitle.textContent = zones[currentZone].name;
    panelBody.innerHTML = RENDER[currentZone]();
    Object.keys(keep).forEach(id => { const el = panelBody.querySelector('#' + CSS.escape(id)); if (el) el.value = keep[id]; });
  }
  if (fid){ const el = panelBody.querySelector('#' + CSS.escape(fid)); if (el){ el.focus(); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (_) {} } } }
  panelBody.scrollTop = top;
}
function commit(){ saveState(); refreshTextures(); renderPanel(); }
function refreshTextures(){ textures.forEach(t => { if (t !== clockTex && t !== cityTex && t !== floorTex) t.redraw(); }); }

panelBody.addEventListener('click', e => {
  const go = e.target.closest('[data-go]'); if (go) return openZone(go.dataset.go);
  const ab = e.target.closest('[data-agent]'); if (ab) return openAgent(ab.dataset.agent);
  const b = e.target.closest('[data-action]'); if (!b || ['INPUT', 'SELECT', 'TEXTAREA'].includes(b.tagName)) return;
  const a = b.dataset.action;
  if (a === 'exp'){ selectedExp = +b.dataset.i; renderPanel(); return; }
  if (a === 'agentpause'){ const ag = agentById(b.dataset.id); ag.paused = !ag.paused; renderPanel(); return; }
  if (a === 'follow'){ follow = follow === b.dataset.id ? null : b.dataset.id; renderPanel(); return; }
  if (a === 'hunt'){ hunt.on ? stopHunt() : startHunt(); return; }
  if (a === 'filter'){ findFilter = +b.dataset.v; renderPanel(); return; }
  if (a === 'export'){ exportCsv(); return; }
  if (a === 'advice'){ askAdvice(); return; }
  if (a === 'rescore'){ hunt.sampleOff = false; hunt.sampleNote = ''; runScoring(agentById('curator')); renderPanel(); return; }
  if (a === 'cover'){ const f = state.found.find(x => x.key === b.dataset.key); if (f){ const kind = f.lane === 'freelance' ? 'proposal' : 'cover'; makeDraft(kind, { f }, currentZone, `${kind === 'cover' ? 'Surat lamaran' : 'Proposal'}: ${f.company}`, kind + ':' + f.key); } return; }
  if (a === 'followup'){ const j = state.jobs.find(x => x.id === b.dataset.id); if (j) makeDraft('followup', { j }, 'war', `Follow-up: ${j.company}`, 'followup:' + j.id); return; }
  if (a === 'upwork'){ makeDraft('upwork', {}, 'free', 'Bio profil Upwork', 'upwork'); return; }
  if (a === 'dribbble'){ const v = (panelBody.querySelector('#capProduct') || {}).value || '0:0', [i, j] = v.split(':').map(Number), exp = CONFIG.experiences[i];
    if (exp) makeDraft('dribbble', { exp, product: exp.products[j] }, 'free', `Caption Dribbble: ${exp.short}`, 'dribbble:' + v); return; }
  if (a === 'draftclose'){ draft.zone = null; draft.text = ''; draft.err = ''; renderPanel(); return; }
  if (a === 'draftcopy'){ copyDraft(); return; }
  if (a === 'draftdl'){ downloadDraft(); return; }
  if (a === 'draftredo'){ makeDraft(draft.kind, draft.ctx, draft.zone, draft.title, draft.key, true); return; }
  if (a === 'keep' || a === 'dismiss'){
    const f = state.found.find(x => x.key === b.dataset.key); if (!f) return;
    f.status = a === 'keep' ? 'kept' : 'dismissed';
    if (a === 'keep' && f.lane !== 'freelance') state.jobs.push({ id: 'j' + Date.now(), company: f.company, role: f.title, col: 'incaran', since: Date.now() });
  }
  if (a === 'move'){
    const j = state.jobs.find(x => x.id === b.dataset.id), ids = CONFIG.columns.map(c => c.id);
    const ni = ids.indexOf(j.col) + Number(b.dataset.dir);
    if (ni >= 0 && ni < ids.length){ const was = j.col; j.col = ids[ni]; j.since = Date.now(); if (j.col === 'offer' && was !== 'offer') celebrate(`Selamat! Tahap Offer di ${j.company}`); }
  }
  if (a === 'del') state.jobs = state.jobs.filter(x => x.id !== b.dataset.id);
  if (a === 'add'){
    const company = document.getElementById('jobCompany').value.trim(), role = document.getElementById('jobRole').value.trim();
    if (!company){ document.getElementById('jobCompany').focus(); return; }
    state.jobs.push({ id: 'j' + Date.now(), company, role: role || 'Posisi belum diisi', col: document.getElementById('jobCol').value, since: Date.now() });
  }
  if (a === 'addcheck'){
    const t = document.getElementById('newCheck').value.trim(); if (!t) return;
    state.freelance.checklist.push({ t, done: false });
  }
  if (a === 'vadd'){
    const n = Number(document.getElementById('vaultAdd').value); if (!(n > 0)) return;
    const before = Number(state.vault.current) || 0; state.vault.current = before + n;
    if (before < state.vault.target && state.vault.current >= state.vault.target) celebrate('Target brankas tercapai!');
  }
  commit();
});
panelBody.addEventListener('change', e => {
  const el = e.target, a = el.dataset.action; if (!a) return;
  if (a === 'platform') state.freelance.platforms[el.dataset.p] = el.value;
  if (a === 'check') state.freelance.checklist[+el.dataset.i].done = el.checked;
  if (a === 'ftarget') state.freelance.target = Math.max(0, Number(el.value) || 0);
  if (a === 'pstatus') state.projects[+el.dataset.i].status = el.value;
  if (a === 'plink'){ const v = el.value.trim(); state.projects[+el.dataset.i].link = /^https?:\/\//i.test(v) || !v ? v : 'https://' + v; }
  if (a === 'vcurrent'){ const before = state.vault.current; state.vault.current = Math.max(0, Number(el.value) || 0); if (before < state.vault.target && state.vault.current >= state.vault.target) celebrate('Target brankas tercapai!'); }
  if (a === 'hq' && state.huntCfg[el.dataset.id]){ state.huntCfg[el.dataset.id].queries = el.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 14); state.huntIdx[el.dataset.id] = 0; }
  if (a === 'hl' && state.huntCfg[el.dataset.id]){ state.huntCfg[el.dataset.id].locations = el.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 6); state.huntIdx[el.dataset.id] = 0; }
  if (a === 'vtarget') state.vault.target = Math.max(0, Number(el.value) || 0);
  commit();
});
panelBody.addEventListener('input', e => {
  if (e.target.id !== 'draftText') return;
  draft.text = e.target.value;
  if (state.drafts[draft.key]){ state.drafts[draft.key].text = draft.text; clearTimeout(draftSaveT); draftSaveT = setTimeout(saveState, 1200); }
});
panelBody.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const map = { jobCompany: 'add', jobRole: 'add', newCheck: 'addcheck', vaultAdd: 'vadd' };
  const act = map[e.target.id]; if (act) panelBody.querySelector(`[data-action="${act}"]`).click();
});

/* =====================================================================
   LOOP
   ===================================================================== */
const shift = { x: 0, y: 0 }, tmp = new THREE.Vector3();
let lastSecond = -1, lastT = performance.now();
function onResize(){
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (!currentZone && !tween) { view.radius = Math.max(view.radius, overviewRadius() * 0.6); clampView(); }
}
window.addEventListener('resize', onResize);

function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  agents.forEach(a => updateAgent(a, dt, now / 1000));
  if (follow && !tween && !pointers.size){
    const p = agentById(follow).group.position;
    view.target.x += (p.x - view.target.x) * 0.06; view.target.z += (p.z - view.target.z) * 0.06; view.target.y += (1.2 - view.target.y) * 0.06;
  }
  stepTween(now); applyView();

  // geser frame agar zona tidak tertutup panel
  const open = panel.classList.contains('open'), desk = innerWidth > 720;
  const tx = open && desk ? (panel.offsetWidth + 16) / 2 : 0, ty = open && !desk ? panel.offsetHeight / 2 : 0;
  const k = reduceMotion ? 1 : 1 - Math.exp(-Math.max(dt, 0.016) * 7);
  shift.x += (tx - shift.x) * k; shift.y += (ty - shift.y) * k;
  camera.setViewOffset(innerWidth, innerHeight, shift.x, shift.y, innerWidth, innerHeight);

  // detail hidup: monitor berkedip pelan, tanaman bergoyang, jam
  if (!reduceMotion){
    const t = now / 1000;
    screens.forEach((s, i) => s.material.color.setScalar(0.88 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7))));
    plants.forEach((p, i) => { p.rotation.z = Math.sin(t * 0.8 + i) * 0.025; });
    wheel.rotation.z = Math.sin(t * 0.4) * 0.3;
  }
  const sec = new Date().getSeconds();
  if (sec !== lastSecond){ lastSecond = sec; clockTex.redraw(); }

  // reaksi ruangan: lampu peringatan temuan 90+, brankas bersinar saat target tercapai, konfeti
  const tt = now / 1000;
  const hot = state.found.some(f => f.status === 'new' && !f.seen && f.score >= 90);
  alertLamp.material.emissiveIntensity = hot ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(tt * 6)) : 0.05;
  const vdone = state.vault.target > 0 && state.vault.current >= state.vault.target;
  door.material.emissive.set(vdone ? '#E8B54A' : '#000000'); door.material.emissiveIntensity = vdone ? 0.35 + 0.25 * Math.sin(tt * 3) : 0;
  if (confetti.active) stepConfetti(dt);

  updateBubbles();
  if (hovered){
    if (zones[hovered]) tmp.copy(zones[hovered].anchor);
    else { tmp.copy(agentById(hovered.slice(6)).group.position); tmp.y += 2.9; }
    tmp.project(camera);
    labelEl.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    labelEl.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
  }
  renderer.render(scene, camera);
}
applyView();
requestAnimationFrame(loop);

// gambar ulang tekstur setelah font siap, lalu sembunyikan loading
const fontReady = document.fonts ? Promise.race([document.fonts.load(font(800, 40)).then(() => document.fonts.ready), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
agents.forEach(a => logAgent(a, `Mulai shift di ${zoneName(a.zone)}`));
initSync();
fontReady.catch(() => {}).then(() => {
  textures.forEach(t => t.redraw());
  document.getElementById('loading').classList.add('hide');
});
