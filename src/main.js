import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import './mobile.css';
import './refinements.css';

if ('serviceWorker' in navigator && window.isSecureContext && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .catch((error) => console.warn('PWA registration failed:', error));
  }, { once: true });
}

createApp(App).mount('#root');
