import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/500-italic.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles/global.css';
import './styles/app.css';
import './styles/neumorphism.css';
import App from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
