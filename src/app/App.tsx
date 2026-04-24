import React from 'react';
import { AppRouter }       from './Router';
import { ToastProvider }   from '../context/ToastContext';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider }    from '../context/AuthContext';
import { SyncProvider }    from '../context/SyncContext';

export function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <SyncProvider>
            <AppRouter />
          </SyncProvider>
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
