import Link from 'next/link';
import { AppHeader } from '@/components/ui/AppHeader';
import { KnockyPose } from '@/components/ui/KnockyPose';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <>
      <AppHeader />
      <main className="page">
        <div className="center-state">
          <KnockyPose pose="whoa" width={180} />
          <h1 style={{ color: 'var(--text)' }}>This page doesn’t exist.</h1>
          <Link href="/projects" className="btn btn-primary">
            Go to your projects
          </Link>
        </div>
      </main>
    </>
  );
}
