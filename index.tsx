
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { captureInstallPrompt } from './services/installPrompt';

// Before the first render: the install prompt can come early
captureInstallPrompt();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Installable app (PWA): the service worker only in production builds
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service worker:', err?.message));
  });
}
