import { t } from '@/lib/standingLanguage';
import {useEffect,useRef,useState} from 'react';
import {ArrowUp,Keyboard,Mic,Square,X} from 'lucide-react';
import {useRoomVoice} from '@/lib/useRoomVoice';
import type {VoiceInputTiming} from '@/lib/voiceTurn';
export function RoomInput({onSend,busy,speaking,loading,onStop,onUnlock,responding,speechError,onInputTiming,onComposingChange}:{onSend:(text:string)=>void;busy:boolean;speaking:boolean;loading:boolean;onStop:()=>void;onUnlock:()=>void;responding:boolean;speechError:string;onInputTiming?:(timing:VoiceInputTiming)=>void;onComposingChange?:(active:boolean)=>void}){
  const [typing,setTyping]=useState(false),[input,setInput]=useState('');const field=useRef<HTMLInputElement>(null);
  const voice=useRoomVoice(onSend,busy||responding||speaking||loading,onInputTiming);
  const composing = !!((typing && input.trim()) || voice.inUtterance || voice.interim);
  useEffect(() => { onComposingChange?.(composing); }, [composing, onComposingChange]);
  const replying=responding||speaking||loading;
  useEffect(()=>{if(typing)field.current?.focus();},[typing]);
  useEffect(()=>{if(typing)voice.stop();},[typing]);
  const submit=()=>{if(busy||!input.trim())return;onStop();voice.stop();onSend(input);setInput('');};
  return <div className="room-input-wrap">
    <p className="heard-line" aria-live="polite">{voice.interim||voice.error||speechError||(!typing && voice.lastHeard)||''}</p>
    {typing?<form className="room-type" onSubmit={e=>{e.preventDefault();submit();}}><input ref={field} aria-label={t("想聊点什么", "Your message")} placeholder={t("说点什么，大家都在听…", "What’s on your mind?")} value={input} maxLength={400} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setTyping(false);}}/><button type="submit" aria-label={t("发送", "Send")} disabled={!input.trim()||busy}><ArrowUp size={18}/></button>{(responding||speaking||loading)&&<button type="button" aria-label={t("打断回复", "Interrupt")} onClick={onStop}><Square size={15}/></button>}<button type="button" aria-label={t("收起打字", "Close keyboard")} onClick={()=>setTyping(false)}><X size={17}/></button></form>:
      <div className="room-voice"><button className={`speak-button ${voice.enabled?'enabled':''}`} onClick={()=>{onUnlock();if(replying){onStop();voice.resume();}else voice.toggle();}} aria-label={replying?t("打断并说话", "Interrupt and speak"):voice.enabled?t("暂停倾听", "Pause listening"):t("开口聊聊", "Start talking")} aria-pressed={voice.enabled}>{voice.enabled?<span className={`voice-bars ${voice.listening?'hearing':''}`}><i/><i/><i/><i/><i/></span>:<Mic size={19} strokeWidth={1.5}/>}<span>{replying?t("打断，接着说", "Interrupt and speak"):voice.enabled?(busy?t("稍等一下…", "One moment…"):voice.transcribing?t("正在转写…", "Transcribing…"):voice.listening?t("在听，你说…", "Listening…"):t("正在打开麦克风…", "Opening microphone…")):t("开口聊聊", "Start talking")}</span></button><button className="room-keyboard" aria-label={t("打字聊天", "Type a message")} onClick={()=>{onStop();setTyping(true);}}><Keyboard size={20} strokeWidth={1.4}/></button>{replying&&<button className="room-keyboard" aria-label={t("打断回复", "Interrupt")} onClick={onStop}><Square size={15}/></button>}</div>}
  </div>;
}
