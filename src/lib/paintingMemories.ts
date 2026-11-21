import { artists } from './artists.ts';
import { paintingCatalog } from './paintings.ts';
import type { PaintingMemory, Save } from './types';

export const PAINTING_MEMORY_LIMIT = 200;
const paintingIds = new Set(paintingCatalog.map(p => p.id));

function boundedText(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== 'string' || value.length > max) return null;
  const text = value.trim();
  return text || allowEmpty ? text : null;
}

function cleanMemory(raw: unknown, speakers: ReadonlySet<string>): PaintingMemory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = boundedText(value.id, 100);
  const paintingId = boundedText(value.paintingId, 100);
  const speakerId = boundedText(value.speakerId, 128);
  const question = boundedText(value.question, 400);
  const explanation = boundedText(value.explanation, 4000, true);
  const createdAt = value.createdAt;
  if (!id || !paintingId || !paintingIds.has(paintingId) || !speakerId || !speakers.has(speakerId) || !question || explanation === null) return null;
  if (typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)) return null;
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== createdAt) return null;
  if (!Number.isSafeInteger(value.night) || (value.night as number) < 1 || (value.night as number) > 1_000_000) return null;
  // Only known fields survive; artwork images and authorship always come from
  // the local catalog, independently of who happened to discuss the painting.
  return { id, paintingId, speakerId, question, explanation, createdAt, night: value.night as number };
}

/** Repair this optional collection without discarding the rest of an old save. */
export function sanitizePaintingMemories(raw: unknown, validSpeakerIds: Iterable<string>): PaintingMemory[] {
  if (!Array.isArray(raw)) return [];
  const speakers = new Set(validSpeakerIds);
  const seen = new Set<string>();
  const entries: PaintingMemory[] = [];
  for (const value of raw) {
    const memory = cleanMemory(value, speakers);
    if (!memory || seen.has(memory.id)) continue;
    seen.add(memory.id);
    entries.push(memory);
  }
  return entries.slice(-PAINTING_MEMORY_LIMIT);
}

/** Call when an encounter is collected; retries with its same ID are inert. */
export function recordPaintingMemory(save: Save, memory: PaintingMemory): Save {
  const speakers = new Set([...artists, ...save.customArtists].map(a => a.id));
  const next = cleanMemory(memory, speakers);
  if (!next) return save;
  const entries = sanitizePaintingMemories(save.paintingMemories, speakers);
  if (entries.some(entry => entry.id === next.id)) return save;
  return { ...save, paintingMemories: [...entries, next].slice(-PAINTING_MEMORY_LIMIT) };
}
