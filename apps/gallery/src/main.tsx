import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';

const params = new URLSearchParams(window.location.search);
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

if (params.has('shot')) {
  // Deterministic, chrome-free mount for the visual-test harness.
  void import('./shot').then(({ mountShot }) => mountShot(rootEl, params));
} else {
  void Promise.all([import('./App'), import('./state/theme')]).then(
    ([{ App }, { ThemeProvider }]) => {
      createRoot(rootEl).render(
        <StrictMode>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </StrictMode>,
      );
    },
  );
}
