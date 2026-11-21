import { gameAsset } from '@/lib/gameAssets';
import { t } from '@/lib/standingLanguage';
import type { CSSProperties } from 'react';
import type { Painting } from '@/lib/paintings';

export function FramedPainting({ painting, className = '', onLoad, onError }: {
  painting: Painting; className?: string; onLoad?: () => void; onError?: () => void;
}) {
  return <div className={`framed-art ${className}`} style={{ '--art-ratio': painting.width / painting.height } as CSSProperties}>
    <img src={gameAsset(painting.image)} alt={t(`${painting.artist}《${painting.title}》，${painting.year}年`, `${painting.englishTitle}, ${painting.year}`)} onLoad={onLoad} onError={onError}/>
  </div>;
}
