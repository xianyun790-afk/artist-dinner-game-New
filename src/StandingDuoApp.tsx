import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { BookOpen, Check, MessagesSquare, Plus, Square, X } from 'lucide-react';
import { artists } from '@/lib/artists';
import { recordedDialogue } from '@/lib/standingDialogue';
import { duoMembers, duoScript, parseDuoRequest, playDuoConversation } from '@/lib/duoConversation';
import { findMentionedPainting } from '@/lib/paintings';
import { paintingNarration } from '@/lib/paintingNarration';
import { recordPaintingMemory } from '@/lib/paintingMemories';
import { usePaintingJourney } from '@/lib/usePaintingJourney';
import { loadSave, writeSave } from '@/lib/storage';
import { uid } from '@/lib/engine';
import { crouchTargets, defaultStandingGuests, standingModels, tiredAside as chineseAside } from '@/lib/standingGuests';
import scripts from '@/lib/standingEnglish.json';
import { displayName, english, englishAddress, language, setStandingLanguage, standingLocale, t, type Language } from '@/lib/standingLanguage';
import { deriveArtistExpression } from '@/lib/artistExpression';
import { useDialogue } from '@/lib/useDialogue';
import { directlyAddressedArtists, responderFor, roomReply, everydayFallback } from '@/lib/room';
import { requestsLifeVisit } from '@/lib/conversationIntent';
import { useSpeech } from '@/lib/useSpeech';
import type { DialogueLine } from '@/lib/dialogueService';
import type { Artist } from '@/lib/types';
import { RoomInput } from '@/components/RoomInput';
import { PaintingScene } from '@/components/PaintingScene';
import { StandingScene } from '@/components/StandingScene';
import { PaintingMemories } from '@/components/PaintingMemories';
import { Modal } from '@/components/ui/Modal';
import type { ArtistReply } from '@/components/ArtistBubble';
import { CafeVisit } from './cafe/CafeVisit';

const englishAside = { ...scripts.rest, recordingUrl: scripts.rest.audio };
const guestTags: Record<string, string> = { vincent: 'Colour and brushwork', dali: 'Dreams and the unexpected', monet: 'Light and reflections', georgia: 'Colour and form' };

