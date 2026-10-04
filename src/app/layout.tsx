import type { Metadata, Viewport } from 'next';
import './globals.css';
import './mobile.css';
export const metadata: Metadata = { title: 'QALIM tickTack — Your next move', description: 'A little board. A real opponent. Play two-player tic-tac-toe and revisit every match.', icons: { icon: '/favicon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f7f8f2' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
