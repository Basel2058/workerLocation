import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-arabic';
import '@fontsource-variable/noto-sans-hebrew';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
