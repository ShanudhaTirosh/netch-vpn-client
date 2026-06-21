import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initEvents } from '@/store/store';
import './styles/theme.css';

initEvents().catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
