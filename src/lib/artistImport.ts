import { artists } from './artists.ts';
import type { Artist } from './types.ts';

export const ARTIST_CARD_FORMAT = 'afterglow.artist.v1';
export const MAX_PROFILE_BYTES = 100 * 1024;
export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;
export interface ArtistDraft {
  name: string; medium: string; personality: string; background: string;
  observation: string; rule: string; avatar: string;
  identityType: 'fictional' | 'historical'; sourceNotes: string; referenceImage: string;
}
export const emptyArtistDraft = (): ArtistDraft => ({
  name: '', medium: '纸本拼贴', personality: '慢热，有自己的坚持', background: '',
  observation: '我想先听听，你今天想聊什么。', rule: '可以保留不同的看法，不必马上达成一致。',
  avatar: 'lin', identityType: 'fictional', sourceNotes: '', referenceImage: '',
});
const limits: Record<string, number> = { name: 30, medium: 80, personality: 400, background: 4000, observation: 300, rule: 300, sourceNotes: 12000 };

// Import only known content fields. Uploaded files cannot set IDs, assets,
// executable instructions, voices, game rules, or someone else's memories.
export function parseArtistProfile(text: string, filename: string): Partial<ArtistDraft> {
  if (new TextEncoder().encode(text).length > MAX_PROFILE_BYTES) throw new Error('资料文件请控制在 100 KB 以内。');
  if (/\.(txt|md)$/i.test(filename)) {
    if (!text.trim()) throw new Error('这个资料文件是空的。');
    if (text.length > 12000) throw new Error('文字资料最多 12000 字，请精简后重试。');
    return { sourceNotes: text.trim() };
  }
  if (!/\.json$/i.test(filename)) throw new Error('资料支持 TXT、Markdown 或本游戏的 JSON 角色卡。');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('角色卡不是有效的 JSON，请检查文件。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || (data as Record<string, unknown>).format !== ARTIST_CARD_FORMAT) {
    throw new Error('这不是本游戏的角色卡，可先下载示例填写；其他资料可保存为 TXT 导入。');
  }
  const input = data as Record<string, unknown>;
  const result: Partial<ArtistDraft> = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > max) throw new Error(`角色卡字段 ${key} 格式不正确或内容过长。`);
    Object.assign(result, { [key]: value.trim() });
  }
  if (!result.name) throw new Error('角色卡中需要一个名字。');
  if (input.identityType !== undefined) {
    if (typeof input.identityType !== 'string' || !['fictional', 'historical'].includes(input.identityType)) throw new Error('角色类型需为 fictional 或 historical。');
    result.identityType = input.identityType as ArtistDraft['identityType'];
  }
  if (typeof input.avatar === 'string' && artists.some(a => a.id === input.avatar)) result.avatar = input.avatar;
  return result;
}

export function draftToArtist(draft: ArtistDraft, id: string): Artist {
  if (!draft.name.trim()) throw new Error('先给这位来宾填写名字。');
  const base = artists.find(a => a.id === draft.avatar) ?? artists[4];
  const name = draft.name.trim().slice(0, 30);
  return {
    ...base, id, name, fullName: name, english: 'Your invited artist',
    years: draft.identityType === 'historical' ? '真实艺术家 · AI 演绎' : '原创虚构人物',
    tag: '带着自己的眼光入席', medium: draft.medium, personality: draft.personality,
    bio: draft.background || '一位由你邀请、由你定义的艺术家。',
    observation: draft.observation, rule: draft.rule, custom: true, identityType: draft.identityType,
    sourceNotes: draft.sourceNotes, referenceImage: draft.referenceImage || undefined,
    greeting: `你好，我是${name}。${draft.observation}`,
    goal: '从普通的小事开始交谈', firstMark: '一段尚未命名的线',
    heavy: '这一笔有了分量。可以先留下，再看旁边发生了什么。',
    light: '这一笔很轻。我们先按你的意思看。', circle: '旁边多了一个形状。它们的关系也变了。',
    disagreement: '可以保留你的看法。我也想再看一遍，不必现在达成一致。',
    quiet: '好。我们先坐一会儿。',
    // A template supplies a uniform look, never the template artist's voice.
    voiceURI: undefined, rate: .95, pitch: 1,
  };
}

export function artistCard(draft: ArtistDraft) {
  const { referenceImage: _reference, ...content } = draft;
  return { format: ARTIST_CARD_FORMAT, ...content };
}

export async function readPortraitReference(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('参考图支持 PNG、JPG 或 WebP。');
  if (file.size > MAX_PORTRAIT_BYTES) throw new Error('参考图请控制在 5 MB 以内。');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('图片没有读出来，请换一张试试。')); img.src = url; });
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，请缩小后再上传。');
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片，文字资料仍可使用。');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/webp', .78);
    if (data.length > 450_000) throw new Error('这张图片处理后仍然过大，请换一张较小的参考图。');
    return data;
  } finally { URL.revokeObjectURL(url); }
}
