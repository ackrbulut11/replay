import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { initSentry } from './utils/sentry'
import { logError } from './services/eventLog'
import App from './App.tsx'
import './index.css'

initSentry();

// React render ağacının dışında kalan hatalar (ErrorBoundary bunları yakalamaz).
window.addEventListener('error', (event) => {
  logError('frontend_error', event.error ?? event.message, { source: 'window.onerror' });
});
window.addEventListener('unhandledrejection', (event) => {
  logError('frontend_error', event.reason, { source: 'unhandledrejection' });
});

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "985054967666-8dbbd2hemhb2qn8k2grncd8ufcqtarqc.apps.googleusercontent.com";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Uygulama Yüklenirken Bir Hata Oluştu">
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)

