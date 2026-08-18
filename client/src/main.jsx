import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/AuthContext.jsx';
import { ToastProvider } from './components/ui.jsx';
import { initScrollFeel } from './lib/scroll.js';
import './index.css';

initScrollFeel();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);

// Service Worker nur im Produktions-Build registrieren (installierbare PWA,
// Offline-Shell). Im Dev-Modus deaktiviert, damit HMR nicht gestört wird.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
