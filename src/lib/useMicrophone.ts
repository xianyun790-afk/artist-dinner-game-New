import {useEffect,useRef,useState} from 'react';
type Result={isFinal:boolean;0:{transcript:string}};
interface Recognition {lang:string;continuous:boolean;interimResults:boolean;onresult:((e:{resultIndex:number;results:{length:number;[i:number]:Result}})=>void)|null;onerror:((e:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void}
type SpeechWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
export function useMicrophone(onText:(text:string)=>void){
  const [listening,setListening]=useState(false),[interim,setInterim]=useState(''),[error,setError]=useState('');
  const current=useRef<Recognition|null>(null),callback=useRef(onText);callback.current=onText;
  const available=typeof window!=='undefined'&&!!((window as SpeechWindow).SpeechRecognition||(window as SpeechWindow).webkitSpeechRecognition);
  useEffect(()=>()=>{const r=current.current;if(r){r.onend=null;r.onresult=null;r.abort();}},[]);
  const stop=()=>current.current?.stop();
  const toggle=()=>{
    if(current.current){stop();return;}
    const Ctor=(window as SpeechWindow).SpeechRecognition||(window as SpeechWindow).webkitSpeechRecognition;
    if(!Ctor){setError('这个浏览器暂不支持语音输入，可以直接打字。');return;}
    const r=new Ctor();current.current=r;r.lang='zh-CN';r.continuous=false;r.interimResults=true;let finalText='';
    setError('');setInterim('');
    r.onresult=e=>{let partial='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)finalText+=e.results[i][0].transcript;else partial+=e.results[i][0].transcript;}setInterim(finalText+partial);};
    r.onerror=e=>setError(e.error==='not-allowed'?'麦克风未获授权，可以继续打字。':e.error==='no-speech'?'没有听清，再说一次或直接打字。':'语音识别暂时不可用，可以继续打字。');
    r.onend=()=>{current.current=null;setListening(false);setInterim('');if(finalText.trim())callback.current(finalText.trim());};
    try{r.start();setListening(true);}catch{current.current=null;setListening(false);setError('麦克风暂时没有启动，可以继续打字。');}
  };
  return {listening,interim,error,available,toggle,stop};
}
