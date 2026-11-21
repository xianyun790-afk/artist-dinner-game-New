import { gameAsset } from '@/lib/gameAssets';
import { useEffect, useRef, useState } from 'react';
import { Download, Upload, Volume2 } from 'lucide-react';
import { artists } from '@/lib/artists';
import { uid } from '@/lib/engine';
import { artistCard, draftToArtist, emptyArtistDraft, MAX_PROFILE_BYTES, parseArtistProfile, readPortraitReference, type ArtistDraft } from '@/lib/artistImport';
import type { Artist } from '@/lib/types';

const slot = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('slot')?.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : '';
const DRAFT_KEY = `afterglow-artist-draft-v1${slot ? `-${slot}` : ''}`;
function restoreDraft(): ArtistDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyArtistDraft();
    const saved = JSON.parse(raw);
    const { referenceImage: _reference, ...profile } = saved;
    const valid = parseArtistProfile(JSON.stringify({ ...profile, name: saved.name || '未命名', format: 'afterglow.artist.v1' }), 'draft.json');
    const referenceImage = typeof saved.referenceImage === 'string' && saved.referenceImage.length < 450_001 && /^data:image\/(webp|png|jpeg);base64,/.test(saved.referenceImage) ? saved.referenceImage : '';
    return { ...emptyArtistDraft(), ...valid, name: saved.name || '', referenceImage };
  } catch { return emptyArtistDraft(); }
}
export function ArtistCreator({ onCreate, onPreview }: { onCreate: (artist: Artist) => void; onPreview: (artist: Artist) => void }) {
  const [draft, setDraft] = useState(restoreDraft);
  const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const [reading, setReading] = useState(false); const [draftSaved, setDraftSaved] = useState(true);
  const token = useRef(0);
  useEffect(() => () => { token.current++; }, []);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); setDraftSaved(true); } catch { setDraftSaved(false); }
  }, [draft]);
  const change = (values: Partial<ArtistDraft>) => setDraft(d => ({ ...d, ...values }));
  const portrait = artists.find(a => a.id === draft.avatar) ?? artists[4];
  const upload = async (file: File | undefined, kind: 'portrait' | 'profile') => {
    if (!file) return;
    const turn = ++token.current; setReading(true); setError(''); setNotice('');
    try {
      if (kind === 'portrait') {
        const referenceImage = await readPortraitReference(file);
        if (turn !== token.current) return;
        change({ referenceImage }); setNotice('参考图已留在草稿中；桌边仍使用下方选定的统一形象。');
      } else {
        if (file.size > MAX_PROFILE_BYTES) throw new Error('资料文件请控制在 100 KB 以内。');
        const values = parseArtistProfile(await file.text(), file.name);
        if (turn !== token.current) return;
        change(values); setNotice(/\.json$/i.test(file.name) ? '角色卡已填入表单，确认内容后再保存。' : '文字已放入资料栏；请补充名字和性格，当前不会自动推断人设。');
      }
    } catch (e) { if (turn === token.current) setError(e instanceof Error ? e.message : '没有读到文件，可以重试。'); }
    finally { if (turn === token.current) setReading(false); }
  };
  const download = () => {
    const content = artistCard(draft.name.trim() ? draft : { ...draft, name: '我的艺术家' });
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${draft.name || '艺术家示例'}.artist.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <form className="custom-form artist-upload-form" onSubmit={e => {
    e.preventDefault(); if (reading) return; setError('');
    try {
      const artist = draftToArtist(draft, `custom-${uid()}`);
      onCreate(artist);
      // Keep the draft for recovery and reuse; the parent reports save failures.
    } catch (e) { setError(e instanceof Error ? e.message : '人设没有保存，请重试。'); }
  }}>
    <aside className="artist-look">
      <div className="custom-preview"><img src={gameAsset(portrait.image)} alt="餐桌统一示例形象"/><span>餐桌形象 · 暂用统一示例</span><div>{artists.map(a => <button type="button" key={a.id} className={draft.avatar === a.id ? 'selected' : ''} onClick={() => change({ avatar: a.id })} aria-label={`选择${a.name}示例形象`} aria-pressed={draft.avatar === a.id}><img src={gameAsset(a.image)} alt=""/></button>)}</div></div>
      <div className="portrait-reference">{draft.referenceImage ? <><img src={draft.referenceImage} alt="你上传的艺术家参考图"/><p>上传参考 · 不直接放上餐桌</p><button type="button" className="text-btn" onClick={() => { token.current++; setReading(false); setNotice('参考图已移除。'); setError(''); change({ referenceImage: '' }); }}>移除参考图</button></> : <p>可以上传照片或插画，作为以后统一形象的参考。</p>}</div>
      <p className="form-note">形象生成服务尚未接通。确认后可在来宾册设置声音。照片不会被当作本人性格或声音。</p>
    </aside>
    <div className="form-fields">
      <div className="artist-upload-actions">
        <label className="upload-control"><Upload size={15}/>上传参考图<input type="file" aria-label="上传艺术家参考图" accept="image/png,image/jpeg,image/webp" disabled={reading} onChange={e => { void upload(e.target.files?.[0], 'portrait'); e.target.value = ''; }}/><small>PNG / JPG / WebP · 5 MB</small></label>
        <label className="upload-control"><Upload size={15}/>导入人设资料<input type="file" aria-label="导入艺术家资料" accept=".txt,.md,.json,text/plain,application/json" disabled={reading} onChange={e => { void upload(e.target.files?.[0], 'profile'); e.target.value = ''; }}/><small>TXT / MD / JSON · 100 KB</small></label>
      </div>
      {reading && <p role="status" className="form-note">正在读取文件…</p>}
      {notice && <p role="status" className="inline-notice">{notice}</p>}
      {error && <p role="alert" className="inline-notice">{error}</p>}
      {!draftSaved && <p role="alert" className="inline-notice">草稿暂时没存进浏览器。先下载角色卡备份；参考图需另行保留。</p>}
      <div className="form-pair"><label>名字<input required maxLength={30} value={draft.name} placeholder="想邀请谁？" onChange={e => change({ name: e.target.value })}/></label><label>人物类型<select value={draft.identityType} onChange={e => change({ identityType: e.target.value as ArtistDraft['identityType'] })}><option value="fictional">原创虚构艺术家</option><option value="historical">真实艺术家 · AI 演绎</option></select></label></div>
      <label>创作方向<input maxLength={80} value={draft.medium} onChange={e => change({ medium: e.target.value })}/></label>
      <label>性格与说话方式<textarea required maxLength={400} value={draft.personality} placeholder="比如：话少、直接，聊到纸的折痕会更投入" onChange={e => change({ personality: e.target.value })}/></label>
      <label>简介<textarea maxLength={4000} value={draft.background} placeholder="背景与经历；没填写的部分保持未设定" onChange={e => change({ background: e.target.value })}/></label>
      <label>第一句会说什么<textarea required maxLength={300} value={draft.observation} onChange={e => change({ observation: e.target.value })}/></label>
      <details className="artist-extra"><summary>补充资料与交流偏好</summary><label>导入的资料／来源<textarea maxLength={12000} value={draft.sourceNotes} placeholder="上传文字会放在这里。用户提供的资料尚未核验，不会自动成为真实代表作。" onChange={e => change({ sourceNotes: e.target.value })}/></label><label>交流中坚持的一点<input maxLength={300} value={draft.rule} onChange={e => change({ rule: e.target.value })}/></label></details>
      <p className="form-note">创建时保存到这台设备。配置 NIA 后，对话会发送已确认的名字、类型、创作方向、性格、简介与近期对白；原始资料和参考图不随请求发送。资料核验与新形象生成尚未接通。导出的角色卡不含参考图、声音或聊天记录。</p>
      <div className="artist-create-actions"><button type="button" className="text-btn" onClick={download}><Download size={14}/>下载角色卡／示例</button><button type="button" className="text-btn" disabled={!draft.name.trim()} onClick={() => onPreview(draftToArtist(draft, 'preview'))}><Volume2 size={14}/>试听当前声音</button><button type="submit" className="button" disabled={reading}>确认人设，加入来宾册</button></div>
    </div>
  </form>;
}
