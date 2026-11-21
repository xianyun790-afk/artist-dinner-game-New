import catalog from './paintingCatalog.json' with { type: 'json' };
export interface Painting {
  id: string;
  artistId: string;
  aliases: string[];
  note: string;
  title: string;
  englishTitle: string;
  artist: string;
  year: string;
  image: string;
  width: number;
  height: number;
  museum: string;
  sourceUrl: string;
  imageSourceUrl: string;
}

export const paintingCatalog: Painting[] = catalog;
export const starryNight = paintingCatalog.find(p => p.id === 'starry-night')!;
export const waterLilies = paintingCatalog.find(p => p.id === 'water-lilies')!;
export const persistenceOfMemory = paintingCatalog.find(p => p.id === 'persistence-of-memory')!;
export const blueGreenMusic = paintingCatalog.find(p => p.id === 'blue-green-music')!;

function aliasPattern(alias: string): string {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '\\s+');
  return /^[a-z]/i.test(alias) ? `\\b${escaped}\\b` : escaped;
}
const titlePatterns = paintingCatalog.map(painting => ({
  painting,
  pattern: new RegExp([...painting.aliases].sort((a, b) => b.length - a.length).map(aliasPattern).join('|'), 'giu'),
}));
const nightSkyCue = /(?:星空|夜空(?:中|里|下)?(?:的)?星星|夜晚的星星|满天星(?:光|星)?|\b(?:night|starry)\s+sky\b)/giu;
function titleMentions(text: string) {
  return titlePatterns.flatMap(({ painting, pattern }) => [...text.matchAll(pattern)].map(match => ({ painting, match })))
    .sort((a, b) => a.match.index! - b.match.index!);
}

function normalizeMention(text: string): string {
  return text.normalize('NFKC')
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .replace(/\s+/g, ' ');
}

function relevantText(text: string): string {
  // The 1888 Rhône painting is a separate work, despite sharing a short title.
  return normalizeMention(text)
    .replace(/罗[讷纳]河[^，。！？,!?；;]{0,8}?星(?:月)?夜/gu, '')
    .replace(/\b(?:the\s+)?starry\s+night\s+over\s+the\s+rh[oô]ne\b/giu, '')
    .replace(/睡莲池|睡莲和日本桥|\bbridge\s+over\s+(?:a\s+)?pond\s+of\s+water\s+lilies\b/giu, '')
    .replace(/星夜(?:兼程|赶路|行军|疾行|出发|驰援)|披星夜行/gu, '');
}

