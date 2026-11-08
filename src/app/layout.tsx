import type { ReactNode } from 'react';

export const metadata = {
  title: 'Knock-On',
  description: 'See what one change sets in motion.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
