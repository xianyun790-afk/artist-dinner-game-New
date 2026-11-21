import conversations from './standingDialogue.json' with { type: 'json' };
import scripts from './standingEnglish.json' with { type: 'json' };
import { englishAddress, language, type Language } from './standingLanguage.ts';

export function recordedDialogue(artistId: string, question: string, lang: Language = language) {
  if (lang === 'en') {
    const addressed = englishAddress(question);
    if (addressed && addressed.id !== artistId) return undefined;
    const cue = (addressed?.rest || question).trim().toLowerCase().replace(/[.!?]+$/, '').replace(/’/g, "'").replace(/\s+/g, ' ');
    return scripts.dialogue.find(line => line.artistId === artistId && line.questions.includes(cue));
  }
  const cue = question.trim().replace(/[，,、。？?！!\s]/gu, '');
  return conversations.find(line => line.artistId === artistId &&
    line.questions.includes(cue.startsWith(line.artistName) ? cue.slice(line.artistName.length) : cue));
}
