import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import App from './App';
import { captureTokenFromLocation } from './data/sync/token';

// До первого рендера: Router съест hash, а OAuth-ответ Яндекса живёт в нём.
captureTokenFromLocation();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
