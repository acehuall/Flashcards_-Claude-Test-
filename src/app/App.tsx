import React from 'react';
import { AppRouter }       from './Router';
import { ToastProvider }   from '../context/ToastContext';
import { SettingsProvider } from '../context/SettingsContext';

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </SettingsProvider>
  );
}
