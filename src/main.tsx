import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// VULN-017 frame-busting fallback: on a host that can't send
// X-Frame-Options / frame-ancestors as a real header (GitHub Pages), the
// meta-tag CSP's frame-ancestors is silently ignored by browsers, so this is
// the only thing that actually stops the page being framed.
try {
  if (window.top !== window.self) {
    window.top!.location.href = window.self.location.href;
  }
} catch {
  // Cross-origin top frame: can't read window.top.location, but that access
  // throwing is itself proof we're framed by another origin — same response.
  document.documentElement.style.display = 'none';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
