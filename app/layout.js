import './globals.css';

export const metadata = {
  title: 'Markas Cari Cuan',
  description: 'Kantor 3D interaktif: pusat berburu kerja, freelance, dan showcase pengalaman.',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: 'dark', themeColor: '#0E1A2E' };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
