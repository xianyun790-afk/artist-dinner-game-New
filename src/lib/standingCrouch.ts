import * as THREE from 'three';

const position = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());
const rotation = (node: THREE.Object3D) => node.getWorldQuaternion(new THREE.Quaternion());

function setWorldRotation(node: THREE.Object3D, target: THREE.Quaternion) {
  node.quaternion.copy(rotation(node.parent!).invert().multiply(target));
}

function aimAt(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
  const origin = position(bone);
  const from = position(child).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const swing = new THREE.Quaternion().setFromUnitVectors(from, to);
  setWorldRotation(bone, swing.multiply(rotation(bone)));
}

// Sample a one-shot clip from the live standing pose. Both soles retain their
// original position and orientation, including on rigs with different bone rolls.
export function startCrouch(root: THREE.Object3D, onLowered?: () => void) {
  const bones = new Map<string, THREE.Bone>();
  root.traverse(node => { if (node instanceof THREE.Bone) bones.set(node.name, node); });
  const get = (name: string) => bones.get(THREE.PropertyBinding.sanitizeNodeName(name));
  const pelvis = get('pelvis');
  const legs = ['L', 'R'].flatMap(side => {
    const thigh = get('thigh.' + side), shin = get('shin.' + side), foot = get('foot.' + side);
    if (!thigh || !shin || !foot) return [];
    const hip = position(thigh), knee = position(shin), ankle = position(foot);
    return [{ thigh, shin, foot, ankle, soleRotation: rotation(foot), upper: hip.distanceTo(knee), lower: knee.distanceTo(ankle) }];
  });
  if (!pelvis || legs.length !== 2) return null;
  const lengths = legs.map(leg => leg.upper + leg.lower);
  const length = Math.min(...lengths);
  const hip = position(pelvis);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation(root));
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation(root));
  const up = new THREE.Vector3(0, 1, 0);
  const lean = (name: string, angle: number) => {
    const bone = get(name);
    if (bone) setWorldRotation(bone, new THREE.Quaternion().setFromAxisAngle(right, angle).multiply(rotation(bone)));
  };
  const channels = [...bones.values()].map(bone => ({
    bone, rest: bone.quaternion.clone(), samples: [] as number[],
  }));
  const restPosition = pelvis.position.clone();
  function restore() {
    pelvis!.position.copy(restPosition);
    channels.forEach(channel => channel.bone.quaternion.copy(channel.rest));
  }

  const times: number[] = [], hipPositions: number[] = [];
  const duration = 3.4;
  const loweredAt = 0.95;
  for (let frame = 0; frame <= 102; frame++) {
    const time = frame / 30;
    const depth = THREE.MathUtils.smoothstep(time, 0, loweredAt) * (1 - THREE.MathUtils.smoothstep(time, 2.35, duration));
    restore();
    if (depth > 0) {
      const shift = hip.clone().addScaledVector(up, -0.58 * length * depth)
        .addScaledVector(forward, -0.24 * length * depth);
      pelvis.position.copy(pelvis.parent!.worldToLocal(shift));
      for (const { thigh, shin, foot, ankle, soleRotation, upper, lower } of legs) {
        const joint = position(thigh);
        const axis = ankle.clone().sub(joint);
        const distance = axis.length();
        axis.normalize();
        const along = (upper ** 2 - lower ** 2 + distance ** 2) / (2 * distance);
        const radius = Math.sqrt(Math.max(0, upper ** 2 - along ** 2));
        const side = Math.sign(ankle.clone().sub(hip).dot(right));
        const pole = forward.clone().addScaledVector(right, side * 0.52);
        pole.addScaledVector(axis, -pole.dot(axis)).normalize();
        const knee = joint.clone().addScaledVector(axis, along).addScaledVector(pole, radius);
        aimAt(thigh, shin, knee);
        aimAt(shin, foot, ankle);
        setWorldRotation(foot, soleRotation);
      }
      lean('spine', 0.32 * depth);
      lean('head', -0.23 * depth);
      for (const side of ['L', 'R']) {
        lean('upper_arm.' + side, -0.62 * depth);
        lean('forearm.' + side, -0.35 * depth);
      }
    }
    times.push(time);
    hipPositions.push(...pelvis.position.toArray());
    channels.forEach(({ bone, samples }) => samples.push(...bone.quaternion.toArray()));
  }
  restore();
  const tracks: THREE.KeyframeTrack[] = channels.map(({ bone, samples }) =>
    new THREE.QuaternionKeyframeTrack(bone.uuid + '.quaternion', times, samples));
  tracks.push(new THREE.VectorKeyframeTrack(pelvis.uuid + '.position', times, hipPositions));
  const clip = new THREE.AnimationClip('Crouch', duration, tracks);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  return {
    update(delta: number) {
      const previousTime = mixer.time;
      mixer.update(delta);
      if (previousTime < loweredAt && mixer.time >= loweredAt) onLowered?.();
      if (mixer.time < duration) return true;
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      return false;
    },
  };
}
