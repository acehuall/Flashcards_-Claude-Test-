declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(options?: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
  }): {
    needRefresh: [boolean, (value: boolean) => void];
    offlineReady: [boolean, (value: boolean) => void];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
