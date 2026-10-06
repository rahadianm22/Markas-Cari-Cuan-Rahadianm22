/* =====================================================================
   DATA / CONFIG  — edit semua isi di sini
   ===================================================================== */
const CONFIG = {
  profile: {
    name: 'Rahadian Maulana',
    role: 'Senior Product Designer',
    years: '5+ tahun',
    location: 'Jakarta, Indonesia',
    email: 'rahadianm22@gmail.com',
    site: 'rahadianm22.my.id',
    tagline: 'Produk fintech dan perbankan: workflow multi-role, dashboard operasional, dan design system.',
    skills: ['Design system', 'Design tokens', 'Workflow multi-role', 'Dashboard data-heavy', 'Usability testing', 'Design QA', 'Figma-to-code (Claude Code)', 'Fintech & banking']
  },
  // Ringkasan CV: dipakai Vestia untuk menilai lowongan dan oleh Claude untuk menulis draft
  cv: `Rahadian Maulana, Senior Product Designer, 5+ years in regulated fintech and digital banking, Jakarta, Indonesia. Languages: Indonesian (native), English (intermediate). Email rahadianm22@gmail.com, site rahadianm22.my.id.
Strengths: untangling fragmented, highly technical requirements into product logic for both end users and back-office operators: multi-role approval flows, dense operational dashboards, edge-case mapping, design token architecture, design QA, usability testing. Picking up AI-assisted design-to-code (Claude Code) and enough front-end coding to prototype interactions.
Experience:
- Senior Product Designer, Bank Rakyat Indonesia (BRI), Dec 2023 - Jul 2026. BRISPOT internal lending platform (Briguna personal loan and KPR mortgage): redesigned the multi-role approval workflow (Initiator, Approver, Credit Admin Officer, plus ARCI risk engine and Early Warning System logic), cutting approval time from about 3 weeks to 3-5 days; Whitelist and cross-bank Open Flagging modules; UI side of moving the Checker & Signer disbursement modules from legacy to React behind single sign-on; helped scale the enterprise design system with variable tokens; KPR Digital notary order workflow and an RBAC-based national quota allocation system. BRImo and QITA super apps: credit card and installment conversion, debit card issuance journey, standardized biller payment components, lifestyle features, regular design QA with engineering. BUMDes BRI digital platform for rural users: flatter navigation, design system with tokens and components.
- Product Designer, Bank Syariah Indonesia (BSI), Aug 2022 - Jul 2023. BYOND by BSI mobile banking app after the three-bank merger: took over and rebuilt the enterprise design system and component library, ran usability tests that shaped the post-rebrand roadmap, reorganized Figma files around product epics.
- UI/UX Designer, Infosys Solusi Terpadu, Mar 2021 - May 2022. BTN retail banking app (mobile and web design system with documentation, user flows, wireframes, clickable prototypes), BTN Syariah (design system migration, key screens, 3D icons in Blender), CIMB ATM network monitoring dashboard (flows, sitemap, table-heavy screens).
- Co-Founder and UI/UX Designer, Malline Indonesia, Sep 2019 - Feb 2021. E-commerce website on WordPress: end-to-end shopping experience and admin dashboard, surveys and usability tests.
Tools: Figma, FigJam, Variable Tokens, Auto Layout, Jira, Confluence, Notion, Adobe XD, Blender.`,
  // Urutan = timeline (terbaru di atas)
  experiences: [
    { short: 'BRI', company: 'Bank Rakyat Indonesia', role: 'Senior Product Designer', via: 'via PT Bringin Inti Teknologi', period: 'Des 2023 – Jul 2026', color: '#2F6FD6',
      products: ['BRISPOT, platform kredit internal (Briguna dan KPR)', 'BRImo dan QITA: kartu kredit, konversi cicilan, kartu debit, biller, lifestyle', 'KPR Digital: order notaris dan alokasi kuota nasional (RBAC)', 'BUMDes BRI, platform digital untuk pengguna pedesaan', 'BRI Enterprise Design System (variable tokens)'],
      impact: ['Memangkas waktu persetujuan kredit dari sekitar 3 minggu menjadi 3-5 hari lewat redesign workflow Initiator, Approver, dan Credit Admin Officer', 'Memimpin sisi UI migrasi modul Checker & Signer dari infrastruktur legacy ke React tanpa mengganggu tim operasional', 'Membantu memindahkan gaya satuan menjadi sistem berbasis token yang dipakai banyak squad', 'Menyederhanakan alur konversi cicilan kartu kredit untuk menurunkan drop-off', 'Merancang navigasi lebih datar untuk pengguna BUMDes di pedesaan'] },
    { short: 'BSI', company: 'Bank Syariah Indonesia', role: 'Product Designer', via: '', period: 'Agu 2022 – Jul 2023', color: '#1E9E8F',
      products: ['BYOND by BSI, aplikasi mobile banking pasca merger tiga bank'],
      impact: ['Mengambil alih dan membangun ulang enterprise design system serta library komponen', 'Menjalankan usability testing yang membentuk roadmap pasca rebrand', 'Menata ulang file Figma berdasarkan epic produk agar desainer baru cepat paham'] },
    { short: 'Infosys', company: 'Infosys Solusi Terpadu', role: 'UI/UX Designer', via: '', period: 'Mar 2021 – Mei 2022', color: '#5B6FD8',
      products: ['BTN Conventional (bale by BTN), aplikasi mobile dan web', 'BTN Syariah, adaptasi layanan inti ke brand syariah', 'CIMB ATM, dashboard monitoring jaringan ATM'],
      impact: ['Membangun design system Figma dan dokumentasinya untuk produk mobile dan web', 'Membuat prototipe interaktif untuk presentasi klien', 'Mendesain layar padat tabel agar tim operasional mudah memindai data besar', 'Membuat ikon 3D di Blender untuk BTN Syariah'] },
    { short: 'Malline', company: 'Malline Indonesia', role: 'Co-Founder dan UI/UX Designer', via: '', period: 'Sep 2019 – Feb 2021', color: '#C9862F',
      products: ['Website e-commerce Malline (WordPress)', 'Dashboard admin'],
      impact: ['Merancang pengalaman belanja dari home sampai checkout', 'Menjalankan survei dan usability test untuk keputusan produk awal'] }
  ],
  columns: [
    { id: 'incaran', name: 'Incaran' }, { id: 'melamar', name: 'Melamar' },
    { id: 'interview', name: 'Interview' }, { id: 'tes', name: 'Tes' }, { id: 'offer', name: 'Offer' }
  ],
  jobs: [
    { id: 'adisena', company: 'Adisena', role: 'Product Owner Senior', col: 'incaran' },
    { id: 'axonect', company: 'Axonect / Axiata', role: 'UI/UX Engineer', col: 'incaran' },
    { id: 'ina', company: 'INA Digital / Peruri', role: 'Product Designer', col: 'melamar' },
    { id: 'bjak', company: 'BJAK', role: 'Design challenge', col: 'tes' }
  ],
  freelance: {
    platforms: { dribbble: 'Draft', upwork: 'Belum dibuat' },
    target: 10000000, // Rp per bulan
    checklist: [
      'Pilih 6 case study terbaik',
      'Tulis caption Dribbble untuk tiap shot',
      'Siapkan blurb profil Upwork',
      'Tentukan rate per jam',
      'Unggah 3 shot pertama',
      'Kirim 5 proposal pertama'
    ]
  },
  projects: [
    { id: 'natuna', name: 'Natuna Digilab', desc: 'Brand design system dan tooling', status: 'Dibangun', link: '', color: '#2F6FD6' },
    { id: 'posly', name: 'Posly', desc: 'Monitor postur lewat webcam', status: 'Live', link: '', color: '#2FBF71' },
    { id: 'porsirun', name: 'PorsiRun', desc: 'Rencana latihan lari personal', status: 'Dibangun', link: '', color: '#E8B54A' },
    { id: 'kiko', name: 'Kiko', desc: 'Kids AI companion (hardware)', status: 'Prototipe', link: '', color: '#E9578F' }
  ],
  vault: { target: 120000000, current: 0 }, // Rp per tahun
  // Perburuan otomatis lewat konektor Indeed. Pemburu mencari tiap kali tiba di War Room
  hunt: { country: 'ID', intervalSec: 60, minToast: 75, staleDays: 7 },
  // Agen yang bergerak sendiri. zones = zona yang mereka kunjungi bergiliran
  agents: [
    { id: 'scout', name: 'Zeta', role: 'Pemburu loker (Indeed)', color: '#8A8F98', zones: ['war', 'lobby', 'hall'],
      hunt: { lane: 'kerja', queries: ['Product Designer', 'UI UX Designer'], locations: ['Australia', 'Malaysia'] } },
    { id: 'explorer', name: 'Jetto', role: 'Pemburu fintech dan bank', color: '#B79CED', zones: ['war', 'hall', 'free'],
      hunt: { lane: 'kerja', queries: ['Senior Product Designer', 'Lead Product Designer', 'UX Designer', 'UI Designer'], locations: ['Australia', 'Malaysia'] } },
    { id: 'freelancer', name: 'Asuka', role: 'Pemburu kontrak dan freelance', color: '#5B2A9E', zones: ['war', 'free', 'lab'],
      hunt: { lane: 'freelance', jobType: 'contract', queries: ['Product Designer', 'UI UX Designer', 'Design System', 'UX Designer'], locations: ['Australia', 'Malaysia'] } },
    { id: 'curator', name: 'Vestia', role: 'Penilai kecocokan', color: '#1A1A1F', zones: ['war', 'hall', 'free'] },
    { id: 'builder', name: 'Fumika', role: 'Builder side project', color: '#7CC8F2', zones: ['lab', 'free'] },
    { id: 'treasurer', name: 'Sagisawa', role: 'Bendahara cuan', color: '#1B3A8C', zones: ['vault', 'war', 'lobby'] }
  ]
};
