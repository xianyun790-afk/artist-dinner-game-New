import { useRef, useState } from 'react';
import { Undo2, Check, PenLine, ArrowUpRight, Circle, Minus } from 'lucide-react';
import type { Artist, Mark } from '@/lib/types';
export function Artwork({ artist, mark, paths=[], interactive=false, onCommit }: { artist: Artist; mark?: Mark; paths?: string[]; interactive?: boolean; onCommit?: (mark:Mark,paths:string[])=>void }) {
  const [drawn,setDrawn]=useState<string[]>([]);const [current,setCurrent]=useState('');const drawing=useRef(false);const svg=useRef<SVGSVGElement>(null);
  const coord=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return `${((e.clientX-r.left)/r.width*500).toFixed(1)} ${((e.clientY-r.top)/r.height*300).toFixed(1)}`;};
  const end=()=>{if(drawing.current){drawing.current=false;if(current)setDrawn(p=>[...p,current]);setCurrent('');}};
  const all=interactive?[...drawn,...(current?[current]:[])]:paths;
  return <div className={`artwork ${interactive?'interactive':''}`}><div className="canvas-paper"><svg ref={svg} viewBox="0 0 500 300" role="img" aria-label={`与${artist.name}的共同试稿`} style={{touchAction:interactive?'none':'auto'}}
    onPointerDown={e=>{if(!interactive)return;drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);setCurrent(`M ${coord(e)}`);}}
    onPointerMove={e=>{if(drawing.current)setCurrent(p=>`${p} L ${coord(e)}`);}}
    onPointerUp={end} onPointerCancel={()=>{drawing.current=false;setCurrent('');}}>
    <defs><filter id="paint-texture"><feTurbulence type="fractalNoise" baseFrequency=".1" numOctaves="2" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2"/></filter></defs>
    {artist.id==='monet'?<path d="M130 190 Q190 105 280 140 L310 200 Q220 170 130 190" fill="#71999b" opacity=".75" filter="url(#paint-texture)"/>:artist.id==='dali'?<path d="M190 230 V85 Q245 55 300 85 V230 M190 90 L300 85" stroke={artist.color} strokeWidth="9" fill="none"/>:artist.id==='georgia'?<path d="M165 230 Q100 155 240 80 Q330 65 335 180" stroke={artist.color} strokeWidth="11" fill="none" strokeLinecap="round"/>:<path d="M135 215 Q205 150 300 95" stroke={artist.color} strokeWidth="24" fill="none" strokeLinecap="round" filter="url(#paint-texture)"/>}
    {mark==='heavy'&&<path d="M270 115 Q320 95 355 65" stroke="#4c5a44" strokeWidth="20" fill="none" strokeLinecap="round"/>}
    {mark==='light'&&<path d="M120 110 Q245 170 365 195" stroke="#a3b4af" strokeWidth="6" fill="none" strokeLinecap="round"/>}
    {mark==='circle'&&<circle cx="340" cy="205" r="30" stroke="#ad6750" strokeWidth="5" fill="none"/>}
    {all.map((d,i)=><path key={i} d={d} stroke="#a4513b" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}
    <text x="24" y="276" fill="#b5a995" fontSize="9" letterSpacing="3">AFTERGLOW / A STUDY BETWEEN US</text>
  </svg>{interactive&&<span className="draw-instruction"><PenLine size={12}/> 在纸上画一笔，或选一种方向</span>}</div>
  {interactive&&<><div className="mark-choices"><button onClick={()=>onCommit?.('heavy',[])}><ArrowUpRight size={16}/>沿着它</button><button onClick={()=>onCommit?.('light',[])}><Minus size={16}/>横穿它</button><button onClick={()=>onCommit?.('circle',[])}><Circle size={15}/>另留一个圆</button></div><div className="draw-actions"><button className="text-btn" disabled={!drawn.length} onClick={()=>setDrawn(p=>p.slice(0,-1))}><Undo2 size={13}/>撤销</button><button className="button small" disabled={!drawn.length} onClick={()=>onCommit?.('free',drawn)}><Check size={14}/>留住这一笔</button></div></>}
  </div>;
}
