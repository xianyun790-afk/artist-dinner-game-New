import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Volume2, Square, Mic, X } from 'lucide-react';
import { useMicrophone } from '@/lib/useMicrophone';
import type { Artist, PersonState } from '@/lib/types';
export function Conversation({artist,person,onSend,onBack,onReplay,speaking,speechError,onStop}:{artist:Artist;person:PersonState;onSend:(text:string)=>void;onBack:()=>void;onReplay:()=>void;speaking:boolean;speechError:string;onStop:()=>void}){
  const [input,setInput]=useState('');const bottom=useRef<HTMLDivElement>(null);
  const mic=useMicrophone(onSend);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[person.messages.length,mic.interim]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.defaultPrevented)onBack();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onBack]);
  const send=()=>{if(input.trim()){onSend(input);setInput('');}};
  return <section className="conversation quiet-chat" aria-label={`与${artist.name}私聊`}>
    <header className="quiet-chat-header"><span>{artist.name}<small>AI 人设演绎</small></span><div><button className="icon-btn" aria-label={speaking?'停止播放':'朗读最近回复'} onClick={speaking?onStop:onReplay}>{speaking?<Square size={14}/>:<Volume2 size={16}/>}</button><button className="icon-btn" onClick={onBack} aria-label="回到餐桌"><X size={18}/></button></div></header>
    <div className="conversation-scroll" role="log" aria-label="聊天记录"><div className="quiet-messages">{person.messages.map(m=><p key={m.id} className={`chat-bubble ${m.who}`}>{m.text}</p>)}</div>{mic.interim&&<p className="mic-interim">{mic.interim}</p>}<div ref={bottom}/></div>
    {(mic.error||speechError)&&<p className="voice-notice" role="status">{mic.error||speechError}</p>}
    <form className="conversation-input" onSubmit={e=>{e.preventDefault();send();}}><button type="button" className={`mic-button ${mic.listening?'listening':''}`} aria-label={mic.listening?'结束语音输入':'开始语音输入'} aria-pressed={mic.listening} onClick={()=>{onStop();mic.toggle();}}>{mic.listening?<Square size={15}/>:<Mic size={18}/>}</button><input value={input} onChange={e=>setInput(e.target.value)} placeholder={mic.listening?'在听，慢慢说…':'想说什么都可以…'} aria-label="输入对话" maxLength={400}/><button type="submit" disabled={!input.trim()} aria-label="发送消息"><ArrowUp size={18}/></button></form>
    <small className="quiet-chat-note">本地剧本试玩 · 语音由浏览器提供</small>
  </section>;
}
