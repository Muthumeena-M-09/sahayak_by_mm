import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.VITE_ENABLE_ISL_ASSIST === 'true' && new URLSearchParams(location.search).has('isl-test')) {
  import('./features/isl/ISLTestPage.tsx').then(({ default: ISLTestPage }) => {
    createRoot(document.getElementById('root')!).render(<ISLTestPage />);
  });
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}
