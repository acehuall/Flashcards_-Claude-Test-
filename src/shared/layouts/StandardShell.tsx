import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { ToastContainer } from '../components/Toast';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import { PWAPrompts } from '../components/PWAPrompts';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';

const navItems = [
  {
    to: '/',
    label: 'Home',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 19h16M7 15l3-3 3 2 4-6 3 4" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

interface StandardShellProps {
  children: React.ReactNode;
}

export function StandardShell({ children }: StandardShellProps) {
  const { user, isLocalOnly } = useAuth();
  const { status } = useSync();

  // Show the offline banner only when sync matters — i.e. Supabase is wired up and someone is signed in
  const showOfflineBanner = !isLocalOnly && !!user && status === 'offline';

  return (
    <div className="min-h-screen bg-app-bg flex flex-col">
      {/* Top bar — padded for safe-area on iOS notch devices */}
      <header className="sticky top-0 z-40 border-b border-app-border-strong/75 bg-app-bg-alt/88 backdrop-blur-md pt-safe-top">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-app-primary font-bold text-lg hover:opacity-80 transition-opacity"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-primary/5">
              <img src="/icons/Icon-128.png" alt="" className="h-5 w-5 object-contain" aria-hidden="true" />
            </span>
            <span>Flashcards</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main navigation">
            <SyncStatusBadge />
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg-alt',
                    isActive
                      ? 'bg-app-nav text-app-accent-ink shadow-[0_0_0_1px_rgb(var(--app-nav-dark))_inset]'
                      : 'text-app-secondary hover:bg-app-surface-2/80 hover:text-app-primary',
                  )
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content — bottom padding ensures banners don't obscure content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 pb-safe-bottom">
        {children}
      </main>

      {/* Toast host */}
      <ToastContainer />

      {/* PWA: install prompt, update prompt, offline banner */}
      <PWAPrompts showOfflineBanner={showOfflineBanner} />
    </div>
  );
}
