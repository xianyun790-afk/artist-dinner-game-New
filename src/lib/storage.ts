import { freshSave } from './engine.ts';
import { artists } from './artists.ts';
import { sanitizePaintingMemories } from './paintingMemories.ts';
import type { Save } from './types';
const slot = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slot')?.replace(/[^a-z0-9_-]/gi,'').slice(0,40) : '';
const site = (import.meta.env?.BASE_URL ?? '/').replace(/^\/|\/$/g, '');
const KEY = ['afterglow-dinner-v1', site, slot].filter(Boolean).join('-');
const nodes = new Set(['hello','topic','invite','draw','reaction','disagreement','warning','paused','naming','saved','company']);
export function loadSave(): { save: Save; error?: string } {
  let raw:string|null=null;
  try {
    raw = localStorage.getItem(KEY); if (!raw) return { save: freshSave() };
    const s = JSON.parse(raw) as Save;
    if (s.version !== 1 || !Number.isInteger(s.night) || s.night < 1 || !Array.isArray(s.invited) || !Array.isArray(s.works) || !Array.isArray(s.customArtists) || !s.people || typeof s.people !== 'object') throw new Error('invalid save');
    for (const p of Object.values(s.people)) {
      if (!nodes.has(p.node) || !Array.isArray(p.messages) || !Array.isArray(p.memories) || !Array.isArray(p.evidence) || !Array.isArray(p.draftPaths)) throw new Error('invalid character');
    }
    if (!s.invited.length || s.invited.length > 5 || s.invited.some(x => typeof x !== 'string')) throw new Error('invalid roster');
    if (s.customArtists.some(a=>!a || typeof a.id!=='string' || typeof a.name!=='string' || typeof a.greeting!=='string' || typeof a.image!=='string')) throw new Error('invalid custom artist');
    const ids=new Set([...artists,...s.customArtists].map(a=>a.id));
    if (s.invited.some(id=>!ids.has(id)) || new Set(s.invited).size!==s.invited.length) throw new Error('unknown guest');
    // New optional group data never invalidates an otherwise readable old save.
    s.groupChats = Array.isArray(s.groupChats) ? s.groupChats.filter(g => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.memberIds) && g.memberIds.length >= 2 && g.memberIds.length <= 5 && new Set(g.memberIds).size === g.memberIds.length && g.memberIds.every(id => ids.has(id)) && Array.isArray(g.messages) && g.messages.every(m => m && typeof m.id === 'string' && typeof m.text === 'string' && (m.who === 'player' || m.who === 'artist' && g.memberIds.includes(m.artistId ?? '')))) : [];
    s.paintingMemories = sanitizePaintingMemories(s.paintingMemories, ids);
    s.activeId = null; // Restore the room; conversation checkpoints remain intact.
    s.voiceSettings ??= {};
    return { save: s };
  } catch {
    let backedUp=false;
    try {if(raw){localStorage.setItem(`${KEY}-recovery-${Date.now()}`,raw);backedUp=true;}}catch{}
    return {save:freshSave(),error:backedUp?'没有读到有效存档，已在浏览器中保留原始备份并开启新晚宴。':'没有读到有效存档，已开启新的晚宴。'};
  }
}
export function writeSave(save: Save): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch { return false; }
}
export function exportSave(save: Save) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(save,null,2)],{type:'application/json'})); link.download = `余光-第${save.night}夜存档.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000);
}