export default function StandingDuoApp() {
  const [locale, setLocale] = useState(language);
  const languageLink = new URL(window.location.href);
  languageLink.searchParams.set('lang', locale === 'en' ? 'zh' : 'en');
  const applyLocale = useCallback((next: Language) => {
    setStandingLanguage(next);
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    document.title = next === 'en' ? 'Afterglow New — Artist Conversations' : '余光 AFTERGLOW New — 艺术家晚宴';
    setLocale(next);
  }, []);
  useEffect(() => {
    const restore = () => applyLocale(standingLocale(new URLSearchParams(location.search)));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [applyLocale]);
  const switchLanguage = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, '', languageLink);
    applyLocale(locale === 'en' ? 'zh' : 'en');
  };

  const [guestIds, setGuestIds] = useState<string[]>(() => [...defaultStandingGuests]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState<ArtistReply | null>(null);
  const [pending, setPending] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [guestPanel, setGuestPanel] = useState(false);
  const [memoryPanel, setMemoryPanel] = useState(false);
  const closeMemories = useCallback(() => setMemoryPanel(false), []);
  const [cafeOpen, setCafeOpen] = useState(false);
  const [talkingPair, setTalkingPair] = useState<readonly string[] | null>(null);
  const [roomNotice, setRoomNotice] = useState('');
  const exchangeIndex = useRef(0);
  const duoRunning = useRef(false);
  const [history, setHistory] = useState<Record<string, DialogueLine[]>>({});
  const previousSpeaker = useRef<string | null>(null);
  const crouchRequest = useRef<readonly string[] | null>(
    new URLSearchParams(window.location.search).get('pose') === 'squat' ? ['vincent'] : null,
  );
  const request = useRef<AbortController | null>(null);
  const [aside, setAside] = useState<ArtistReply | null>(null);
  const [composing, setComposing] = useState(false);
  const [memoryError, setMemoryError] = useState('');
  const journey = usePaintingJourney(memory => {
    const saved = writeSave(recordPaintingMemory(loadSave().save, memory));
    setMemoryError(saved ? '' : t("浏览器未能保存这次画作回忆。", "Could not save this painting memory."));
  });
  const painting = journey.state.painting;
  const startNarration = useRef<(() => void) | null>(null);
  const asideController = useRef<AbortController | null>(null);
  const asideTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restRecordings = useRef<Partial<Record<Language, AudioBuffer>>>({});
  const dialogue = useDialogue();
  const speech = useSpeech();
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const guests = useMemo(() => guestIds.map(id => artists.find(artist => artist.id === id)).filter((artist): artist is Artist => !!artist), [guestIds]);

  useEffect(() => {
    const controller = new AbortController();
    for (const [lang, aside] of [['zh', chineseAside], ['en', englishAside]] as const) {
      void speech.prepareRecording(aside.recordingUrl, controller.signal).then(buffer => {
        if (!controller.signal.aborted) restRecordings.current[lang] = buffer;
      }).catch(() => { /* Use the artist's regular voice if the clip cannot load. */ });
    }
    return () => controller.abort();
  }, [speech.prepareRecording]);

  const clearAside = useCallback(() => {
    asideController.current?.abort();
    asideController.current = null;
    clearTimeout(asideTimeout.current);
    setAside(null);
  }, []);
  const stop = useCallback(() => {
    startNarration.current = null;
    clearAside();
    request.current?.abort();
    request.current = null;
    duoRunning.current = false;
    setTalkingPair(null);
    speechRef.current.stop();
    setPending(false);
    setReply(current => current?.thinking ? null : current);
  }, [clearAside]);

  const exitPainting = useCallback(() => {
    journey.exit();
    stop();
  }, [journey.exit, stop]);

  useEffect(() => {
    const onHide = () => {
      if (!document.hidden) return;
      if (duoRunning.current) stop();
      else clearAside();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      request.current?.abort();
      asideController.current?.abort();
      clearTimeout(asideTimeout.current);
    };
  }, [clearAside, stop]);

  const ambientAllowed = arrived && !painting && !cafeOpen && !memoryPanel && !talkingPair && !guestPanel && !pending && !speech.speaking && !speech.loading && !composing && !aside;
  const sayTired = () => {
    const tiredAside = locale === 'en' ? englishAside : chineseAside;
    const artist = guests.find(guest => guest.id === tiredAside.artistId);
    if (!artist || document.hidden || !ambientAllowed || request.current || asideController.current) return;
    const controller = new AbortController();
    asideController.current = controller;
    setAside({ artistId: artist.id, text: tiredAside.text, thinking: false });
    const voice = speech.startStream(artist, controller.signal, undefined, { recording: restRecordings.current[locale], language: locale });
    voice.push(tiredAside.text);
    voice.end();
    void voice.done.finally(() => {
      if (!controller.signal.aborted) asideTimeout.current = setTimeout(clearAside, 1600);
    });
  };

  const startDuo = (topic: string, named: string[] = []) => {
    if (!arrived || painting) return;
    const members = duoMembers(guests, named);
    stop();
    if (!members) {
      setRoomNotice(named.length ? t("先把这两位艺术家都请到场上吧。", "Invite both artists to the studio first.") : t("再请一位艺术家，就能听他们聊了。", "Invite a second artist to start a conversation."));
      return;
    }
    const preset = duoScript(members, topic, exchangeIndex.current);
    if (!topic && preset) exchangeIndex.current++;
    const subject = topic || preset?.topics[0] || t("傍晚散步时最想多看一眼的东西", "something worth stopping for on an evening walk");
    speech.unlock();
    setGuestPanel(false);
    setRoomNotice('');
    setTalkingPair(members.map(a => a.id));
    duoRunning.current = true;
    const controller = new AbortController();
    request.current = controller;
    let opened = false;
    void playDuoConversation(members, subject, preset, controller.signal, {
      generate: (turn, direction, history) => dialogue.reply(turn.artist, direction, history, 'duo', turn.text, controller.signal, undefined, undefined, 'calm', { scene: 'table' }, locale),
      thinking: ({ artist }) => setReply({ artistId: artist.id, text: '', thinking: true }),
      present: ({ artist, text }) => {
        previousSpeaker.current = artist.id;
        setReply({ artistId: artist.id, text, thinking: false });
        const lines: DialogueLine[] = opened ? [] : [{ who: 'player', name: t("话题", "Topic"), text: subject }];
        opened = true;
        lines.push({ who: 'artist', name: displayName(artist), text });
        setHistory(current => {
          const next = { ...current };
          for (const member of members) next[member.id] = [...(current[member.id] ?? []), ...lines].slice(-12);
          return next;
        });
      },
      speak: ({ artist, text }, audio) => {
        const voice = speechRef.current.startStream(artist, controller.signal, undefined, { recordingUrl: audio, language: locale });
        voice.push(text);
        voice.end();
        return voice.done;
      },
    }, locale).catch(() => {
      if (!controller.signal.aborted) setRoomNotice(t("这次对谈中断了，可以重新开始。", "The conversation stopped. You can start it again."));
    }).finally(() => {
      if (request.current !== controller) return;
      request.current = null;
      duoRunning.current = false;
      setTalkingPair(null);
      setReply(current => current?.thinking ? null : current);
    });
  };

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || pending || !arrived || guestPanel || painting || cafeOpen || memoryPanel) return;
    setRoomNotice('');
    const duo = parseDuoRequest(text);
    if (duo) { startDuo(duo.topic, duo.named); return; }
    const namedInEnglish = englishAddress(text);
    if (requestsLifeVisit(namedInEnglish?.rest ?? text)) {
      const recipient = namedInEnglish?.id ?? directlyAddressedArtists(text, artists)[0]?.id
        ?? selectedId ?? previousSpeaker.current ?? 'vincent';
      if (recipient === 'vincent' && guestIds.includes(recipient)) {
        stop();
        previousSpeaker.current = recipient;
        setCafeOpen(true);
        return;
      }
    }
    // Only a direct request triggers the gesture. Talking about a squatting
    // figure in a painting or asking someone not to squat stays a conversation.
    const address = english ? namedInEnglish : null;
    const targets = english && /^(?:please\s+)?(?:crouch|squat)(?: down)?(?: for a moment)?[.!?]*$/i.test(address?.rest ?? text)
      ? crouchTargets('蹲下', guestIds, address?.id ?? selectedId) : crouchTargets(text, guestIds, selectedId);
    if (targets) {
      stop();
      crouchRequest.current = targets;
      const daliStays = !targets.length && guestIds.includes('dali') && (text.includes('达利') || address?.id === 'dali' || selectedId === 'dali' || guestIds.length === 1);
      setReply(daliStays ? { artistId: 'dali', text: t("我站着就好。", "I think I'll stay standing."), thinking: false } : null);
      return;
    }
    const work = findMentionedPainting(text);
    const tours: typeof paintingNarration = english ? scripts.paintings : paintingNarration;
    const narration = work && tours[work.id];
    const artist = work
      ? artists.find(a => a.id === work.artistId)
      : guests.find(a => a.id === address?.id) ?? responderFor(text, guests, selectedId, previousSpeaker.current) ?? guests[0];
    if (!artist) return;
    stop();
    speech.unlock();
    setGuestPanel(false);
    setPending(true);
    previousSpeaker.current = artist.id;
    const controller = new AbortController();
    request.current = controller;
    const remember = (line: string) => {
      const playerLine: DialogueLine = { who: 'player', name: t("玩家", "Player"), text };
      const artistLine: DialogueLine = { who: 'artist', name: displayName(artist), text: line };
      setHistory(current => ({
        ...current,
        [artist.id]: [...(current[artist.id] ?? []), playerLine, artistLine].slice(-12),
      }));
    };
    const finished = () => {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    };
    if (work) {
      const token = uid();
      const visit = { speakerId: artist.id, question: text, night: loadSave().save.night };
      journey.begin(token, text);
      journey.capture(token, { ...visit, explanation: '' });
      setReply(null);
      startNarration.current = () => {
        if (controller.signal.aborted) return;
        if (!narration?.length) { finished(); return; }
        let shown = '';
        const voice = speechRef.current.startStream(artist, controller.signal, sentence => {
          shown += (locale === 'en' && shown ? ' ' : '') + sentence;
          journey.capture(token, { ...visit, explanation: shown });
        }, { language: locale, recordingUrl: sentence => narration.find(clip => clip.text === sentence)?.audio });
        for (const clip of narration) voice.push(clip.text);
        voice.end();
        void voice.done.then(() => { if (shown) remember(shown); }).finally(finished);
      };
      return;
    }
    setReply({ artistId: artist.id, text: '', thinking: true });
    const prior = history[artist.id] ?? [];
    const offlineLines: Record<string, string> = {
      vincent: "What's the first detail you noticed? That's where I'd start.",
      dali: "Tell me the oddest part. That's usually where my attention wanders.",
      monet: "Which part caught your eye? I'd like to look at it with you.",
      georgia: "Come closer. Which edge did you notice first?",
    };
    const fallback = english ? offlineLines[artist.id] ?? "I'm listening. Go on." : roomReply(artist, text) ?? everydayFallback(artist, text);
    const expression = deriveArtistExpression(undefined, text);
    const preset = recordedDialogue(artist.id, text);
    const voice = speech.startStream(artist, controller.signal, undefined, {
      expression, submittedAt: performance.now(), recordingUrl: preset?.audio, language: locale,
    });
    let partial = '';
    const onSentence = (sentence: string) => {
      partial += sentence;
      voice.push(sentence);
      setReply({ artistId: artist.id, text: partial, thinking: false });
    };
    if (preset) onSentence(preset.text);
    const replyTask = preset ? Promise.resolve(preset.text) : dialogue.reply(
      artist, text, prior, 'private', fallback, controller.signal, onSentence, undefined, expression, { scene: 'table' }, locale,
    );
    void replyTask.then(line => {
      if (controller.signal.aborted || request.current !== controller) return;
      remember(line);
      setReply({ artistId: artist.id, text: line, thinking: false });
      voice.end();
      return voice.done;
    }).catch(() => {
      voice.end();
    }).finally(finished);
  };

  const select = (id: string) => {
    if (duoRunning.current) stop();
    setSelectedId(current => current === id ? null : id);
  };
  const toggleGuest = (id: string) => {
    if (!standingModels[id] || (guestIds.length === 1 && guestIds[0] === id)) return;
    stop();
    setArrived(false);
    setGuestPanel(false);
    setReply(null);
    if (selectedId === id) setSelectedId(null);
    crouchRequest.current = null;
    setGuestIds(current => current.includes(id) ? current.length > 1 ? current.filter(value => value !== id) : current : [...current, id]);
  };

  return <div className="standing-app" onClickCapture={speech.unlock} onKeyDownCapture={speech.unlock}>
    <main className="standing-stage" aria-label={t("艺术家白色摄影棚", "Artists’ studio")} inert={!!painting || memoryPanel}>
      <StandingScene
        guests={guests}
        crouchRequest={crouchRequest}
        talkingPair={talkingPair}
        ambientAllowed={ambientAllowed}
        covered={cafeOpen}
        onRestLowered={sayTired}
        reply={aside ?? reply}
        selectedId={selectedId}
        speaking={speech.speaking}
        responding={pending || !!talkingPair}
        onSelect={select}
        onEntranceComplete={() => setArrived(true)}
      />

      <a className="standing-language" href={languageLink.href} hrefLang={locale === 'en' ? 'zh' : 'en'} onClick={switchLanguage}>{t('English', '中文')}</a>
      <button className="standing-memory" aria-label={t('回忆记录', 'Memories')} title={t('回忆记录', 'Memories')}
        aria-haspopup="dialog" onClick={() => { stop(); setGuestPanel(false); setMemoryPanel(true); }}>
        <BookOpen size={17} strokeWidth={1.5} />
      </button>
      {guests.length >= 2 && <button className="standing-duo" disabled={!arrived} aria-pressed={!!talkingPair}
        title={talkingPair ? t("结束这段对谈", "End this conversation") : t("也可以说「你们俩聊聊……」指定话题", "Try saying “You two, talk about…”")}
        onClick={() => talkingPair ? stop() : startDuo('')}>
        {talkingPair ? <Square size={14} /> : <MessagesSquare size={16} />}
        {talkingPair ? t("结束对谈", "End conversation") : t("听他们聊", "Listen in")}
      </button>}
      <button className="standing-add" aria-label={t("添加艺术家", "Invite artists")} aria-expanded={guestPanel} onClick={() => { stop(); setGuestPanel(open => !open); }}>
        {guestPanel ? <X size={19} /> : <Plus size={20} />}
      </button>

      {guestPanel && <aside className="standing-guest-panel" aria-label={t("添加艺术家", "Invite artists")}>
        <p>{t("来宾", "Guests")}</p>
        {artists.filter(artist => ['vincent', 'dali', 'monet', 'georgia'].includes(artist.id)).map(artist => {
          const supported = !!standingModels[artist.id];
          const selected = guestIds.includes(artist.id);
          return <button key={artist.id} disabled={!supported || (selected && guestIds.length === 1)} aria-pressed={selected} onClick={() => toggleGuest(artist.id)}>
            <span><strong>{displayName(artist)}</strong><small>{supported ? t(artist.tag, guestTags[artist.id]) : t('等待全身模型', '3D model in progress')}</small></span>
            {selected && <Check size={15} />}
          </button>;
        })}
      </aside>}

      <RoomInput
        onSend={send}
        onComposingChange={setComposing}
        busy={!arrived || pending || guestPanel || !!painting || cafeOpen || memoryPanel}
        speaking={speech.speaking}
        loading={speech.loading}
        onStop={stop}
        onUnlock={speech.unlock}
        responding={pending || !!talkingPair}
        speechError={roomNotice || memoryError || speech.error || dialogue.error}
      />
    </main>
    {cafeOpen && <CafeVisit onLeave={() => setCafeOpen(false)} />}
    {memoryPanel && <Modal title={t('回忆记录', 'Memories')} onClose={closeMemories} wide>
      <PaintingMemories memories={loadSave().save.paintingMemories ?? []} artists={artists} onReplay={work => {
        closeMemories();
        journey.replay(work);
      }} />
    </Modal>}
    {painting && <PaintingScene key={painting.id} painting={painting} phase={journey.state.phase}
      onLeave={exitPainting} subtitle={journey.state.phase === 'viewing' ? speech.caption?.text ?? null : null}
      onLoad={() => {
        journey.loaded(painting.id);
        const narrate = startNarration.current;
        startNarration.current = null;
        narrate?.();
      }}
      onError={() => { journey.failed(painting.id); stop(); }}
    />}
  </div>;
}
