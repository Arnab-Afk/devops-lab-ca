import './globals.css';

export const metadata = { title: 'DevOps Chat', description: 'Simple chat with email signup' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
