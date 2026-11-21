import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { startCrouch } from '../src/lib/standingCrouch.ts';

for (const [artist, standingClip] of [['vincent', 'Idle'], ['dali', 'ArmsCrossed'], ['monet', 'Idle']]) {
  test(artist + ' crouches with planted shoes and returns to the captured pose', async () => {
    const file = await readFile(new URL('../public/models/standing/' + artist + '.glb', import.meta.url));
    const loader = new GLTFLoader().register(() => ({
      name: 'test-material', loadMaterial: async () => new THREE.MeshBasicMaterial(),
    }));
    const { scene, animations } = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
    const baseMixer = new THREE.AnimationMixer(scene);
    baseMixer.clipAction(THREE.AnimationClip.findByName(animations, standingClip)).play();
    baseMixer.update(0);
    const bones = [];
    scene.traverse(node => { if (node.isBone) bones.push(node); });
    const original = bones.map(bone => bone.quaternion.clone());
    const soles = bones.filter(bone => bone.name.startsWith('foot'));
    assert.equal(soles.length, 2);
    const positions = soles.map(foot => foot.getWorldPosition(new THREE.Vector3()));
    const rotations = soles.map(foot => foot.getWorldQuaternion(new THREE.Quaternion()).normalize());
    const pelvis = scene.getObjectByName('pelvis');
    const initialHeight = pelvis.getWorldPosition(new THREE.Vector3()).y;
    let lowest = initialHeight;
    let lowered = 0;
    const crouch = startCrouch(scene, () => {
      lowered++;
      assert.ok(initialHeight - pelvis.getWorldPosition(new THREE.Vector3()).y > 0.13);
    });
    assert.ok(crouch);
    for (let i = 0; i < 210; i++) {
      const moving = crouch.update(1 / 60);
      lowest = Math.min(lowest, pelvis.getWorldPosition(new THREE.Vector3()).y);
      soles.forEach((foot, index) => {
        assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(positions[index]) < 0.002);
        assert.ok(foot.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(rotations[index]) < 0.02);
      });
      if (!moving) break;
      assert.ok(i < 209, 'one-shot clip must complete');
    }
    assert.equal(lowered, 1);
    assert.ok(initialHeight - lowest > 0.13);
    assert.ok(Math.abs(initialHeight - pelvis.getWorldPosition(new THREE.Vector3()).y) < 1e-5);
    bones.forEach((bone, index) => assert.ok(bone.quaternion.clone().normalize().angleTo(original[index].normalize()) < 1e-5));
  });
}
