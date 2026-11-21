import type { Artist } from './types';
import { groupPause, playGroupRound, type GroupReply } from './groupChat.ts';
import type { DialogueLine } from './dialogueService';
import scripts from './standingEnglish.json' with { type: 'json' };
import { englishAddress, language, type Language } from './standingLanguage.ts';

type ExchangeLine = { artistId: string; text: string; audio: string };
export const recordedExchanges: { topics: string[]; lines: ExchangeLine[] }[] = [
  {
    topics: ['星空', '星月夜', '星夜'],
    lines: [
      { artistId: 'vincent', text: '达利，你看那颗星，边上明明是蓝的，我却想再添一点黄。', audio: '/audio/duo/star-1.mp3' },
      { artistId: 'dali', text: '黄可以添。可你那圈蓝一直在转，我看着都有点晕船。', audio: '/audio/duo/star-2.mp3' },
      { artistId: 'vincent', text: '晕船？那你看下面那扇窗。我把它画得很稳，你在那儿歇歇。', audio: '/audio/duo/star-3.mp3' },
      { artistId: 'dali', text: '那扇窗我喜欢。等天空转到门口，我再下船。', audio: '/audio/duo/star-4.mp3' },
    ],
  },
  {
    topics: ['软钟', '记忆的永恒', '永恒的记忆'],
    lines: [
      { artistId: 'dali', text: '梵高，要是你的怀表软成这样，你把它挂在哪儿？', audio: '/audio/duo/watch-1.mp3' },
      { artistId: 'vincent', text: '挂画架上吧。反正我看太阳落在哪儿，就知道还能画多久。', audio: '/audio/duo/watch-2.mp3' },
      { artistId: 'dali', text: '那赶上阴天呢？你的太阳也有请假的时候。', audio: '/audio/duo/watch-3.mp3' },
      { artistId: 'vincent', text: '那更好。天没黑，我就再画两笔。', audio: '/audio/duo/watch-4.mp3' },
    ],
  },
];

