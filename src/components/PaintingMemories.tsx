import { BookOpen } from 'lucide-react';
import { paintingCatalog, type Painting } from '@/lib/paintings';
import type { Artist, PaintingMemory } from '@/lib/types';
import { FramedPainting } from './FramedPainting';
import { displayName, language, t } from '@/lib/standingLanguage';

export function PaintingMemories({ memories, artists, onReplay }: {
  memories: PaintingMemory[]; artists: Artist[]; onReplay: (painting: Painting) => void;
}) {
  const byPainting = new Map<string, PaintingMemory[]>();
  for (const memory of [...memories].reverse()) {
    const visits = byPainting.get(memory.paintingId);
    if (visits) visits.push(memory);
    else byPainting.set(memory.paintingId, [memory]);
  }

  const visitLabel = (memory: PaintingMemory) => {
    const speaker = artists.find(a => a.id === memory.speakerId);
    const date = new Date(memory.createdAt).toLocaleDateString(t('zh-CN', 'en-US'));
    const night = t(`第${memory.night}夜`, `Night ${memory.night}`);
    const note = memory.explanation && speaker ? t(` · 和${speaker.name}聊过`, ` · With ${displayName(speaker)}`) : '';
    return `${date} · ${night}${note}`;
  };

  return <div className="painting-memories">
    {byPainting.size ? <div className="painting-memory-grid">{[...byPainting].map(([paintingId, visits]) => {
      const painting = paintingCatalog.find(p => p.id === paintingId);
      if (!painting) return null;
      const author = artists.find(a => a.id === painting.artistId);
      const multipleVisits = visits.length > 1;
      return <article className="painting-memory" key={paintingId}>
        <button className="painting-memory-preview" onClick={() => onReplay(painting)} aria-label={t(`重新看《${painting.title}》`, `Revisit ${painting.englishTitle}`)}>
          <FramedPainting painting={painting}/>
        </button>
        <div className="painting-memory-copy">
          <h3>{t(painting.title, painting.englishTitle)}</h3>
          <p>{language === 'en' ? author?.english ?? painting.artist : painting.artist} · {painting.year}</p>
          {!multipleVisits && <small className="painting-memory-date">{visitLabel(visits[0])}</small>}
          <details>
            <summary>{t('当时的对话', 'Conversation')}</summary>
            {visits.map(memory => <div className="painting-memory-visit" key={memory.id}>
              {multipleVisits && <small className="painting-memory-date">{visitLabel(memory)}</small>}
              <p className="memory-question">{t('你：', 'You: ')}{memory.question}</p>
              <p>{memory.explanation || t('这次先看了画，还没有开始讲解。', 'You viewed the painting before the narration began.')}</p>
            </div>)}
          </details>
        </div>
      </article>;
    })}</div> : <div className="painting-memory-empty"><BookOpen size={25} strokeWidth={1.2}/><p>{t('退出画布后，画作和听到的讲解会保存在这里。', 'When you leave a painting, it appears here with the narration you heard.')}</p></div>}
  </div>;
}
