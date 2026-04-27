import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="app-elevated-panel w-full max-w-lg rounded-2xl border border-app-border-strong/75 bg-app-surface/92 p-4 backdrop-blur">
        <p className="text-sm text-app-primary">
          {needRefresh
            ? 'A new version is available.'
            : 'App is ready for offline use.'}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {needRefresh && (
            <button
              type="button"
              className="rounded-lg bg-app-nav px-3 py-1.5 text-sm font-medium text-app-accent-ink transition hover:bg-app-nav-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"
              onClick={() => updateServiceWorker(true)}
            >
              Update now
            </button>
          )}

          <button
            type="button"
            className="rounded-lg border border-app-border px-3 py-1.5 text-sm font-medium text-app-primary transition hover:border-app-border-strong hover:bg-app-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"
            onClick={() => {
              setOfflineReady(false);
              setNeedRefresh(false);
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
