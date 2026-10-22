import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-arabic';
import '@fontsource-variable/noto-sans-hebrew';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyLocale, initialLocale, loadLocale } from './lib/i18n';
import { initPwa } from './lib/pwa';
import { initErrorReporting } from './lib/report';

initErrorReporting();
initPwa();

// Load the language before the first paint so Arabic and Hebrew users never see English flash by.
const locale = initialLocale();
void loadLocale(locale)
  .catch(() => undefined)
  .then(() => {
    applyLocale(locale);
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App initialLocale={locale} />
      </StrictMode>,
    );
  });
