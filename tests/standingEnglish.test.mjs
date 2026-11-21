import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statSync} from 'node:fs';
import scripts from '../src/lib/standingEnglish.json' with {type:'json'};
import {artists} from '../src/lib/artists.ts';
import {recordedDialogue} from '../src/lib/standingDialogue.ts';
import {parseDuoRequest, duoScript, duoMembers} from '../src/lib/duoConversation.ts';
import {findMentionedPainting} from '../src/lib/paintings.ts';
import {speechParts} from '../src/lib/speechQueue.ts';
import {defaultServiceVoice, englishSpeechDelivery, parseVoiceCatalog, synthesisBody} from '../src/lib/voiceService.ts';
import {createVoiceTurn} from '../src/lib/voiceTurn.ts';
import {dialogueInput} from '../server/dialogueInput.mjs';
import {buildPersonaPrompt} from '../server/nia.mjs';

test('English cues resolve to separate character recordings while Chinese cues retain their original audio', () => {
  for (const row of scripts.dialogue) for (const question of row.questions) {
    assert.equal(recordedDialogue(row.artistId,question+'?', 'en').audio,row.audio);
  }
  const clips=[...scripts.dialogue,...scripts.exchanges.flatMap(e=>e.lines),...Object.values(scripts.paintings).flat(),scripts.rest];
  for(const clip of clips) {
    assert.ok(clip.audio.startsWith('/audio/en/'));
    assert.ok(statSync(new URL('../public'+clip.audio,import.meta.url)).size>1000);
  }
  assert.equal(recordedDialogue('dali','Vincent, how would you paint a lamp?', 'en'),undefined);
  assert.equal(recordedDialogue('vincent','how would you paint a lamp?','zh'),undefined);
  assert.match(recordedDialogue('dali','达利，你会怎么画一盏灯？','zh').audio,/dialogue\/dali/);
});
test('English duo invitations pick the intended artists, while direct artwork requests use the canvas', () => {
  assert.deepEqual(parseDuoRequest('Vincent and Georgia O’Keeffe, talk about colour.', 'en'),
    {named: ['vincent', 'georgia'], topic: 'colour'});
  const cue=parseDuoRequest('Can Van Gogh AND Dalí talk about melting clocks?', 'en');
  assert.deepEqual(cue,{named:['vincent','dali'],topic:'melting clocks'});
  assert.equal(duoScript(duoMembers(artists,cue.named),cue.topic,0,'en').lines[0].artistId,'dali');
  assert.equal(parseDuoRequest('Show me the starry sky', 'en'),null);
  assert.equal(findMentionedPainting('Show me the starry sky').id,'starry-night');
  assert.equal(findMentionedPainting("Don't show me The Starry Night"),null);
  assert.equal(parseDuoRequest("Don't let them talk about rain", 'en'),null);
});
test('English replies and microphone fragments preserve word boundaries', () => {
  const input='A red chair beside the open window catches the light from the patch of wet grass. I would leave it there.';
  const spoken=speechParts(input,true,48,'en').parts;
  assert.equal(spoken.join(''),input);
  assert.equal(spoken.length,2);
  let draft='';
  const turn=createVoiceTurn({language:'en',onDraft:text=>{draft=text;},onSubmit(){}});
  turn.results([{isFinal:true,0:{transcript:'Look at'}},{isFinal:true,0:{transcript:'the sky'}}]);
  assert.equal(draft,'Look at the sky');turn.cancel();
});
test('streaming English waits for the phrase and keeps titles and decimals together', () => {
  const phrase = 'I would set that red chair in the corner by the open window so the fading light can catch the old scratches in the wood';
  assert.deepEqual(speechParts(phrase, false, 48, 'en'), {parts: [], rest: phrase});
  assert.deepEqual(speechParts(phrase + '. See', false, 48, 'en'), {parts: [phrase + '.'], rest: ' See'});
  const first = 'Dr. Gray and J. Smith paid 3.50 for the blue paint.';
  assert.deepEqual(speechParts(first + ' So did I. Your turn.', true, 48, 'en').parts, [first, ' So did I.', ' Your turn.']);
  const clause = 'The last of the daylight catches the edge of that chair,';
  const tail = ' and I would put the blue pot much closer to the window so its shadow can reach the foot of the easel';
  assert.deepEqual(speechParts(clause + tail, false, 48, 'en'), {parts: [clause], rest: tail});
});
test('English delivery reaches each provider without clipping the direction', () => {
  const vincent = englishSpeechDelivery('vincent', 1, 'curious');
  const dali = englishSpeechDelivery('dali', 1);
  const options = synthesisBody({provider:'volcengine',model:'seed-tts-2.0-expressive',voice:'en_male_tim_uranus_bigtts'}, 'Look at the light.', vincent.rate, 1, vincent.style).options;
  assert.equal(options.contextTexts, vincent.style);
  assert.equal(options.speed, 4);
  assert.match(vincent.style, /consonants/i);
  const dry = synthesisBody({provider:'minimax',model:'speech-2.8-hd',voice:'English_Trustworthy_Man'}, 'A soft watch?', dali.rate, 1, dali.style).options;
  assert.equal(dry.speed, .96);
  assert.equal(dry.languageBoost, 'English');
});
test('English defaults cast two distinct expressive speakers and pass through their acting direction', () => {
  const voices = ['zh_male_m191_uranus_bigtts', 'zh_male_liufei_uranus_bigtts', 'en_male_tim_uranus_bigtts'];
  const model = 'seed-tts-2.0-expressive';
  const catalog = parseVoiceCatalog({providers: {volcengine: {ready:true, defaultModel:model,
    models:[{id:model, voices:voices.map(id => ({id}))}]}}}, {});
  for (const [index, id] of ['vincent', 'dali'].entries()) {
    const choice = defaultServiceVoice(id, catalog, 'en');
    assert.equal(choice.voice, voices[index]);
    for (const expression of ['calm', 'warm', 'firm', 'curious']) {
      const {rate, style, pitch} = englishSpeechDelivery(id, 1, expression, .98);
      const voice = synthesisBody(choice, 'Look at this.', rate, pitch, style).options;
      assert.equal(voice.contextTexts, style);
      assert.equal(Number(voice.pitch) + 0, id === 'dali' ? -2 : 0);
      assert.equal(voice.speed, id === 'dali' ? -4 : 4);
    }
  }
  assert.equal(defaultServiceVoice('monet', catalog, 'en').voice, voices[2]);
});
test('NIA accepts English for private and duo replies and defaults older clients to Chinese', () => {
  const persona=artists.find(a=>a.id==='dali');
  for(const mode of ['private','duo']){
    const request={persona,text:'A soft watch?',history:[],mode};
    assert.equal(dialogueInput(request).language,'zh');
    assert.equal(dialogueInput({...request,language:'en'}).language,'en');
    assert.match(buildPersonaPrompt(persona,mode,'calm',undefined,{language:'en'}),/only in natural conversational English/);
    assert.throws(()=>dialogueInput({...request,language:'other'}));
  }
});
