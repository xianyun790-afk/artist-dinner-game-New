import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ValleyFilm } from '@/components/ValleyFilm';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ValleyFilm />
  </StrictMode>,
);
