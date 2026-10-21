import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './theme.tsx'

// Once, here, rather than reassigned on every App render.
window.onerror = function (msg, url, line, col, error) {
  console.error("GLOBAL ERROR CAUGHT:");
  console.error(msg, url, line, col, error);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>,
)
