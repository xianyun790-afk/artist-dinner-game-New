import { t } from '@/lib/standingLanguage';
import type { Ref } from 'react';

export type ArtistReply = { artistId: string; text: string; thinking: boolean };

type Props = {
  reply: ArtistReply;
  artistName: string;
  ref: Ref<HTMLDivElement>;
  className?: string;
};

export function ArtistBubble({ reply, artistName, ref, className = '' }: Props) {
  return <div
    ref={ref}
    className={`room-bubble ${reply.thinking ? 'thinking' : ''} ${className}`}
    aria-label={t(`${artistName}${reply.thinking ? '正在想' : '的回复'}`, `${artistName}${reply.thinking ? ' is thinking' : ' says'}`)}
  >
    {reply.thinking ? (
      <span className="thought-cloud" role="status" aria-label={t("正在想", "Thinking")}>
        <svg viewBox="0 0 120 92" aria-hidden="true">
          <defs>
            <filter id="cloudShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".13"/>
            </filter>
            <radialGradient id="cloudFill" cx="45%" cy="35%" r="75%">
              <stop offset="50%" stopColor="white"/>
              <stop offset="100%" stopColor="#e2e1dd"/>
            </radialGradient>
          </defs>
          <path d="M24 66C7 61 9 44 18 39C5 21 25 7 38 15C43 1 62 3 69 13C88 3 103 16 100 31C117 38 111 59 98 62C96 80 76 86 64 76C51 89 32 82 30 69Z" fill="url(#cloudFill)" stroke="#d0d0cd" filter="url(#cloudShadow)"/>
          <circle cx="19" cy="83" r="6" fill="url(#cloudFill)" stroke="#d0d0cd"/>
        </svg>
        <span><i/><i/><i/></span>
      </span>
    ) : (
      <div className="room-reply-text" role="status"><p>{reply.text}</p></div>
    )}
  </div>;
}
