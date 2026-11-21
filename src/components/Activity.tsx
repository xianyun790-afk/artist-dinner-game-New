import {useState} from 'react';
import type {Artist,Mark,PersonState} from '@/lib/types';
import {choicesFor} from '@/lib/engine';
import {Artwork} from './Artwork';
export function Activity({artist,person,onChoose,onMark,onSave}:{artist:Artist;person:PersonState;onChoose:(id:string)=>void;onMark:(mark:Mark,paths:string[])=>void;onSave:(title:string)=>void}){
  const [title,setTitle]=useState('');const last=person.messages.filter(m=>m.who==='artist').at(-1);
  return <div className="activity-body"><p>{last?.text}</p>{person.node==='draw'?<Artwork artist={artist} interactive onCommit={onMark}/>:person.mark?<Artwork artist={artist} mark={person.mark} paths={person.draftPaths}/>:null}
    {person.node==='naming'&&<form className="naming-form" onSubmit={e=>{e.preventDefault();onSave(title);}}><label htmlFor="work-title">给这张画留个名字</label><input id="work-title" value={title} maxLength={36} placeholder="今晚的试稿" onChange={e=>setTitle(e.target.value)}/><button className="button" type="submit">收进作品夹</button></form>}
    <div className="activity-choices">{choicesFor(person).map(c=><button className="button secondary" key={c.id} onClick={()=>onChoose(c.id)}>{c.text}</button>)}</div>
  </div>;
}
