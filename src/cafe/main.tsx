import { createRoot } from 'react-dom/client';
import { english } from '@/lib/standingLanguage';
import CafeApp from './CafeApp';

if (!english) {
  document.documentElement.lang = 'zh-CN';
  document.title = '夜间露天咖啡座 · 余光';
}
createRoot(document.getElementById('root')!).render(<CafeApp />);
