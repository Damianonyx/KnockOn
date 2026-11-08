import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const SITE_URL = process.env.SITE_URL ?? 'https://www.knockon.tech';
const TITLE = 'KnockOn · See what one change sets in motion';
const DESCRIPTION =
  'Model a business in a real spreadsheet, introduce a change, and compare possible responses side by side, with every assumption visible.';

/**
 * Site-wide metadata, including link previews. The preview image comes from
 * src/app/opengraph-image.png and twitter-image.png (Next.js adds those tags,
 * with their size and alt text, automatically).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: '%s · KnockOn' },
  description: DESCRIPTION,
  applicationName: 'KnockOn',
  openGraph: { type: 'website', url: '/', siteName: 'KnockOn', title: TITLE, description: DESCRIPTION, locale: 'en_GB' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