/** The whole turn can suppress showing art, including later assistant mentions. */
export function declinesPaintingDisplay(text: string): boolean {
  if (/\b(?:don['’]t|do not|please don't|no need to)\s+(?:show|open|display|enter|pull up)\b/i.test(text)) return true;
  for (const clause of relevantText(text).split(/[，。！？,!?；;\n]/u)) {
    // A display preference need not repeat the title. Keep this tied to an
    // explicit display action and picture object, rather than art opinions or
    // “不想画画”, which concern the conversation or creation instead.
    const declinePicture = /(?:不要|不用|不必|无需|先别|别|不想|不需要)(?:你|再|先|现在|暂时|自动|直接|给我|帮我|\s){0,3}(?:展示|显示|弹出|打开|放出|放大|看)(?:这张|那张|这幅|那幅|任何|这些|那些|相关|的|\s){0,3}(?:图片|画面|画作|原作|配图|插图|弹窗|这幅画|这张画|那幅画|那张画)/u.test(clause);
    const declinePictureAfter = /(?:图片|画面|画作|原作|配图|插图|弹窗|这幅画|这张画|那幅画|那张画)(?:先|暂时|现在)?(?:不要|不用|不必|无需|别|不需要)(?:你|再|先|自动|直接|给我|帮我|\s){0,3}(?:展示|显示|弹出|打开|放出|放大|看)/u.test(clause);
    const declinePopup = /(?:不要|不用|不必|无需|先别|别|不想|不需要)(?:你|再|先|自动|直接|给我|帮我|\s){0,3}(?:弹窗|配图)/u.test(clause);
    if (declinePicture || declinePictureAfter || declinePopup) return true;
    const mentions = [...titleMentions(clause).map(({ match }) => match), ...clause.matchAll(nightSkyCue)];
    for (const mention of mentions) {
      const before = clause.slice(0, mention.index).slice(-30);
      const after = clause.slice(mention.index! + mention[0].length, mention.index! + mention[0].length + 30);
      // Respect a request not to show a picture, without censoring disagreement
      // or ordinary questions containing words such as “不喜欢” or “没有”.
      const declineBefore = /(?:不要|不用|不必|无需|先别|别|不想|不需要).{0,8}(?:展示|显示|弹出|打开|放出|放大|看).{0,8}$/u.test(before);
      const declineAfter = /^[》”"'\s]*(?:(?:这幅|这张|的画|画作|原作)\s*)?(?:先|暂时|现在)?(?:不要|不用|不必|无需|别|不需要).{0,8}(?:展示|显示|弹出|打开|放出|放大|看)/u.test(after);
      if (declineBefore || declineAfter) return true;
    }
  }
  return false;
}

/** Match a named work, rather than guessing from a general topic such as stars. */
export function findNamedPainting(text: string): Painting | null {
  return titleMentions(relevantText(text)).at(-1)?.painting ?? null;
}

/** A player can discuss a named work while declining its image. */
export function findMentionedPainting(text: string): Painting | null {
  if (declinesPaintingDisplay(text)) return null;
  const named = findNamedPainting(text);
  if (named) return named;
  const relevant = relevantText(text);
  // The dinner script treats a direct mention of the sky at night as the
  // lightweight discovery cue for Van Gogh's painting. Travel idioms were
  // removed by relevantText above and therefore cannot trigger this scene.
  if (relevant.search(nightSkyCue) !== -1) return starryNight;
  return null;
}

export interface PaintingSceneState { painting: Painting | null; suppressed: boolean }
export function paintingFromPlayer(state: PaintingSceneState, text: string): PaintingSceneState {
  if (declinesPaintingDisplay(text)) return { painting: null, suppressed: true };
  const painting = findMentionedPainting(text);
  // Ordinary follow-ups stay in the painting. Only an explicit new mention
  // can invite the player back after they have chosen to leave it.
  return painting ? { painting, suppressed: false } : state;
}
function hasArtworkContext(text: string, mention: RegExpMatchArray): boolean {
  const before = text.slice(0, mention.index).slice(-40);
  const after = text.slice(mention.index! + mention[0].length, mention.index! + mention[0].length + 40);
  const titleQuotes = [['《', '》'], ['“', '”'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]];
  if (titleQuotes.some(([open, close]) => before.trimEnd().endsWith(open) && after.trimStart().startsWith(close))) return true;
  return /(?:画作|作品|名画|油画|(?:这|那)(?:幅|张)画)\s*[《“"'「『]?\s*$/u.test(before)
    || /^[》”"'」』\s]*(?:(?:这|那)(?:一)?(?:幅|张)画|(?:的)?(?:画作|作品|原作|油画|系列))/u.test(after)
    || /\b(?:painting|artwork|canvas|series)(?:\s+(?:called|titled|named))?\s*["“']?\s*$/iu.test(before)
    || /^\s*["”']?\s+(?:painting|artwork|series)\b/iu.test(after);
}
export function paintingFromReply(state: PaintingSceneState, text: string): PaintingSceneState {
  if (state.suppressed || state.painting) return state;
  if (declinesPaintingDisplay(text)) return state;
  const relevant = relevantText(text);
  // An artist may mention real flowers in ordinary conversation. Only the
  // player's bare title, or an assistant's explicit artwork reference, opens it.
  const painting = titleMentions(relevant)
    .filter(({ painting, match }) => painting.id !== waterLilies.id || hasArtworkContext(relevant, match))
    .at(-1)?.painting;
  return painting ? { painting, suppressed: false } : state;
}