const pair = /^(?:(?:我想听|我想让|想听|听|让|请|能不能让|可以让)\s*)?(你们(?:两个(?:人)?|两位|俩)?|你俩|他(?:们(?:两个(?:人)?|俩)?|俩)|两位|(?:梵高|达利|莫奈|欧姬芙)\s*(?:和|跟|与|、)\s*(?:梵高|达利|莫奈|欧姬芙))[，,\s]*(?:你们(?:俩|两个)?[，,\s]*)?(?:自己|互相|一起|来|先|直接|可以|能不能|进行)*(?:聊(?:聊天|一聊|聊|一下|一会儿?|天|(?=[吧吗啊。！？?!\s]|$))|谈谈|讨论(?:一下)?|对话)(.*)$/u;
export function parseDuoRequest(text: string, lang: Language = language) {
  if (lang === 'en') {
    const invite = /^(?:(?:please|let|can|could|would)\s+)*(you two|the two of you|both of you|them|(?:vincent(?: van gogh)?|van gogh|(?:salvador )?dal[ií]|(?:claude )?monet|georgia(?: o['’]keeffe)?|o['’]keeffe)\s+and\s+(?:vincent(?: van gogh)?|van gogh|(?:salvador )?dal[ií]|(?:claude )?monet|georgia(?: o['’]keeffe)?|o['’]keeffe))[,\s]+(?:please\s+)?(?:talk|chat|discuss)\b(?:\s+(?:to each other|together))?(?:\s+about)?\s*(.*?)\s*[.?!]*$/i.exec(text.trim());
    if (!invite) return null;
    const named = /\s+and\s+/i.test(invite[1]) ? invite[1].split(/\s+and\s+/i).map(part => englishAddress(part)!.id) : [];
    return { named, topic: invite[2].trim() };
  }
  const match = pair.exec(text.trim());
  if (!match || /^(?:的时候|时|过|了吗|了没)/u.test(match[2])) return null;
  const named = match[1].match(/梵高|达利|莫奈|欧姬芙/gu) ?? [];
  const topic = match[2].replace(/^[\s，,。：:、]+|[\s，,。！!？?]+$/gu, '').replace(/(?:(?:这个话题|吧|好吗|好不好|可以吗|一下|一会儿?|吗))+$/u, '').trim();
  return { named, topic };
}

export function duoMembers(guests: Artist[], named: string[] = []): [Artist, Artist] | null {
  const [a, b] = named.length ? named.map(name => guests.find(g => g.name === name || g.id === name)) : guests;
  return a && b && a.id !== b.id ? [a, b] : null;
}

export function duoScript(members: [Artist, Artist], topic: string, pick: number, lang: Language = language) {
  if (!['vincent', 'dali'].every(id => members.some(a => a.id === id))) return undefined;
  const entries = lang === 'en' ? scripts.exchanges : recordedExchanges;
  const title = lang === 'en' ? topic.toLowerCase().trim() : topic.replace(/[《》“”\s]/gu, '');
  return title ? entries.find(entry => entry.topics.includes(title)) : entries[pick % entries.length];
}

export function localDuoTurns([first, second]: [Artist, Artist], topic: string, lang: Language = language): GroupReply[] {
  if (lang === 'en') {
    const detail = second.id === 'georgia' ? 'that curve' : second.id === 'dali' ? 'the shadow' : second.id === 'monet' ? 'the reflection' : 'that patch of yellow';
    return [
      { artist: first, text: `When you think about ${topic.slice(0, 75)}, what would you put down first?` },
      { artist: second, text: second.id === 'georgia' ? "That curve. Give it the whole page and see where your eye goes." : second.id === 'dali' ? "The shadow. I'd let it arrive a minute ahead of its owner." : second.id === 'monet' ? "The reflection. One ripple gives the whole thing a different shape." : "A little yellow. Leave it enough dark around the edges and it will glow." },
      { artist: first, text: `I'd leave some space beside ${detail}. I'd like to see how much it can do on its own.` },
      { artist: second, text: "Then let's leave it there a minute. I want to see where your eye goes next." },
    ];
  }
  const motif = second.id === 'georgia' ? '道弧线' : second.id === 'dali' ? '影子' : second.id === 'monet' ? '倒影' : '一小块黄';
  const thought = second.id === 'georgia' ? '先画那道弧线。留一整张纸给它，看看眼睛会跟到哪里。' : second.id === 'dali' ? '我会先画影子，让它比主人早到一会儿。'
    : second.id === 'monet' ? '我想试试倒影。水稍微一动，同一样东西就有了第二个模样。'
    : '我会留一小块黄。把四周压暗，它自己就会亮起来。';
  const answer = second.id === 'georgia' ? '可以。边上留的那点空，正好让弧线接着往外走。' : second.id === 'dali' ? '亏你眼尖。我倒想把主人留在画外，看影子一个人怎么办。'
    : second.id === 'monet' ? '对，就等那一阵风。水一动，边缘自己就散开了。'
    : '对。再多加一笔，它反倒没那么亮了。';
  return [
    { artist: first, text: second.name + '，说到“' + topic.slice(0, 64) + '”，你要只画一笔，会留下什么？' },
    { artist: second, text: thought },
    { artist: first, text: '那我先把旁边留白，看看你这' + motif + '自己能撑多久。' },
    { artist: second, text: answer },
  ];
}

export async function playDuoConversation(
  members: [Artist, Artist], topic: string, preset: ReturnType<typeof duoScript>, signal: AbortSignal,
  callbacks: {
    generate: (reply: GroupReply, direction: string, history: DialogueLine[]) => Promise<string>;
    thinking: (reply: GroupReply) => void;
    present: (reply: GroupReply) => void;
    speak: (reply: GroupReply, audio?: string) => Promise<boolean>;
  }, lang: Language = language,
) {
  const english = lang === 'en';
  const turns = preset ? preset.lines.map(line => ({
    artist: members.find(a => a.id === line.artistId)!, text: line.text,
  })) : localDuoTurns(members, topic, lang);
  const transcript: DialogueLine[] = [];
  let useLocal = false;
  let closeEarly = false;
  await playGroupRound(turns, signal, {
    thinking: reply => { if (!closeEarly) callbacks.thinking(reply); },
    generate: async reply => {
      if (closeEarly) return null;
      if (preset || useLocal) return reply;
      const partner = members.find(a => a.id !== reply.artist.id)!;
      const direction = english ? `Talk to ${partner.english} about "${topic.slice(0, 280)}". ${transcript.length === 0 ? 'Start the conversation.' : transcript.length === turns.length - 1 ? 'Answer their last line and bring the conversation to a close.' : 'Pick up a detail from their last line.'}` : '和' + partner.name + '聊「' + topic.slice(0, 310) + '」。' +
        (transcript.length === 0 ? '由你开场。' : transcript.length === turns.length - 1 ? '接住对方上一句，用一句话收尾。' : '接住对方上一句，再往前聊一点。');
      const text = await callbacks.generate(reply, direction, [...transcript]);
      if (text === reply.text) {
        useLocal = true;
        // An outage halfway through a live exchange must not invent an earlier
        // remark from the local script that the other artist never made.
        if (transcript.length) { closeEarly = true; return { ...reply, text: english ? "I'd like to think about what you just said." : '你刚才说的，我还想再琢磨一下。' }; }
      }
      return { ...reply, text };
    },
    present: reply => {
      transcript.push({ who: 'artist', name: english ? reply.artist.english : reply.artist.name, text: reply.text });
      callbacks.present(reply);
    },
    speak: async reply => {
      const played = await callbacks.speak(reply, preset?.lines[transcript.length - 1].audio);
      await groupPause(signal, played ? 230 : Math.min(6000, 1000 + reply.text.length * 130));
    },
    pause: groupPause,
  });
}
