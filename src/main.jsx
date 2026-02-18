import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ─── Global Security Setup ────────────────────────────────────────────────────

// Disable right-click in production (minor deterrent)
if (import.meta.env.VITE_APP_ENV === 'production') {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ─── Mount App ────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
