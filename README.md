# Markas Cari Cuan (Next.js)

Kantor 3D interaktif (Three.js r128) sebagai pusat berburu kerja, freelance, dan showcase pengalaman.
Next.js App Router, siap di-deploy ke Vercel tanpa konfigurasi tambahan.

## Jalankan lokal

```bash
npm install
npm run dev                  # http://localhost:3000
npm run build && npm start   # uji versi produksi
```

## Deploy ke Vercel

1. Taruh folder ini di repo GitHub (`git init`, commit, push).
2. Di vercel.com pilih **Add New > Project**, impor repo. Framework terdeteksi otomatis sebagai Next.js; tidak perlu mengubah setting.
3. Klik **Deploy**.

Atau lewat CLI: `npx vercel`, lalu `npx vercel --prod`.

## Struktur

```
app/layout.js        metadata, font Plus Jakarta Sans
app/page.js          halaman utama
app/Office.js        komponen klien: memuat Three.js, config, lalu app
app/markup.js        kerangka HTML (HUD, panel, navigasi)
app/globals.css      tema dan tata letak
public/js/config.js  SEMUA DATA: profil, CV, pengalaman, lowongan, proyek, agen  <- edit di sini
public/js/app.js     scene 3D, agen, mesin berburu, panel, penyimpanan
public/vendor/       Three.js r128 (lokal, tanpa CDN)
```

## Mengubah isi

Edit `public/js/config.js` (objek `CONFIG`): `profile`, `cv`, `experiences`, `columns`, `jobs`, `freelance`, `projects`, `vault`, `hunt`, `agents`. Push ke Git, Vercel membangun ulang otomatis.

## Beda dari versi artifact claude.ai

Pencarian Indeed, penilaian oleh Claude, sinkronisasi antar perangkat, dan unduhan memakai kemampuan runtime claude.ai (`window.claude`). Di Vercel fitur itu tidak aktif:

- Kantor 3D, agen, kanban lamaran, checklist freelance, brankas, dan pembuat draft tetap berfungsi.
- Data tersimpan di `localStorage` browser, per perangkat.
- Tombol berburu menampilkan pesan bahwa konektor Indeed tidak tersedia.

Untuk menghidupkan perburuan di Vercel: buat route handler (mis. `app/api/jobs/route.js`) yang memanggil API lowongan pilihanmu dengan kunci di Environment Variables Vercel, lalu ganti `mcpNs.callTool('Indeed', ...)` di fungsi `runSearch` (`public/js/app.js`) dengan `fetch('/api/jobs?...')`. Format yang dibaca `parseJobs` ada di file yang sama.
