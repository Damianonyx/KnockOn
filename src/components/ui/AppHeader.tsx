import Link from 'next/link';
import type { ReactNode } from 'react';

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/projects" className="brand" aria-label="Knock-On, all projects">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/knock-on-icon.svg" alt="" width={30} height={30} />
        <span>Knock-On</span>
        <span className="tagline">See what one change sets in motion.</span>
      </Link>
      {children}
    </header>
  );
}
