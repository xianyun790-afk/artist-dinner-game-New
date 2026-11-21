import { gameAsset } from '@/lib/gameAssets';
import { displayName, t } from '@/lib/standingLanguage';
import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Artist } from '@/lib/types';
import { ArtistBubble, type ArtistReply } from './ArtistBubble';
import { standingModels, standingLineup, restClock, tiredAside } from '@/lib/standingGuests';
import { startCrouch } from '@/lib/standingCrouch';
import { finishArtistMaterial, studioBackdrop } from '@/lib/standingFinish';

type Actor = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  arrival?: THREE.AnimationAction;
  headPose?: THREE.Quaternion;
  headLook: number;
  crouch: ReturnType<typeof startCrouch>;
  head: THREE.Object3D;
  bubbleAnchor: THREE.Vector3;
  mouthTargets: Array<{ mesh: THREE.Mesh; index: number }>;
  gesturePhase: 'walk' | 'forward' | 'hold' | 'reverse' | 'idle';
};

type StandingSceneProps = {
  guests: Artist[];
  talkingPair: readonly string[] | null;
  crouchRequest: RefObject<readonly string[] | null>;
  reply: ArtistReply | null;
  selectedId: string | null;
  speaking: boolean;
  responding: boolean;
  ambientAllowed: boolean;
  onRestLowered: () => void;
  onSelect: (id: string) => void;
  onEntranceComplete?: () => void;
};

const initialWalkSeconds = 4.15;
const initialTurnSeconds = .85;
const floorDepth = -.15;
const rearEntranceDepth = -2.35;
const stepTurn = .32;
const stepSettle = .34;
const scale = 2.65;
const studioWhite = 0xf8f8f6;
const pairCameraDistance = 8.4;
const groupCameraDistance = 7.2;

type Move = {
  startX: number;
  startZ: number;
  startYaw: number;
  initial: boolean;
  entrancePath?: THREE.CubicBezierCurve3;
  step?: { walk: number; name: 'Walk' | 'Step'; strides: number };
  arrival: boolean;
};

function changeAction(actor: Actor, name: string) {
  const action = actor.actions[name];
  if (!action || actor.current === name) return;
  actor.actions[actor.current]?.fadeOut(.2);
  action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(.2).play();
  action.timeScale = name === 'Walk' ? .88 : 1;
  action.clampWhenFinished = false;
  actor.current = name;
}

function settle(actor: Actor, id: string) {
  if (actor.arrival) {
    if (actor.current === 'Arrival') return;
    actor.actions[actor.current]?.fadeOut(.2);
    actor.arrival.reset().setEffectiveWeight(1).fadeIn(.2).play();
    actor.arrival.time = actor.arrival.getClip().duration;
    actor.arrival.paused = true;
    actor.current = 'Arrival';
    return;
  }
  if (id !== 'dali') {
    changeAction(actor, 'Idle');
    return;
  }
  if (actor.current !== 'ArmsCrossed') actor.actions[actor.current]?.fadeOut(.2);
  const rest = actor.actions.ArmsCrossed;
  if (!rest) return;
  rest.reset().setLoop(THREE.LoopOnce, 1).fadeIn(.2).play();
  rest.paused = true;
  actor.current = 'ArmsCrossed';
}

function closingStep(arrival: THREE.AnimationClip) {
  // Reuse the last walking beat of the rig. Keep the planted root transform
  // so the scene can supply short moves between standing marks.
  const times = Float32Array.from({ length: 35 }, (_, index) => index / 30);
  const tracks = arrival.tracks.map(source => {
    const track = source.clone();
    const values = new Float32Array(times.length * source.getValueSize());
    const sample = source.InterpolantFactoryMethodLinear();
    for (let index = 0; index < times.length; index++) {
      const time = source.name.startsWith('root.') ? arrival.duration : 3 + times[index];
      values.set(sample.evaluate(time), index * source.getValueSize());
    }
    track.times = times;
    track.values = values;
    return track;
  });
  return new THREE.AnimationClip('Step', -1, tracks);
}

const easeInOut = (value: number) => {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
};

