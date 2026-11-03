import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from './components/AuthGate';
import { brandFontCss } from './brand/brand';

// the brand fonts travel inside the app, so the studio looks the same offline and in downloaded pages
const brandFonts = document.createElement('style');
brandFonts.textContent = brandFontCss();
document.head.appendChild(brandFonts);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);