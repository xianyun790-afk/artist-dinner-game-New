import type { Artist } from './types';

export type Language = 'zh' | 'en';
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
export const standingVersion = query.get('version') !== 'dinner';
export let language: Language = standingVersion && query.get('lang') === 'en' ? 'en' : 'zh';
export let english = language === 'en';
export function setStandingLanguage(next: Language) {
  language = next;
  english = next === 'en';
}
export const t = (chinese: string, translation: string) => english ? translation : chinese;
export const displayName = (artist: Artist) => t(artist.name, artist.english);

const names = /^(?:hey\s+|hi\s+|hello\s+|dear\s+)?(vincent(?: van gogh)?|van gogh|(?:salvador )?dal[ií]|salvador|(?:claude )?monet|claude|georgia(?: o['’]keeffe)?|o['’]keeffe)(?=$|[\s,:!?])/i;
export function englishAddress(input: string) {
  const match = names.exec(input.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  const id = /vincent|gogh/.test(name) ? 'vincent' : /dal|salvador/.test(name) ? 'dali' : /claude|monet/.test(name) ? 'monet' : 'georgia';
  return { id, rest: input.trim().slice(match[0].length).replace(/^[\s,:!?]+/, '') };
}
