import type { Artist, Choice, Mark, Memory, PersonState, Save } from './types';
import { everydayFallback, everydayReply, roomReply } from './room.ts';
import { declinesCreation, declinesTopic, isArtTopic, isDirectedPraise, isDisagreement, isGreeting, isPersonalHostility, isRepair, requestsNoAdvice, requestsQuiet, wantsToCreate } from './conversationIntent.ts';
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function freshPerson(): PersonState {
  return { node: 'hello', mood: 'calm', interest: 1, irritation: 0, evidence: [], messages: [], memories: [], draftPaths: [] };
}
export function freshSave(): Save {
  return { version: 1, night: 1, scene: 'dusk', invited: ['monet', 'vincent', 'dali', 'georgia'], customArtists: [], people: {}, works: [], voiceSettings: {}, muted: true, activeId: null, ended: false };
}
function say(p: PersonState, text: string, action?: string) { p.messages.push({ id: uid(), who: 'artist', text, action }); }
function remember(p: PersonState, kind: string, text: string, night: number, workId?: string) {
  if (!p.memories.some(m => m.kind === kind && m.text === text)) p.memories.push({ id: uid(), kind, text, night, workId });
}
function evidence(p: PersonState, item: string) { if (!p.evidence.includes(item)) p.evidence.push(item); }
export function enterConversation(save: Save, a: Artist): Save {
  const s = structuredClone(save); s.activeId = a.id;
  const p = s.people[a.id] ?? (s.people[a.id] = freshPerson());
  if (!p.messages.length) {
    const last = p.memories.filter(m => m.kind !== 'boundary').at(-1);
    const boundary = p.memories.find(m => m.kind === 'boundary');
    const w = s.works.filter(w => w.artistId === a.id && p.memories.some(m => m.workId === w.id)).at(-1);
    const text = boundary ? '今晚先不铺纸，也不追问。你想聊什么，还是只坐一会儿？' : w ? `上次的《${w.title}》还在。今天想接着看，还是另起一张？${w.disagreement ? '你保留的那一笔，我还想再看看。' : ''}` : last ? `上次你说：“${last.text}”。今晚想接着聊，还是换个话题？` : a.greeting;
    say(p, text, '他放下手里的东西，向你留出一点位置。');
  }
  return s;
}
export function choicesFor(p: PersonState): Choice[] {
  switch (p.node) {
    case 'hello': return [
      { id: 'observe', text: '你刚才在看什么？', hint: '从桌上的小事聊起', icon: 'talk' },
      { id: 'create', text: '我们能一起画点什么吗？', hint: '试试「接一笔」', icon: 'art' },
      { id: 'company', text: '不谈作品，坐一会儿吧。', hint: '也可以安静共处', icon: 'quiet' }];
    case 'topic': return [ { id: 'detail', text: '我也注意到了那个细节。' }, { id: 'disagreeTopic', text: '我有一个不同的看法。' }, { id: 'create', text: '要不要一起试一张？', icon: 'art' } ];
    case 'invite': return [ { id: 'accept', text: '试试，画坏了也留着。', icon: 'art' }, { id: 'cantDraw', text: '我不会画，也可以吗？' }, { id: 'decline', text: '今天只想聊。', icon: 'quiet' } ];
    case 'draw': return [];
    case 'reaction': return [ { id: 'keep', text: '我喜欢这样，先留着。' }, { id: 'explain', text: '这一笔，我想让它停一下。' }, { id: 'dismiss', text: '这不就是随便涂两笔吗？' } ];
    case 'disagreement': return [ { id: 'keepDifference', text: '我还是想保留我的版本。' }, { id: 'agree', text: '我愿意再试试你的方法。' }, { id: 'pause', text: '今天先停在这里。', icon: 'quiet' } ];
    case 'warning': return [ { id: 'clarify', text: '我说得太轻了，是没看出变化。' }, { id: 'honest', text: '我不太懂，为什么这值得讨论？' }, { id: 'insist', text: '别解释了，你必须继续画。' } ];
    case 'paused': return [ { id: 'cool', text: '好，先吃点东西。', icon: 'quiet' }, { id: 'clarify', text: '我想重新说，不要求你认同。' }, { id: 'newTopic', text: '我们换个话题吧。' } ];
    case 'naming': return [];
    case 'saved': return [ { id: 'lookAgain', text: '再看看我们的画。', icon: 'art' }, { id: 'company', text: '把画收好，吃点东西。', icon: 'quiet' }, { id: 'newTopic', text: '我想聊点别的。' } ];
    case 'company': return [ { id: 'bread', text: '谢谢，给我留块脆的面包。' }, { id: 'newTopic', text: '我现在想聊聊了。' }, { id: 'create', text: '要不要一起试一笔？', icon: 'art' } ];
  }
}
export function choose(save: Save, a: Artist, choiceId: string, text?: string): Save {
  const s = structuredClone(save); const p = s.people[a.id] ?? (s.people[a.id] = freshPerson());
  const line = text ?? choicesFor(p).find(c => c.id === choiceId)?.text;
  if (!line) return save;
  p.messages.push({ id: uid(), who: 'player', text: line });
  switch (choiceId) {
    case 'observe': p.node = 'topic'; say(p, a.observation, '他把桌上的东西移到你也能看清的地方。'); break;
    case 'detail': p.node = 'invite'; p.interest = Math.min(3, p.interest + 1); p.mood = 'curious'; evidence(p, 'observed'); say(p, `你也看见了。${a.rule}要不要一起留一张试稿？`, '他抬眼看你，身体微微前倾。'); break;
    case 'disagreeTopic': p.node = 'topic'; p.mood = 'curious'; evidence(p, 'reasoned-dialogue'); say(p, '愿意说具体一点吗？你可以不同意。我想听听你注意到了哪里，也可以一起试一张。', '他停下手里的动作，认真等你继续说。'); break;
    case 'create': p.node = 'invite'; say(p, `好。我先留${a.firstMark}，下一笔归你。${a.rule}`, '他拿出一张新纸，原先的小稿留在旁边。'); break;
    case 'cantDraw': p.node = 'invite'; say(p, '可以只画一道线，也可以选一个方向。我们先试，不考你画得像不像。'); break;
    case 'accept': p.node = 'draw'; p.draftPaths = []; p.mark = undefined; p.workId = undefined; p.interest = Math.max(2, p.interest); p.mood = 'curious'; say(p, `我先留${a.firstMark}。你想接着它、横穿它，还是在旁边另留一笔？`, '他把画纸推到两个人中间。'); break;
    case 'decline': p.node = 'company'; p.declined = true; p.mood = 'calm'; remember(p, 'boundary', '今晚不想被催促做练习', s.night); say(p, '好，纸先收起来。我们只聊，不用把什么做完。', '他自然地把纸移开，没有失落或催促。'); break;
    case 'company': p.node = 'company'; p.mood = 'calm'; say(p, a.quiet, '他给你留出一点桌面，餐厅的声音慢慢回来。'); break;
    case 'bread': p.node = 'company'; remember(p, 'preference', '喜欢面包较脆的那一部分', s.night); say(p, '这块给你。下次还想要这个，告诉我就好。', '他把面包放在干净的小盘里。'); break;
    case 'keep': p.node = 'naming'; p.lastResult = 'agreement'; p.mood = 'excited'; evidence(p, 'created'); say(p, '好，留着。你想给今晚这一张取个什么名字？', '他把笔放下，等你写上名字。'); break;
    case 'explain': p.node = 'disagreement'; p.mood = 'curious'; p.irritation = 0; p.interest = Math.min(3, p.interest + 1); evidence(p, 'reasoned-dialogue'); remember(p, 'opinion', line, s.night); say(p, a.disagreement, '他重新把画纸放正，又认真看了一遍。'); break;
    case 'keepDifference': p.node = 'naming'; p.lastResult = 'difference'; evidence(p, 'created'); p.mood = 'curious'; say(p, '那就保留你的版本。我不改你的画，也不急着让我们意见一致。给它留个名字吧。'); break;
    case 'agree': p.node = 'draw'; p.lastResult = 'revised'; p.draftPaths = []; p.mark = undefined; p.mood = 'curious'; say(p, '可以，另外试一张。刚才的对话会留着，你不必因为我的意见就急着同意。'); break;
    case 'dismiss': p.node = 'warning'; p.irritation = 1; p.mood = 'calm'; say(p, '你是说还没看出这几笔有什么变化，还是觉得我们刚才没有认真画？我想先听明白。', '他的手停了一下，没有急着收走画纸。'); break;
    case 'honest': p.node = 'reaction'; p.irritation = 0; p.mood = 'curious'; say(p, '因为画杯子或一把椅子，也要决定谁向前、谁停下来。不过你可以觉得这次试验没帮助。我们可以保留，也可以停。'); break;
    case 'clarify': p.node = p.mark ? 'disagreement' : 'topic'; p.irritation = 0; p.mood = 'curious'; say(p, '好，我们回到具体的东西。你不必改成喜欢它，我也想再听听你的理由。', '他把纸重新留在两人都能看见的位置。'); break;
    case 'insist': p.node = 'paused'; p.irritation = 2; p.mood = 'irritated'; remember(p, 'unresolved', '这次创作曾暂停，双方还没有达成一致', s.night); say(p, '你可以不喜欢。但我不想在被要求必须继续的时候画下去。先停这个话题吧，我们可以换个话题，也可以各自坐一会儿。', '他放下笔，靠回椅背。'); break;
    case 'pause': case 'cool': p.node = 'company'; p.mood = 'calm'; p.irritation = 0; say(p, '好，纸先放着。面包还温着。今天不必把每件事都说清楚。', '他把面包篮移到桌子中间，没有继续追问。'); break;
    case 'newTopic': p.node = 'hello'; p.mood = 'calm'; p.irritation = 0; say(p, '好。从今晚的新话题开始。你想看点什么，还是先聊聊？'); break;
    case 'lookAgain': p.node = 'saved'; say(p, '你可以在作品夹里看它。原来的那一笔、你接的那一笔，都还在。'); break;
  }
  return s;
}
export function makeMark(save: Save, a: Artist, mark: Mark, paths: string[] = []): Save {
  const s = structuredClone(save); const p = s.people[a.id];
  if (!p || p.node !== 'draw') return save;
  p.mark = mark; p.draftPaths = paths; p.node = 'reaction';
  p.messages.push({ id: uid(), who: 'player', text: mark === 'heavy' ? '沿着它，接一条更重的线。' : mark === 'light' ? '横穿它，留下一道浅线。' : mark === 'circle' ? '在旁边画一个小圆。' : '我想先把这一笔留在这里。' });
  p.mood = mark === 'heavy' ? 'excited' : 'curious'; p.interest = Math.min(3, p.interest + 1);
  say(p, mark === 'heavy' ? a.heavy : mark === 'light' ? a.light : mark === 'circle' ? a.circle : '这一笔你想让什么发生？你可以先说说，也可以只留着看看。', mark === 'heavy' ? '他眼睛亮了起来，伸手指向两笔相接的地方。' : '他看着你留下的一笔，认真等你解释。');
  return s;
}
export function saveWork(save: Save, a: Artist, title: string): Save {
  const s = structuredClone(save); const p = s.people[a.id];
  if (!p || p.node !== 'naming' || !p.mark || p.workId) return save;
  const id = uid(); const name = title.trim().slice(0, 36) || '今晚的试稿';
  s.works.push({ id, artistId: a.id, title: name, mark: p.mark, paths: [...p.draftPaths], createdAt: new Date().toISOString(), night: s.night, shared: false, disagreement: p.lastResult === 'difference' });
  p.workId = id; p.node = 'saved'; evidence(p, 'created');
  remember(p, 'work', `一起留下了《${name}》${p.lastResult === 'difference' ? '，保留了不同的意见' : ''}`, s.night, id);
  say(p, `《${name}》。好，就先用这个。只收在我们的作品夹里，想给别人看，再由你决定。`, '他把画轻轻放到不沾水的位置。');
  return s;
}
export function freeTalk(save: Save, a: Artist, text: string): Save {
  const input = text.trim().slice(0, 400); if (!input) return save;
  const s = structuredClone(save); const p = s.people[a.id] ?? (s.people[a.id] = freshPerson());
  p.messages.push({ id: uid(), who: 'player', text: input });
  if (p.lastCustomText === input) { say(p, '这一句我们刚才说过。我还在听。'); return s; }
  p.lastCustomText = input;
  const declinedCreation = declinesCreation(input), everyday = everydayReply(a, input);
  if (declinedCreation) remember(p, 'boundary', '今晚不想被催促做练习', s.night);
  if (requestsQuiet(input)) {
    p.mood = 'calm'; p.irritation = 0; say(p, a.quiet); return s;
  }
  if (declinedCreation || declinesTopic(input) || requestsNoAdvice(input)) {
    p.mood = 'calm'; p.irritation = 0;
    say(p, requestsNoAdvice(input) ? '你说，我先不出主意。' : everyday ?? (declinedCreation ? '好，今天只聊，不铺纸。' : '好，这个话题先放下。'));
    return s;
  }
  if (isPersonalHostility(input)) {
    p.irritation = Math.min(2, p.irritation + 1); p.mood = p.irritation > 1 ? 'irritated' : 'calm';
    say(p, p.irritation > 1 ? '我想先缓一缓。你可以不喜欢我的看法，但我不想被命令。' : '我听到了。不过，我们可以说具体一点，不必急着贬低彼此。'); return s;
  }
  if (isRepair(input)) {
    p.irritation = 0; p.mood = 'calm'; say(p, everyday ?? '好，我们接着聊。'); return s;
  }
  if (isDisagreement(input)) {
    p.mood = 'curious'; evidence(p, 'reasoned-dialogue');
    say(p, isArtTopic(input) ? a.disagreement : everyday ?? '你指哪一点？说具体些，我好接着聊。'); return s;
  }
  if (isDirectedPraise(input)) {
    p.mood = 'excited';
    say(p, a.id === 'dali' ? '谢谢，这句我收下了。' : a.id === 'vincent' ? '谢谢，听你这么说，我也挺高兴。' : a.id === 'monet' ? '谢谢，能聊到一处挺好。' : a.id === 'georgia' ? '谢谢。' : '谢谢，我也很高兴。'); return s;
  }
  if (wantsToCreate(input)) {
    p.mood = 'curious'; say(p, `可以。${a.rule}想开始时，我们再把纸铺开。`); return s;
  }
  if (isGreeting(input)) { p.mood = 'calm'; say(p, a.greeting); return s; }
  // Everyday preferences do not congratulate the character or keep a previous
  // performance state alive. Only a current art topic gets an art observation.
  p.mood = 'calm';
  if (everyday) { say(p, everyday); return s; }
  if (isArtTopic(input)) { p.mood = 'curious'; say(p, roomReply(a, input) ?? a.observation); return s; }
  say(p, everydayFallback(a, input));
  return s;
}
export function nextNight(save: Save): Save {
  const s = structuredClone(save); s.night += 1; s.ended = false; s.activeId = null;
  for (const p of Object.values(s.people)) {
    p.messages = []; p.node = 'hello'; p.mood = 'calm'; p.interest = 1; p.irritation = 0; p.workId = undefined; p.mark = undefined; p.draftPaths = [];
  }
  return s;
}
export function relationship(p?: PersonState) { return !p?.evidence.length ? '初次相逢' : p.evidence.length < 2 ? '渐渐熟悉' : '愿意认真交流'; }
export function clearMemories(save: Save, id: string): Save {
  const s = structuredClone(save); const p = s.people[id]; if (!p) return s;
  s.people[id] = freshPerson();
  return s;
}
export function memoryList(p?: PersonState): Memory[] { return p?.memories ?? []; }
