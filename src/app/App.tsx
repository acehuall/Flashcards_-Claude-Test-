import React from 'react';
import { AppRouter }       from './Router';
import { ToastProvider }   from '../context/ToastContext';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider }    from '../context/AuthContext';
import { SyncProvider }    from '../context/SyncContext';
import { ThemeProvider }   from '../theme/ThemeProvider';

export function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ThemeProvider>
          <ToastProvider>
            <SyncProvider>
              <AppRouter />
            </SyncProvider>
          </ToastProvider>
        </ThemeProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