function cycloramaGeometry() {
  const width = 26;
  const columns = 2;
  const profile: Array<[number, number]> = [
    [35, 0],
    [-3.8, 0],
  ];
  const radius = 2.2;
  for (let step = 1; step <= 14; step += 1) {
    const angle = (step / 14) * Math.PI / 2;
    profile.push([-3.8 - Math.sin(angle) * radius, radius - Math.cos(angle) * radius]);
  }
  profile.push([-6, 16]);
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let row = 0; row < profile.length; row += 1) {
    const [z, y] = profile[row];
    for (let column = 0; column < columns; column += 1) {
      positions.push(column ? width / 2 : -width / 2, y, z);
      uvs.push(column, row / (profile.length - 1));
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < profile.length - 1; row += 1) {
    const a = row * columns;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function desiredAction(actor: Actor, id: string, active: boolean) {
  if (active) {
    if (actor.actions.Talk) return 'Talk';
    if (actor.actions.LookAround) return 'LookAround';
  }
  if (actor.actions.Idle) return 'Idle';
  if (id === 'dali' && actor.gesturePhase === 'idle') return '';
  if (actor.actions.ArmsCrossed) return 'ArmsCrossed';
  return '';
}

export function StandingScene({ guests, talkingPair, crouchRequest, reply, selectedId, speaking, responding, ambientAllowed, onRestLowered, onSelect, onEntranceComplete }: StandingSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const activeId = reply?.artistId;
  const speaker = guests.find(guest => guest.id === activeId);
  const hitTargets = useRef<Record<string, HTMLButtonElement | null>>({});
  const live = useRef({ activeId, talkingPair, speaking, responding, ambientAllowed, onRestLowered });
  live.current = { activeId, talkingPair, speaking, responding, ambientAllowed, onRestLowered };
  const restTimer = useRef<ReturnType<typeof restClock> | undefined>(undefined);
  const entranceComplete = useRef(onEntranceComplete);
  entranceComplete.current = onEntranceComplete;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [settledRoster, setSettledRoster] = useState<string>();
  const arrived = settledRoster === guests.map(guest => guest.id).join(',');
  const roster = useRef(guests);
  roster.current = guests;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setReady(false);
    setFailed(false);
    setSettledRoster(undefined);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(studioWhite, 1);
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(studioWhite);
    const fog = new THREE.Fog(studioWhite, 14, 24);
    scene.fog = fog;

    const backdrop = new THREE.Mesh(
      cycloramaGeometry(),
      studioBackdrop(),
    );
    scene.add(backdrop);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 37),
      new THREE.ShadowMaterial({ color: 0x555555, opacity: .13, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, .001, 14.65);
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xceccc6, 1.45));
    const sun = new THREE.DirectionalLight(0xfffcf7, 2.0);
    sun.position.set(-4.5, 10.8, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -2;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 24;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.015;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0xe8efff, .30);
    rim.position.set(5, 4, -3);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50);

    const loader = new GLTFLoader();
    const actors = new Map<string, Actor>();
    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lineup: Array<ReturnType<typeof standingLineup>[number] & { z: number }> = [];
    let layoutKey: string | undefined;
    let pendingKey: string | undefined;
    const moves = new Map<string, Move>();
    const loading = new Set<string>();
    const failedLoads = new Set<string>();
    let dead = false;
    let frame = 0;
    let width = 1;
    let height = 1;
    let entranceAt = 0;
    let phaseSeconds = 0;
    let announcedArrival = true;
    const cameraAim = new THREE.Vector3();
    let cameraMove: {
      from: THREE.Vector3; to: THREE.Vector3;
      fromAim: THREE.Vector3; toAim: THREE.Vector3; start: number;
    } | undefined;

    const disposeObject = (root: THREE.Object3D) => root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        Object.values(material).forEach(value => {
          if (value instanceof THREE.Texture) value.dispose();
        });
        material.dispose();
      });
    });

    const loadActor = (id: string) => {
      loading.add(id);
      loader.load(gameAsset(standingModels[id]), gltf => {
        loading.delete(id);
        if (dead || !roster.current.some(guest => guest.id === id)) {
          disposeObject(gltf.scene);
          return;
        }
        const model = gltf.scene;
        const root = new THREE.Group();
        root.name = `standing-${id}`;
        root.visible = false;
        root.scale.setScalar(scale * (id === 'georgia' ? .917 : id === 'dali' ? 1.032 : 1));
        if (id === 'georgia') root.scale.x *= 1.055;
        root.add(model);
        const mouthTargets: Actor['mouthTargets'] = [];
        model.traverse(object => {
          if (object.name === 'Icosphere') {
            object.visible = false;
            return;
          }
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          if (id === 'georgia') object.frustumCulled = false;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => finishArtistMaterial(material, id));
          const indexForMouth = object.morphTargetDictionary?.Mouth_Open;
          if (typeof indexForMouth === 'number') mouthTargets.push({ mesh: object, index: indexForMouth });
        });
        const mixer = new THREE.AnimationMixer(model);
        const actions: Record<string, THREE.AnimationAction> = {};
        for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
        const arrival = actions.Arrival;
        if (arrival) {
          const step = closingStep(arrival.getClip());
          actions.Step = mixer.clipAction(step);
          // Keep the Blender root motion. Align its last frame to the stage
          // mark so later conversation turns pivot between the planted feet.
          const last = arrival.getClip().tracks.find(track => track.name === 'root.position')?.values;
          const initialRotation = model.getObjectByName('root')?.quaternion.clone();
          arrival.setLoop(THREE.LoopOnce, 1).play();
          arrival.clampWhenFinished = true;
          arrival.time = arrival.getClip().duration;
          mixer.update(0);
          const finalRotation = model.getObjectByName('root')?.quaternion;
          if (initialRotation && finalRotation) {
            const turn = finalRotation.clone().multiply(initialRotation.invert());
            model.rotation.y = -new THREE.Euler().setFromQuaternion(turn).y;
          }
          if (last) model.position.fromArray(last, last.length - 3).applyEuler(model.rotation).negate();
          arrival.time = 0;
          mixer.update(0);
          arrival.stop();
        }
        const head = model.getObjectByName('head') ?? model;
        const bubbleAnchor = head.worldToLocal(root.localToWorld(new THREE.Vector3(0, 1.025, 0)));
        if (arrival && head !== model) bubbleAnchor.set(0, .33, 0);
        actors.set(id, { root, mixer, actions, arrival, current: '', crouch: null, head, headLook: 0, bubbleAnchor, mouthTargets, gesturePhase: 'idle' });
        scene.add(root);
      }, undefined, () => {
        loading.delete(id);
        if (!dead) failedLoads.add(id);
      });
    };

    const resize = (transitionAt?: number) => {
      const from = camera.position.clone();
      const fromAim = cameraAim.clone();
      width = Math.max(1, element.clientWidth);
      height = Math.max(1, element.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const narrow = width / height < 0.85;
      const group = lineup.length > 2;
      const cameraDistance = group ? groupCameraDistance : pairCameraDistance;
      camera.position.y = group ? 1.87 : 2.05;
      camera.position.z = narrow ? 10.5 : cameraDistance;
      if (lineup.length > 1) {
        const halfSpan = Math.max(...lineup.map(guest => Math.abs(guest.x))) + .86;
        camera.position.z = Math.max(camera.position.z, halfSpan / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      }
      // The narrow layout backs the camera up to fit the cast. Shift the haze
      // with it so the figures stay clear and only the rear wall blends out.
      const pullback = camera.position.z - cameraDistance;
      fog.near = 14 + pullback;
      fog.far = 24 + pullback;
      cameraAim.set(0, group ? 1.36 : 1.35, group ? -.25 : -.35);
      camera.lookAt(cameraAim);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const headY = new THREE.Vector3(0, 2.7, -.15).project(camera).y;
      const footY = new THREE.Vector3(0, 0, -.15).project(camera).y;
      const hitHeight = (headY - footY) * height * .5;
      for (const guest of lineup) {
        const hit = hitTargets.current[guest.id];
        if (!hit) continue;
        const fit = lineup.length > 2 || narrow;
        hit.style.width = fit ? `${Math.min(width / lineup.length, hitHeight * .42)}px` : '';
        hit.style.height = fit ? `${hitHeight}px` : '';
      }
      cameraMove = transitionAt !== undefined && !reduceMotion
        ? { from, fromAim, to: camera.position.clone(), toAim: cameraAim.clone(), start: transitionAt }
        : undefined;
    };
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(element);
    resize();

    const updateRoster = (now: number) => {
      const ids = roster.current.map(guest => guest.id).filter(id => standingModels[id]);
      const key = ids.join(',');
      if (key !== pendingKey) {
        pendingKey = key;
        for (const id of failedLoads) if (!ids.includes(id)) failedLoads.delete(id);
        if (key !== layoutKey) setSettledRoster(undefined);
        else if (announcedArrival) {
          setSettledRoster(layoutKey);
          setReady(true);
          entranceComplete.current?.();
        }
      }
      if (key === layoutKey || !announcedArrival) return;
      for (const id of ids) if (!actors.has(id) && !loading.has(id) && !failedLoads.has(id)) loadActor(id);
      if (ids.some(id => loading.has(id))) {
        setReady(false);
        return;
      }
      const initial = layoutKey === undefined;
      layoutKey = key;
      lineup = standingLineup(ids.filter(id => actors.has(id))).map(mark => ({ ...mark, z: floorDepth }));
      setReady(true);
      setFailed(ids.some(id => failedLoads.has(id)));
      entranceAt = now;
      phaseSeconds = 0;
      announcedArrival = false;
      moves.clear();
      actors.forEach((actor, id) => {
        if (ids.includes(id)) return;
        actor.mixer.stopAllAction();
        actor.mixer.uncacheRoot(actor.root.children[0]);
        disposeObject(actor.root);
        actor.root.removeFromParent();
        actors.delete(id);
      });
      lineup.forEach(({ id, x, yaw, z }, index) => {
        const actor = actors.get(id)!;
        const firstTime = !actor.root.visible;
        const fromLeft = index < lineup.length / 2;
        const startYaw = firstTime ? (fromLeft ? Math.PI / 2 : -Math.PI / 2) : actor.root.rotation.y;
        const startX = firstTime ? (fromLeft ? -5.6 : 5.6) : actor.root.position.x;
        const arrival = firstTime && !!actor.arrival;
        // Enter behind the row when a newcomer has an interior mark.
        const enterBehind = firstTime && !arrival && index > 0 && index < lineup.length - 1;
        const startZ = firstTime ? (enterBehind ? rearEntranceDepth : z) : actor.root.position.z;
        const entrancePath = enterBehind ? new THREE.CubicBezierCurve3(
          new THREE.Vector3(startX, 0, startZ),
          new THREE.Vector3((startX + x) / 2, 0, startZ),
          new THREE.Vector3(x, 0, startZ),
          new THREE.Vector3(x, 0, z),
        ) : undefined;
        const distance = Math.hypot(startX - x, startZ - z);
        const step = !firstTime && distance > .001 ? {
          walk: .59 + .43 * Math.min(distance, 1.8),
          name: actor.arrival ? 'Step' as const : 'Walk' as const,
          strides: distance < .55 ? .5 : 1,
        } : undefined;
        moves.set(id, { startX, startZ, startYaw, initial: firstTime && initial && !arrival, entrancePath, step, arrival });
        actor.root.visible = true;
        actor.root.position.y = 0;
        actor.root.position.z = startZ;
        if (arrival) {
          actor.root.position.x = x;
          actor.root.rotation.y = yaw;
          actor.arrival!.reset().play();
          actor.current = 'Arrival';
          phaseSeconds = Math.max(phaseSeconds, actor.arrival!.getClip().duration);
        } else if (firstTime) {
          actor.root.position.x = startX;
          actor.root.rotation.y = startYaw;
          changeAction(actor, 'Walk');
          actor.gesturePhase = initial && (id === 'dali' || id === 'vincent') ? 'walk' : 'idle';
          phaseSeconds = Math.max(phaseSeconds, initialWalkSeconds + initialTurnSeconds);
        } else {
          actor.crouch = null;
          if (actor.gesturePhase !== 'idle') {
            actor.gesturePhase = 'idle';
            settle(actor, id);
          }
          if (step) phaseSeconds = Math.max(phaseSeconds, stepTurn + step.walk + stepSettle);
        }
      });
      if (!lineup.some(guest => guest.id === tiredAside.artistId)) restTimer.current = undefined;
      resize(initial ? undefined : now);
    };

    const projected = new THREE.Vector3();
    const animate = () => {
      if (dead) return;
      frame = requestAnimationFrame(animate);
      const now = performance.now();
      updateRoster(now);
      if (cameraMove) {
        const blend = easeInOut((now - cameraMove.start) / 900);
        camera.position.lerpVectors(cameraMove.from, cameraMove.to, blend);
        cameraAim.lerpVectors(cameraMove.fromAim, cameraMove.toAim, blend);
        camera.lookAt(cameraAim);
        camera.updateMatrixWorld();
        if (blend >= 1) cameraMove = undefined;
      }
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = entranceAt ? (now - entranceAt) / 1000 : 0;
      const hasArrived = entranceAt > 0 && (reduceMotion || elapsed >= phaseSeconds);
      const hasEntered = reduceMotion || elapsed >= initialWalkSeconds;

      const requested = crouchRequest.current;
      if (requested && hasArrived && announcedArrival) {
        const targets = requested.filter(id => id !== 'dali').map(id => actors.get(id)).filter((actor): actor is Actor => !!actor);
        if (targets.every(actor => actor.gesturePhase === 'idle' && !actor.crouch)) {
          for (const actor of targets) actor.crouch = startCrouch(actor.root);
          crouchRequest.current = null;
        }
      }

      const restingArtist = actors.get(tiredAside.artistId);
      if (hasArrived && restingArtist && restTimer.current?.(performance.now(), live.current.ambientAllowed && !document.hidden && restingArtist.gesturePhase === 'idle' && !restingArtist.crouch)) {
        restingArtist.crouch = startCrouch(restingArtist.root, () => live.current.onRestLowered());
      }

      lineup.forEach(({ id, x: finalX, z: finalZ, yaw }) => {
        const actor = actors.get(id)!;
        const move = moves.get(id)!;
        if (actor.headPose) actor.head.quaternion.copy(actor.headPose);
        const pair = live.current.talkingPair;
        const partner = pair?.includes(id) ? lineup.find(guest => guest.id !== id && pair.includes(guest.id)) : undefined;
        const facing = partner ? Math.sign(partner.x - finalX) * .78 : yaw;
        if (move.arrival) {
          // Drive the whole imported action from the stage clock. A slower
          // render frame cannot release the conversation ahead of the stop.
          const action = actor.arrival!;
          action.time = Math.min(reduceMotion ? action.getClip().duration : elapsed, action.getClip().duration);
          actor.mixer.update(0);
          if (hasArrived && !actor.headPose) actor.headPose = actor.head.quaternion.clone();
          actor.root.rotation.y = reduceMotion ? facing : THREE.MathUtils.damp(actor.root.rotation.y, facing, 5, delta);
        } else if (move.step) {
          const { walk, name, strides } = move.step;
          const turn = easeInOut(elapsed / (stepTurn + .10));
          const travel = THREE.MathUtils.clamp((elapsed - stepTurn) / walk, 0, 1);
          // Obvious easing belongs to the weight transfer, then the planted
          // gait carries the stride at a nearly constant pace.
          const progress = reduceMotion ? 1 : THREE.MathUtils.lerp(travel, easeInOut(travel), .38);
          const settleTurn = easeInOut((elapsed - stepTurn - walk + .11) / (stepSettle + .11));
          const direction = Math.atan2(finalX - move.startX, finalZ - move.startZ);
          if (!reduceMotion && actor.current !== name && elapsed >= stepTurn - .12 && elapsed < stepTurn + walk - .07) {
            changeAction(actor, name);
            const action = actor.actions[name];
            if (action) action.timeScale = action.getClip().duration * strides / walk;
          }
          if (actor.current === name && elapsed >= stepTurn + walk - .07) settle(actor, id);
          actor.root.position.x = THREE.MathUtils.lerp(move.startX, finalX, progress);
          actor.root.position.z = THREE.MathUtils.lerp(move.startZ, finalZ, progress);
          actor.root.rotation.y = reduceMotion ? facing
            : THREE.MathUtils.lerp(THREE.MathUtils.lerp(move.startYaw, direction, turn), facing, settleTurn);
        } else if (!announcedArrival) {
          const walk = reduceMotion ? 1 : easeInOut(elapsed / initialWalkSeconds);
          const turn = reduceMotion ? 1 : easeInOut((elapsed - initialWalkSeconds) / initialTurnSeconds);
          if (move.entrancePath) {
            move.entrancePath.getPointAt(walk, projected);
            actor.root.position.x = projected.x;
            actor.root.position.z = projected.z;
            move.entrancePath.getTangentAt(walk, projected);
            const heading = Math.atan2(projected.x, projected.z);
            actor.root.rotation.y = THREE.MathUtils.lerp(heading, yaw, turn);
          } else {
            actor.root.position.x = THREE.MathUtils.lerp(move.startX, finalX, walk);
            actor.root.rotation.y = THREE.MathUtils.lerp(move.startYaw, yaw, turn);
          }
        } else {
          actor.root.rotation.y = reduceMotion ? facing : THREE.MathUtils.damp(actor.root.rotation.y, facing, 5, delta);
        }

        if (hasEntered || !move.initial) {
          if (hasArrived && !move.initial && !move.step && actor.current === 'Walk') settle(actor, id);
          const isActive = live.current.activeId === id && (live.current.speaking || live.current.responding);
          const gestureName = id === 'dali' ? 'ArmsCrossed' : id === 'vincent' ? 'RaiseBrush' : '';
          const gesture = gestureName ? actor.actions[gestureName] : undefined;
          const gestureDuration = gesture?.getClip().duration ?? 0;
          const gestureElapsed = Math.max(0, elapsed - initialWalkSeconds);
          const holdDuration = 0.7;
          if (gesture && actor.gesturePhase !== 'idle') {
            if (actor.gesturePhase === 'walk') {
              actor.actions[actor.current]?.fadeOut(0.22);
              gesture.reset();
              gesture.enabled = true;
              gesture.paused = false;
              gesture.timeScale = 1;
              gesture.clampWhenFinished = true;
              gesture.setLoop(THREE.LoopOnce, 1);
              gesture.fadeIn(0.22).play();
              actor.current = gestureName;
              actor.gesturePhase = 'forward';
            }
            if (gestureElapsed >= gestureDuration && gestureElapsed < gestureDuration + holdDuration && actor.gesturePhase !== 'hold') {
              gesture.paused = true;
              gesture.time = gestureDuration;
              actor.gesturePhase = 'hold';
            } else if (gestureElapsed >= gestureDuration + holdDuration && gestureElapsed < gestureDuration * 2 + holdDuration && actor.gesturePhase !== 'reverse') {
              gesture.enabled = true;
              gesture.paused = false;
              gesture.timeScale = -1;
              gesture.time = gestureDuration;
              gesture.play();
              actor.gesturePhase = 'reverse';
            } else if (gestureElapsed >= gestureDuration * 2 + holdDuration) {
              if (id === 'vincent' && actor.actions.Idle) {
                gesture.fadeOut(0.24);
                actor.actions.Idle.reset().fadeIn(0.24).play();
                actor.current = 'Idle';
              } else {
                gesture.enabled = true;
                gesture.paused = true;
                gesture.timeScale = 1;
                gesture.time = 0;
                actor.current = gestureName;
              }
              actor.gesturePhase = 'idle';
            }
          } else if (!gesture) {
            actor.gesturePhase = 'idle';
          }

          if (actor.gesturePhase === 'idle' && !actor.crouch && hasArrived) {
            const wanted = desiredAction(actor, id, isActive);
            if (wanted && actor.current !== wanted) {
              actor.actions[actor.current]?.fadeOut(0.38);
              actor.actions[wanted]?.reset().fadeIn(0.38).play();
              actor.current = wanted;
            }
            const drift = now * 0.001 + (id === 'dali' ? 1.8 : 0);
            actor.root.position.y = Math.sin(drift * 0.82) * 0.006;
            actor.root.rotation.z = Math.sin(drift * 0.43) * 0.004;
          }
          const mouthValue = isActive && live.current.speaking
            ? THREE.MathUtils.clamp(0.2 + Math.sin(performance.now() * 0.018) * 0.22 + Math.sin(performance.now() * 0.031) * 0.13, 0, 0.62)
            : 0;
          actor.mouthTargets.forEach(target => {
            if (target.mesh.morphTargetInfluences) target.mesh.morphTargetInfluences[target.index] = mouthValue;
          });
        }
        if (actor.crouch) {
          if (!actor.crouch.update(delta)) actor.crouch = null;
        } else if (!actor.arrival || move.step) {
          actor.mixer.update(delta);
        }

        if (actor.headPose) {
          actor.headPose.copy(actor.head.quaternion);
          actor.headLook = THREE.MathUtils.damp(actor.headLook, reduceMotion || move.step ? 0 : -.065, 2.8, delta);
          actor.head.rotateY(actor.headLook);
          actor.head.rotateZ(-actor.headLook * .28);
          if (!reduceMotion && live.current.activeId === id && live.current.speaking) actor.head.rotateX(Math.sin(now * .0021) * .017);
        }
        if (id === 'dali' && actor.head !== actor.root) {
          // Bring the taller head down toward the reference without changing
          // the rig's animated rotations or the mouth morph.
          actor.head.scale.set(.95, .88, .98);
        }
        const node = bubble.current;
        if (node && live.current.activeId === id) {
          actor.head.localToWorld(projected.copy(actor.bubbleAnchor)).project(camera);
          const headX = (projected.x * 0.5 + 0.5) * width;
          const bottom = Math.round((0.5 - projected.y * 0.5) * height - 14);
          const margin = node.offsetWidth / 2 + 12;
          const center = THREE.MathUtils.clamp(headX, margin, width - margin);
          node.style.left = `${Math.round(center)}px`;
          node.style.setProperty('--bubble-bottom', `${bottom}px`);
          node.style.setProperty('--tip-offset', `${Math.round(headX - center)}px`);
        }

        const target = hitTargets.current[id];
        if (target) {
          const { x, z } = actor.root.position;
          projected.set(x, 1.45, z).project(camera);
          const centerX = (projected.x * .5 + .5) * width;
          const centerY = (.5 - projected.y * .5) * height;
          target.style.left = `${centerX}px`;
          target.style.top = `${centerY}px`;
          // Anchor the name to the floor independently of the hit target's
          // height, including when the camera pulls back on narrow screens.
          projected.set(x, 0, z + .30).project(camera);
          target.style.setProperty('--name-x', `${(projected.x * .5 + .5) * width - centerX}px`);
          target.style.setProperty('--name-y', `${(.5 - projected.y * .5) * height - centerY + 12}px`);
        }
      });

      if (hasArrived && !announcedArrival) {
        moves.forEach(move => {
          move.arrival = false;
          move.step = undefined;
        });
        announcedArrival = true;
        if (actors.has(tiredAside.artistId)) restTimer.current ??= restClock(performance.now());
        if (layoutKey === pendingKey) {
          setSettledRoster(layoutKey);
          entranceComplete.current?.();
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      actors.forEach(actor => {
        actor.mixer.stopAllAction();
        actor.mixer.uncacheRoot(actor.root.children[0]);
      });
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [crouchRequest]);

  return <div className={`standing-scene ${arrived ? 'is-arrived' : 'is-entering'}`}>
    <div className="standing-canvas" ref={host} aria-hidden="true" />
    {(!ready || failed) && <div className="standing-loading" role="status">{failed ? t("有一位来宾还在门外。", "An artist could not be loaded.") : t("他们正走进来…", "The artists are arriving…")}</div>}
    <div className="standing-hit-layer" inert={!arrived}>
      {guests.filter(guest => standingModels[guest.id]).map(guest => <button
        key={guest.id}
        ref={node => { hitTargets.current[guest.id] = node; }}
        className={`standing-artist-hit ${selectedId === guest.id ? 'is-selected' : ''}`}
        onClick={() => onSelect(guest.id)}
        aria-label={t(`让${guest.name}回答`, `Talk to ${guest.english}`)}
        aria-pressed={selectedId === guest.id}
      ><span>{displayName(guest)}</span></button>)}
    </div>
    {arrived && reply && speaker && <ArtistBubble
      key={`${reply.artistId}-${reply.thinking}`}
      ref={bubble}
      reply={reply}
      artistName={displayName(speaker)}
      className="standing-bubble"
    />}
  </div>;
}
