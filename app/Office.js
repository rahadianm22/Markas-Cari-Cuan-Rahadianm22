'use client';
import { useEffect } from 'react';
import { MARKUP } from './markup';

// Urutan muat: Three.js -> config (data) -> app (scene, agen, panel).
const SCRIPTS = ['/vendor/three.min.js', '/js/config.js', '/js/app.js'];

function load(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Gagal memuat ' + src));
    document.body.appendChild(el);
  });
}

export default function Office() {
  useEffect(() => {
    // Strict Mode menjalankan effect dua kali di dev; scene hanya boleh dibuat sekali.
    if (window.__markasStarted) return;
    window.__markasStarted = true;
    (async () => {
      try {
        for (const src of SCRIPTS) await load(src);
      } catch (e) {
        const p = document.querySelector('#loading p');
        if (p) p.textContent = e.message;
        window.__markasStarted = false;
      }
    })();
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
