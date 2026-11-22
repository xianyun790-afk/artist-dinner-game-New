import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import StandingDuoApp from './StandingDuoApp';
import { english, standingVersion } from './lib/standingLanguage';
import './styles.css';
if (!english) {
  document.documentElement.lang = 'zh-CN';
  document.title = '余光 AFTERGLOW New — 艺术家晚宴';
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{standingVersion ? <StandingDuoApp /> : <App />}</React.StrictMode>);
