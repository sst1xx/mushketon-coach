import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Workbox } from 'workbox-window';
import App from './App';
import UpdateBanner from './components/UpdateBanner';

// Browser support check — IndexedDB + ServiceWorker required
function isBrowserSupported(): boolean {
  return typeof indexedDB !== 'undefined' && 'serviceWorker' in navigator;
}

function Root() {
  const [showBanner, setShowBanner] = useState(false);
  const [wb, setWb] = useState<Workbox | null>(null);

  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const workbox = new Workbox('/sw.js');
    setWb(workbox);

    workbox.addEventListener('waiting', () => setShowBanner(true));

    workbox.register().catch(console.error);
  }, []);

  const handleUpdate = () => {
    if (!wb) return;
    setShowBanner(false);

    const handleControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, { once: true });

    const timeout = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      setShowBanner(true);
      alert('Обновление не удалось применить. Закройте все вкладки приложения и откройте его снова.');
    }, 5000);

    navigator.serviceWorker.addEventListener('controllerchange', () => clearTimeout(timeout), { once: true });

    wb.messageSkipWaiting();
  };

  return (
    <>
      <App />
      {showBanner && <UpdateBanner onUpdate={handleUpdate} onDismiss={() => setShowBanner(false)} />}
    </>
  );
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
  root.render(<Root />);
}
