import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Service Worker registration disabled in dev environment to prevent "Failed to fetch" errors.
// PWAs and active agent edits on the same domain can cause caching conflicts.
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
...
    }).catch((err) => {
      console.error('Service Worker registration failed:', err);
    });
  });
}
*/

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
