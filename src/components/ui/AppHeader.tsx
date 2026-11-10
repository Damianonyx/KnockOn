import Link from 'next/link';
import type { ReactNode } from 'react';

/** The app's top bar. Pages without their own header content get a link to the documentation. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="app-header">
      <Link href="/projects" className="brand" aria-label="KnockOn, all projects">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/knockon-icon.svg" alt="" width={30} height={30} />
        <span>KnockOn</span>
      </Link>
      {children ?? (
        <Link href="/docs" className="header-link">
          Docs
        </Link>
      )}
    </header>
  );
}
