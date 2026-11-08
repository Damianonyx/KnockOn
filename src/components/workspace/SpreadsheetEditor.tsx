'use client';
/**
 * Mounts the real Univer spreadsheet. Loaded with next/dynamic (ssr: false) so
 * Univer UI code never runs during server rendering. The parent receives the
 * adapter through onReady and drives everything through it.
 */
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
import '@univerjs/sheets-formula-ui/lib/index.css';
import { useEffect, useRef } from 'react';
import { BrowserWorkbookAdapter } from '@/lib/univer/browser/adapter';

export default function SpreadsheetEditor({
  license,
  onReady,
  onError,
}: {
  license: string;
  onReady: (adapter: BrowserWorkbookAdapter | null) => void;
  onError: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const container = document.createElement('div');
    container.style.height = '100%';
    host.appendChild(container);
    let adapter: BrowserWorkbookAdapter | null = null;
    try {
      adapter = new BrowserWorkbookAdapter({ container, license });
      onReadyRef.current(adapter);
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : 'The spreadsheet could not start.');
    }
    return () => {
      onReadyRef.current(null);
      // Univer renders its own React root; dispose it after React finishes this commit.
      const toDispose = adapter;
      setTimeout(() => {
        toDispose?.dispose();
        container.remove();
      }, 0);
    };
  }, [license]);

  return <div ref={hostRef} style={{ height: '100%' }} data-testid="univer-host" />;
}
