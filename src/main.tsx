import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
// До первого рендера: если Яндекс вернул токен в #access_token=…,
// забрать его в память, пока HashRouter не затёр фрагмент.
import './pages/spikeToken';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
