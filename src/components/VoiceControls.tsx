import { Square, Volume2 } from 'lucide-react';
import type { Artist, ArtistVoiceSettings } from '@/lib/types';
import { voiceEngineFor, type SpeechController } from '@/lib/useSpeech';
import { artistVoicePreset, voicesForModel, type ServiceVoice } from '@/lib/voiceService';

export function VoiceControls({ catalog, artist, onArtist, onChange, speech }: {
  catalog: Artist[]; artist: Artist; onArtist: (id: string) => void;
  onChange: (values: Partial<ArtistVoiceSettings>) => void; speech: SpeechController;
}) {
  const engine = voiceEngineFor(artist), choice = speech.voiceFor(artist);
  const providers = speech.catalog?.providers ?? [];
  const provider = providers.find(p => p.id === choice?.provider);
  const voices = provider && choice ? voicesForModel(provider, choice.model) : [];
  const recommended = speech.catalog ? artistVoicePreset(artist.id, speech.catalog) : undefined;
  const setChoice = (next: ServiceVoice) => { speech.stop(); onChange({ voiceEngine: 'service', serviceVoice: next }); };
  return <div className="settings-section voice-settings">
    <h3><Volume2 size={16}/>来宾的声音</h3>
    <label>选择艺术家<select value={artist.id} onChange={e => { speech.stop(); onArtist(e.target.value); }}>{catalog.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>声音来源<select value={engine} onChange={e => { speech.stop(); onChange({ voiceEngine: e.target.value as 'device' | 'service' }); }}>
      <option value="service" disabled={!speech.serviceConfigured}>音色服务{!speech.serviceConfigured ? '（未配置）' : ''}</option><option value="device">设备合成音色</option>
    </select></label>
    {engine === 'service' ? <>
      <div className="voice-connection"><span>{speech.connection === 'ready' ? '音色服务已连接' : speech.connection === 'connecting' ? '正在连接音色服务…' : speech.connection === 'off' ? '尚未配置音色服务' : '音色服务未连接'}</span>{speech.serviceConfigured && <button className="text-btn" disabled={speech.connection === 'connecting'} onClick={() => { speech.stop(); void speech.refresh(); }}>重新连接</button>}</div>
      {recommended && <div className="artist-voice-recommendation"><strong>{recommended.title}</strong><p className="form-note">{recommended.description}{recommended.choice.provider === 'volcengine' ? ' 使用豆包 2.0 自然对话音色。' : ''}</p><button className="text-btn" disabled={speech.loading} onClick={() => {
        const settings = { voiceEngine: 'service' as const, serviceVoice: recommended.choice, rate: recommended.rate, pitch: recommended.pitch };
        speech.stop(); onChange(settings); void speech.play(artist.greeting, { ...artist, ...settings });
      }}><Volume2 size={14}/>采用推荐音色并试听</button></div>}
      {providers.length > 0 && <label>语音平台<select value={provider?.id ?? ''} onChange={e => {
          const next = providers.find(p => p.id === e.target.value)!;
          const options = voicesForModel(next, next.defaultModel);
          setChoice({ provider: next.id, model: next.defaultModel, voice: options.find(v => v.id === next.defaultVoice)?.id ?? options[0]?.id ?? '' });
        }}>{!provider && <option value="" disabled>选择可用平台</option>}{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {provider && choice && <>
        <label>语音模型<select value={choice.model} onChange={e => {
          const options = voicesForModel(provider, e.target.value);
          setChoice({ ...choice, model: e.target.value, voice: options.find(v => v.id === choice.voice)?.id ?? options.find(v => v.id === provider.defaultVoice)?.id ?? options[0]?.id ?? '' });
        }}>{!provider.models.some(m => m.id === choice.model) && <option value={choice.model}>已保存模型（当前不可用）</option>}{provider.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>服务音色<select value={choice.voice} onChange={e => setChoice({ ...choice, voice: e.target.value })}>
          {!voices.some(v => v.id === choice.voice) && <option value={choice.voice}>{choice.voice ? '已保存音色（当前不可用）' : '这个模型暂无可用音色'}</option>}
          {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.library ? ' · 音色库' : ''}</option>)}
        </select></label>
      </>}
      {speech.connectionError && <p className="inline-notice">{speech.connectionError}</p>}
      {speech.catalog?.libraryUnavailable && <p className="form-note">音色库暂未读到，当前可使用平台系统音色。</p>}
      {speech.connection === 'ready' && !provider && <p className="form-note">这位来宾保存的音色平台当前不可用，可以改用设备音色。</p>}
    </> : <label>设备音色<select value={artist.voiceURI ?? ''} onChange={e => { speech.stop(); onChange({ voiceEngine: 'device', voiceURI: e.target.value }); }}><option value="">自动选择中文音色</option>{speech.voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label>}
    <div className="form-pair"><label>语速 <span>{artist.rate.toFixed(2)}×</span><input type="range" min="0.65" max="1.25" step="0.01" value={artist.rate} onChange={e => { speech.stop(); onChange({ rate: Number(e.target.value) }); }}/></label><label>音调 <span>{artist.pitch.toFixed(2)}</span><input type="range" min="0.7" max="1.3" step="0.01" value={artist.pitch} onChange={e => { speech.stop(); onChange({ pitch: Number(e.target.value) }); }}/></label></div>
    <div className="voice-preview-actions"><button className="button secondary" disabled={speech.loading || speech.connection === 'connecting' && engine === 'service'} onClick={() => speech.play(artist.greeting, artist)}><Volume2 size={15}/>{speech.loading ? '准备声音…' : `试听${artist.name}`}</button>{(speech.speaking || speech.loading) && <button className="text-btn" onClick={speech.stop}><Square size={13}/>停止播放</button>}</div>
    <p className="voice-playback-status" role="status">{speech.status}</p>
    {speech.error && <p className="inline-notice" role="alert">{speech.error}</p>}
    <p className="form-note">音色是角色演绎，并非艺术家本人原声。选择服务音色后，当前朗读台词会发送到音色服务及所选语音平台，服务可能保留合成记录；不发送整段聊天历史、参考图或原始资料。服务失败会提示并回退设备音色。语音输入仍使用浏览器识别服务，点麦克风后才开始。</p>
  </div>;
}
