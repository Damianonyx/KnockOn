import Link from 'next/link';
import type { ReactNode } from 'react';

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/projects" className="brand" aria-label="KnockOn, all projects">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/knockon-icon.svg" alt="" width={30} height={30} />
        <span>KnockOn</span>
      </Link>
      {children}
    </header>
  );
}
