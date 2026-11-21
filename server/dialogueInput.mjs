import expressionDirections from '../src/lib/expressionDirections.json' with { type: 'json' };
import paintingCatalog from '../src/lib/paintingCatalog.json' with { type: 'json' };

const paintingIds = new Set(paintingCatalog.map(p => p.id));
export function dialogueContext(input = { scene: 'table' }) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['table', 'painting'].includes(input.scene)) throw new Error('invalid');
  const { scene, paintingId } = input;
  if (paintingId !== undefined && (scene !== 'painting' || typeof paintingId !== 'string' || !paintingIds.has(paintingId))) throw new Error('invalid');
  return scene === 'table' ? { scene } : { scene, ...(paintingId ? { paintingId } : {}) };
}

export function dialogueInput(input) {
  if (!input || typeof input !== 'object' || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 400 || !['private', 'group', 'duo'].includes(input.mode)) throw new Error('invalid');
  const raw = input.persona;
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('invalid');
  const persona = {};
  for (const key of ['id', 'name', 'fullName', 'identityType', 'personality', 'bio', 'medium']) {
    if (typeof raw[key] === 'string') persona[key] = raw[key].slice(0, 1000);
  }
  if (!Array.isArray(input.history) || input.history.length > 12) throw new Error('invalid');
  const history = input.history.map(m => {
    if (!m || !['player', 'artist'].includes(m.who) || typeof m.text !== 'string' || m.text.length > 2000) throw new Error('invalid');
    return { who: m.who, ...(typeof m.name === 'string' ? { name: m.name.slice(0, 80) } : {}), text: m.text };
  });
  const expression = input.expression === undefined ? 'calm' : input.expression;
  if (typeof expression !== 'string' || !Object.hasOwn(expressionDirections, expression)) throw new Error('invalid');
  const workId = input.workId;
  const language = input.language ?? 'zh';
  if (!['zh', 'en'].includes(language)) throw new Error('invalid language');
  if (workId !== undefined && (typeof workId !== 'string' || !paintingIds.has(workId))) throw new Error('invalid');
  return { persona, history, text: input.text.trim(), mode: input.mode, language, expression, context: dialogueContext(input.context), ...(workId ? { workId } : {}) };
}
