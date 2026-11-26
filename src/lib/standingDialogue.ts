import conversations from './standingDialogue.json' with { type: 'json' };
import scripts from './standingEnglish.json' with { type: 'json' };
import { englishAddress, language, type Language } from './standingLanguage.ts';

export function okeeffeWorldLine(lang: Language) {
  return recordedDialogue('georgia', lang === 'en' ? 'shall we take a walk' : '要不要出去走走', lang);
}

export function okeeffeStudioReply(text: string, lang: Language): string | undefined {
  const inEnglish = lang === 'en';
  if (/新墨西哥|沙漠|荒漠|山谷|\b(?:new mexico|desert|valley|landscape)\b/iu.test(text)) {
    return inEnglish ? 'In New Mexico, I kept looking at the line where the hills meet the sky. It changes with the light.' : '在新墨西哥，我常看山和天交界的那条线。光一变，那条线也跟着变。';
  }
  if (/骨头|骨片|兽骨|\b(?:bones?|skulls?)\b/iu.test(text)) {
    return inEnglish ? 'Hold a bone up to the light and look through it. The space inside can be as striking as the outline.' : '把骨头举到光里，透过它看。里头的空处，有时和外面的轮廓一样醒目。';
  }
  if (/画花|花朵|白花|花瓣|花卉|\b(?:flowers?|petals?)\b/iu.test(text)) {
    return inEnglish ? 'A flower is easy to pass by. When I paint one large, you have time to follow the edge of a petal.' : '一朵小花很容易被略过去。把它画大一点，眼睛才有时间沿着花瓣的边慢慢走。';
  }
  if (/灵感|怎么画|画什么|油画|绘画|构图|色彩|颜色|\b(?:inspir(?:ation|ed|es?)|paint(?:ing|s)?|colou?rs?|composition)\b/iu.test(text)) {
    return inEnglish ? 'I might start with the edge of a pear. Turn it a little and see how much the space beside it changes.' : '我可能先看一枚梨的边缘。把梨稍微转一下，旁边的空处就变了。';
  }
  return undefined;
}

export function recordedDialogue(artistId: string, question: string, lang: Language = language) {
  if (lang === 'en') {
    const addressed = englishAddress(question);
    if (addressed && addressed.id !== artistId) return undefined;
    const cue = (addressed?.rest || question).trim().toLowerCase().replace(/[.!?]+$/, '').replace(/’/g, "'").replace(/\s+/g, ' ');
    return scripts.dialogue.find(line => line.artistId === artistId && line.questions.includes(cue));
  }
  const cue = question.trim().replace(/[，,、。？?！!：:\s]/gu, '');
  return conversations.find(line => line.artistId === artistId &&
    line.questions.includes(cue.startsWith(line.artistName) ? cue.slice(line.artistName.length) : cue));
}
