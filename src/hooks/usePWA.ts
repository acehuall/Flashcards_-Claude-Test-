import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// BeforeInstallPromptEvent is not in the standard lib yet
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAState {
  /** True when the browser has fired beforeinstallprompt and the app is not already installed */
  isInstallable: boolean;
  /** True when running in standalone display mode (already installed) */
  isStandalone: boolean;
  /** True when the browser is online */
  isOnline: boolean;
  /** True when a new service worker is waiting and the app can be updated */
  needRefresh: boolean;
  promptInstall: () => Promise<void>;
  dismissInstall: () => void;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

export function usePWA(): PWAState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // Detected once at mount; changes only on app reinstall which forces a reload
  const [isStandalone] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari sets navigator.standalone
    (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (err) => console.warn('[PWA] Service worker registration failed', err),
  });

  // Track online/offline
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Capture the install prompt — must preventDefault() to suppress the native mini-bar
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Clear our install prompt once the app is actually installed
  useEffect(() => {
    const handler = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
    };
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  const dismissInstall = () => setIsInstallable(false);

  const applyUpdate = () => {
    updateServiceWorker(true);
    setNeedRefresh(false);
  };

  const dismissUpdate = () => setNeedRefresh(false);

  return {
    // Don't show the install prompt if already running standalone
    isInstallable: isInstallable && !isStandalone,
    isStandalone,
    isOnline,
    needRefresh,
    promptInstall,
    dismissInstall,
    applyUpdate,
    dismissUpdate,
  };
}
