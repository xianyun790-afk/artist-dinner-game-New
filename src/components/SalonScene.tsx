import { gameAsset } from '@/lib/gameAssets';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Artist, PersonState } from '@/lib/types';
import {topicFor} from '@/lib/room';
import { ArtistBubble } from './ArtistBubble';



type Actor = { root: THREE.Group; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>; current: string };
export function SalonScene({guests,people,activeId,preferredId,onSelect,speaking,reply}:{guests:Artist[];people:Record<string,PersonState>;activeId:string|null;preferredId:string|null;onSelect:(id:string)=>void;speaking:boolean;reply:{artistId:string;text:string;thinking:boolean}|null}) {
  const host=useRef<HTMLDivElement>(null); const labels=useRef<Record<string, HTMLButtonElement|null>>({});const topics=useRef<Record<string, HTMLSpanElement|null>>({});const bubble=useRef<HTMLDivElement|null>(null);
  const live=useRef({people,activeId,speaking,reply});live.current={people,activeId,speaking,reply};
  const [ready,setReady]=useState(false);const [failed,setFailed]=useState(false);
  const rosterKey=guests.map(a=>a.id).join(',');
  useEffect(()=>{
    const el=host.current;if(!el)return;
    setReady(false);setFailed(false);
    let renderer: THREE.WebGLRenderer;
    try { renderer=new THREE.WebGLRenderer({alpha:true,antialias:true}); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;
    renderer.setClearColor(0x000000,0);el.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');
    scene.add(new THREE.HemisphereLight(0xffffff,0xe9e6e0,2.0));
    const key=new THREE.DirectionalLight(0xfffaf4,2.2);key.position.set(-5,8,7);scene.add(key);
    const fill=new THREE.DirectionalLight(0xffffff,.65);fill.position.set(7,4,4);scene.add(fill);
    const camera=new THREE.OrthographicCamera(-7,7,6.5,0,-30,50);camera.position.set(0,3.5,12);camera.lookAt(0,3.5,0);
    const loader=new GLTFLoader();const actors=new Map<string,Actor>();
    const clock=new THREE.Clock();let dead=false, frame=0;let loaded=0;
    const disposeObject=(root:THREE.Object3D)=>root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material])){for(const v of Object.values(m))if(v instanceof THREE.Texture)v.dispose();m.dispose();}}});
    const prepare=(root:THREE.Group,portrait=false)=>root.traverse(o=>{if(o instanceof THREE.Mesh){
      const mats=Array.isArray(o.material)?o.material:[o.material];
      if(portrait){const replacements=mats.map(m=>{const original=m as THREE.MeshStandardMaterial;const basic=new THREE.MeshBasicMaterial({map:original.map,transparent:true,alphaTest:.02,side:THREE.DoubleSide,depthWrite:true,toneMapped:false});m.dispose();return basic;});o.material=Array.isArray(o.material)?replacements:replacements[0];}
      else if(o.name.startsWith('White_studio')){mats.forEach(m=>m.dispose());o.material=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,side:THREE.DoubleSide});}else mats.forEach(m=>{m.side=THREE.DoubleSide;});
    }});
    loader.load(gameAsset('/models/salon.glb'),g=>{if(dead){disposeObject(g.scene);return;}prepare(g.scene);scene.add(g.scene);if(++loaded>=guests.length+1)setReady(true);},undefined,()=>{if(!dead)setFailed(true);});
    const spacing=guests.length===1?0:Math.min(3.25,10.4/(guests.length-1));
    const positions=guests.map((_,i)=>(i-(guests.length-1)/2)*spacing);
    guests.forEach((a,i)=>{
      const model=a.image.match(/\/([a-z]+)\.webp$/)?.[1]??'lin';
      loader.load(gameAsset(`/models/${model}.glb`),g=>{
        if(dead){disposeObject(g.scene);return;}
        g.scene.position.set(positions[i],1.46,.9);g.scene.scale.setScalar(guests.length>=5?.76:.88);prepare(g.scene,true);
        // A real skin deforms the portrait; the whole root only places it at a seat.
        const mixer=new THREE.AnimationMixer(g.scene);const actions:Actor['actions']={};
        g.animations.forEach(clip=>{actions[clip.name]=mixer.clipAction(clip);});
        actions.Idle?.play();actors.set(a.id,{root:g.scene,mixer,actions,current:'Idle'});scene.add(g.scene);
        if(++loaded>=guests.length+1)setReady(true);
      },undefined,()=>{if(!dead)setFailed(true);});
    });
    let width=1,height=1,recenter=true;
    const resize=()=>{recenter=true;width=el.clientWidth;height=el.clientHeight;renderer.setSize(width,height);const worldH=14*height/width;camera.top=worldH/2;camera.bottom=-worldH/2;camera.left=-7;camera.right=7;camera.updateProjectionMatrix();};
    const ro=new ResizeObserver(resize);ro.observe(el);resize();
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const point=new THREE.Vector3();let previousActive:string|null|undefined;
    const animate=()=>{
      if(dead)return;
      frame=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);const current=live.current;
      const index=guests.findIndex(a=>a.id===current.activeId);
      const mobile=window.innerWidth<=760;
      camera.position.set(0,4.65,14);camera.zoom=1;camera.lookAt(0,3.05,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
      actors.forEach((actor,id)=>{
        const mood=current.people[id]?.mood??'calm';
        const wanted=id===current.activeId&&current.speaking?'Talk':mood==='irritated'?'Upset':mood==='excited'?'Excited':mood==='curious'?'Curious':'Idle';
        if(wanted!==actor.current&&actor.actions[wanted]){actor.actions[actor.current]?.fadeOut(.35);actor.actions[wanted].reset().fadeIn(.35).play();actor.current=wanted;}
        if(!reduce)actor.mixer.update(dt);
      });
      guests.forEach((a,i)=>{
        const label=labels.current[a.id];if(label){point.set(positions[i],3.1,.9).project(camera);label.style.left=`${(point.x*.5+.5)*width}px`;label.style.top=`${(-point.y*.5+.5)*height}px`;label.style.height=`${3.8/14*width}px`;label.style.width=`${spacing?Math.min(spacing,2.7)/14*width:width*.3}px`;}
        const topic=topics.current[a.id];if(topic){point.set(positions[i],1.2,2.15).project(camera);topic.style.left=`${(point.x*.5+.5)*width}px`;topic.style.top=`${(-point.y*.5+.5)*height}px`;}
      });
      if(current.reply&&bubble.current){
        const seat=guests.findIndex(a=>a.id===current.reply?.artistId);
        point.set(positions[seat]??0,guests.length>=5?4.65:5.1,.9).project(camera);
        const node=bubble.current;const half=node.offsetWidth/2+14;
        node.style.left=`${Math.max(half,Math.min(width-half,(point.x*.5+.5)*width))}px`;
        node.style.top=`${Math.max(node.offsetHeight+16,(-point.y*.5+.5)*height-12)}px`;
      }
      if(mobile&&(recenter||current.activeId!==previousActive)&&index>=0){
        const scroller=el.closest('.stage-scroll') as HTMLElement|null;
        point.set(positions[index],3,.9).project(camera);
        scroller?.scrollTo({left:(point.x*.5+.5)*width-scroller.clientWidth/2,behavior:reduce?'instant':'smooth'});
      }
      previousActive=current.activeId;recenter=false;
      renderer.render(scene,camera);
    };animate();
    return()=>{dead=true;cancelAnimationFrame(frame);ro.disconnect();actors.forEach(a=>{a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);});disposeObject(scene);renderer.dispose();renderer.domElement.remove();};
  // Rebuild only when the actual cast changes, never when a dialogue line changes.
  },[rosterKey]);
  return <div className={`salon-scene ${activeId?'has-conversation':''}`}>
    <div className="stage-canvas" ref={host} aria-hidden="true"/>
    {(!ready||failed)&&<div className="fallback-scene">{guests.map(a=><img key={a.id} src={gameAsset(a.image)} alt=""/>)}<div className="fallback-cloth"/></div>}
    {!ready&&!failed&&<span className="loading-scene">正在入席…</span>}
    <div className="guest-labels">{guests.map((a,i)=><button key={a.id} ref={n=>{labels.current[a.id]=n;}} className="guest-hit" style={{left:`${(i+1)/(guests.length+1)*100}%`,top:'52%'}} onClick={()=>onSelect(a.id)} aria-label={`让${a.name}接话`} aria-pressed={preferredId===a.id}/>)}</div>
    <div className="room-topics">{guests.map(a=><span ref={n=>{topics.current[a.id]=n;}} className={`room-topic ${preferredId===a.id?'chosen':''}`} key={a.id}>{topicFor(a)}<small>{preferredId===a.id?a.name:''}</small></span>)}</div>
    {reply && <ArtistBubble key={`${reply.artistId}-${reply.thinking}`} ref={bubble}
      reply={reply} artistName={guests.find(guest => guest.id === reply.artistId)?.name ?? '艺术家'} />}

  </div>;
}
