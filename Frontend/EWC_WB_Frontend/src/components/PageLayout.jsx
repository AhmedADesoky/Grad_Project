/**
 * PageLayout — drop-in replacement for the old Sidebar+Navbar+ml-offset pattern.
 *
 * BEFORE (every page):
 *   <Sidebar />
 *   <Navbar />
 *   <div className={isCollapsed ? 'ml-20' : 'ml-64'}>
 *     <div className="max-w-7xl mx-auto px-4 py-8 pt-24"> ... </div>
 *   </div>
 *
 * AFTER:
 *   <PageLayout> ... </PageLayout>
 *
 * Props:
 *   maxWidth  — Tailwind max-w class (default 'max-w-7xl')
 *   className — extra classes on the inner container
 *   noPadding — skip the default px/py if you want full bleed sections
 */
import React from 'react';
import { Navbar } from './Navbar';

export function PageLayout({
  children,
  maxWidth  = 'max-w-7xl',
  className = '',
  noPadding = false,
}) {
  return (
    <div className="min-h-screen page-bg text-foreground transition-colors">
      <Navbar />

      {/* 60px = h-[60px] navbar */}
      <main className="pt-[60px]">
        <div
          className={[
            maxWidth,
            'mx-auto',
            noPadding ? '' : 'px-4 sm:px-6 py-8',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </div>
      </main>
    </div>
  );
}