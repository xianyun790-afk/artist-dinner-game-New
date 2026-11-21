import { gameAsset } from '@/lib/gameAssets';
import { useState } from 'react';
import { Check, UsersRound } from 'lucide-react';
import type { Artist, GroupChat } from '@/lib/types';

export function GroupChatPanel({ catalog, groups, activeId, onCreate, onJoin, onLeave }: {
  catalog: Artist[]; groups: GroupChat[]; activeId: string | null;
  onCreate: (name: string, memberIds: string[]) => void; onJoin: (id: string) => void; onLeave: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]), [name, setName] = useState('');
  const [viewId, setViewId] = useState<string | null>(activeId);
  const view = groups.find(g => g.id === viewId);
  return <div className="group-panel">
    <p className="form-note">选 2–5 位来宾，说点什么就能一起聊。声音轮流播放，点名时由那位接话；普通话题每轮最多两位，想听全员可以说“大家怎么看”。</p>
    <div className="group-member-grid" role="group" aria-label="选择群聊成员">{catalog.map(a => {
      const checked = selected.includes(a.id);
      return <button key={a.id} className={`group-member ${checked ? 'selected' : ''}`} aria-pressed={checked} aria-label={`邀请${a.name}加入群聊`} disabled={!checked && selected.length >= 5} onClick={() => setSelected(ids => checked ? ids.filter(id => id !== a.id) : [...ids, a.id])}>
        <img src={gameAsset(a.image)} alt=""/><span>{a.name}</span><i>{checked ? <Check size={13}/> : '+'}</i>
      </button>;
    })}</div>
    <form className="group-create" onSubmit={e => { e.preventDefault(); if (selected.length >= 2) onCreate(name, selected); }}>
      <label>给群聊起个名字（可选）<input value={name} maxLength={28} placeholder="比如：今晚聊点什么" onChange={e => setName(e.target.value)}/></label>
      <button className="button" disabled={selected.length < 2} type="submit"><UsersRound size={15}/>一起聊 · {selected.length} 位</button>
    </form>
    {groups.length > 0 && <section className="group-saved"><h3>之前的群聊</h3><div className="group-list">{[...groups].reverse().map(g => <button key={g.id} aria-pressed={viewId === g.id} onClick={() => setViewId(g.id)}><strong>{g.name}</strong><span>{g.memberIds.map(id => catalog.find(a => a.id === id)?.name).join('、')}</span></button>)}</div>
      {view && <div className="group-history"><div className="group-history-heading"><h3>{view.name}</h3><button className="text-btn" onClick={() => onJoin(view.id)}>继续这个群聊</button></div>
        {view.messages.length ? <ol aria-label={`${view.name}的群聊记录`}>{view.messages.map(m => <li key={m.id}><span>{m.who === 'player' ? '你' : catalog.find(a => a.id === m.artistId)?.name ?? '来宾'}</span><p>{m.text}</p></li>)}</ol> : <p className="form-note">还没有说话，先回餐桌坐坐。</p>}
      </div>}
    </section>}
    {activeId && <button className="text-btn group-leave" onClick={onLeave}>结束本次群聊，回到自由聊天</button>}
    <p className="form-note">群聊记录单独保存在本机，可从这里继续；不会带入你与其他艺术家的单独对话。发言由当前配置的对话服务生成，未配置或失败时使用本地剧本；此处是艺术家角色群聊。</p>
  </div>;
}
