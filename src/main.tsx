import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/mobile.css';
import './styles/unit-side.css';
import './styles/advisor-mobile.css';
import './styles/battle-effects.css';
import './styles/guide-original.css';
import './styles/move-highlights.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
