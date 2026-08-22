import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/AuthContext.jsx';
import { ToastProvider } from './components/ui.jsx';
import './index.css';

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
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Regelmäßig nach einer neueren Version schauen.
      reg.update?.();
      setInterval(() => reg.update?.(), 60 * 60 * 1000);
    }).catch(() => {});
  });
  // Sobald ein neuer Service Worker die Kontrolle übernimmt, einmalig neu laden,
  // damit die Nutzer nie auf einer veralteten (gecachten) Version festhängen.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
