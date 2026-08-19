import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Browser support check — IndexedDB + ServiceWorker required
function isBrowserSupported(): boolean {
  return typeof indexedDB !== 'undefined' && 'serviceWorker' in navigator;
}

const container = document.getElementById('root')!;
const root = createRoot(container);

if (!isBrowserSupported()) {
  root.render(
    <div style={{ padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h2>Браузер не поддерживается</h2>
      <p>Для работы приложения необходимы IndexedDB и Service Worker.</p>
      <p>Используйте Safari на iOS 16.4+ или Chrome на Android 10+.</p>
    </div>
  );
} else {
  root.render(<App />);
}
