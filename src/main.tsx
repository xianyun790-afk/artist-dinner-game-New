import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import StandingDuoApp from './StandingDuoApp';
import { english, standingVersion } from './lib/standingLanguage';
import './styles.css';
if (english) {
  document.documentElement.lang = 'en';
  document.title = 'Afterglow New — Artist Conversations';
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{standingVersion ? <StandingDuoApp /> : <App />}</React.StrictMode>);
