import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARTIST_CARD_FORMAT, artistCard, draftToArtist, emptyArtistDraft, parseArtistProfile } from '../src/lib/artistImport.ts';

test('a local card round-trips editable persona content without including reference media', () => {
  const draft = { ...emptyArtistDraft(), name: '许白', personality: '慢热，喜欢纸边', referenceImage: 'data:image/webp;base64,AAAA' };
  const card = artistCard(draft);
  assert.equal('referenceImage' in card, false);
  const parsed = parseArtistProfile(JSON.stringify(card), '许白.artist.json');
  assert.equal(parsed.name, '许白'); assert.equal(parsed.personality, draft.personality);
});
test('plain text remains source material rather than inventing a name or personality', () => {
  assert.deepEqual(parseArtistProfile('一位喜欢拼贴的艺术家。', '资料.md'), { sourceNotes: '一位喜欢拼贴的艺术家。' });
});
test('unknown IDs, external assets, actions, voices and memories cannot be imported', () => {
  const parsed = parseArtistProfile(JSON.stringify({ format: ARTIST_CARD_FORMAT, name: '新来宾', id: 'monet', image: 'https://example.com/pic.png', voiceURI: 'other', memories: ['private'], actions: ['save-all'], avatar: 'unknown' }), 'card.json');
  assert.deepEqual(parsed, { name: '新来宾' });
});
test('a reference is saved separately while the stage uses an existing uniform model', () => {
  const draft = { ...emptyArtistDraft(), name: '许白', referenceImage: 'data:image/webp;base64,AAAA', sourceNotes: '用户提供的资料' };
  const artist = draftToArtist(draft, 'custom-new');
  assert.equal(artist.image, '/art/lin.webp'); assert.equal(artist.referenceImage, draft.referenceImage);
  assert.equal(artist.sourceNotes, draft.sourceNotes); assert.equal(artist.voiceURI, undefined);
  assert.equal(artist.greeting.includes('许白'), true); assert.equal(artist.identityType, 'fictional');
});
test('real artist imports remain marked as interpretation, not verified biographical claims', () => {
  const artist = draftToArtist({ ...emptyArtistDraft(), name: '某艺术家', identityType: 'historical' }, 'custom-real');
  assert.equal(artist.years, '真实艺术家 · AI 演绎'); assert.equal(artist.custom, true);
});
test('invalid files leave the caller free to keep its draft intact', () => {
  for (const [text, filename] of [['{', 'bad.json'], ['{}', 'foreign.json'], ['', 'empty.txt'], ['内容', 'unknown.pdf']]) {
    assert.throws(() => parseArtistProfile(text, filename));
  }
  assert.throws(() => parseArtistProfile('a'.repeat(12001), 'large.txt'), /12000/);
  assert.throws(() => parseArtistProfile('a'.repeat(102401), 'huge.json'), /100 KB/);
  assert.throws(() => parseArtistProfile(JSON.stringify({ format: ARTIST_CARD_FORMAT, name: 'x', identityType: ['historical'] }), 'bad-type.json'));
  assert.throws(() => parseArtistProfile(JSON.stringify({ format: ARTIST_CARD_FORMAT, name: 'x'.repeat(31) }), 'bad-name.json'));
  assert.throws(() => draftToArtist(emptyArtistDraft(), 'custom-empty'));
});
