import './globals.css';

export const metadata = {
  title: 'Ферма · Смени',
  description: 'Чекване на работа за работниците във фермата',
  appleWebApp: { capable: true, title: 'Смени', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f4f1ea',
};

export default function RootLayout({ children }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  );
}
