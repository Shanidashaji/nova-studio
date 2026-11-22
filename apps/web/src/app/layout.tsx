import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif, Playfair_Display } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'NOVA — Studio OS', template: '%s · NOVA' },
  description: 'NOVA — the intelligent operating system for a cinematic production studio.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0b0b' },
    { media: '(prefers-color-scheme: light)', color: '#f4eee5' },
  ],
};

/** Applies the saved theme before first paint to avoid a flash of the wrong theme. */
const themeScript = `try{var t=localStorage.getItem('nova-theme-v2');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${instrument.variable} ${playfair.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
