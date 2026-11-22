import * as THREE from 'three';
import { PackedSplats, SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

export type Brush = {
  count: number;
  length: number;
  width: number;
  opacity: number;
  direction: 'vertical' | 'horizontal' | 'stone';
};

type PaintMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;

export async function addPaintSplats(renderer: THREE.WebGLRenderer, scene: THREE.Scene, compact: boolean) {
  const spark = new SparkRenderer({
    renderer, enableLod: false, sortRadial: true, minSortIntervalMs: compact ? 38 : 24,
    maxPixelRadius: 85, maxStdDev: 2.5, minAlpha: .027,
  });
  const surroundingPaint = new PackedSplats({ maxSplats: compact ? 4500 : 8400 });
  const cafePaint = new PackedSplats({ maxSplats: compact ? 11000 : 19000 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    spark.dispose();
    surroundingPaint.dispose();
    cafePaint.dispose();
    return null;
  }

  let seed = 40991888;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const imageCache = new Map<HTMLImageElement, ImageData>();
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const field = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const uv = new THREE.Vector2();
  const scale = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const color = new THREE.Color();
  const normalMatrix = new THREE.Matrix3();
  const tint = new THREE.Color();
  scene.updateMatrixWorld(true);

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const material = object.material as PaintMaterial;
    const brush = material.userData.brush as Brush | undefined;
    const map = material.map;
    if (!brush || !map || !(map.image instanceof HTMLImageElement)) return;
    const image = map.image;
    let pixels = imageCache.get(image);
    if (!pixels) {
      canvas.width = Math.min(image.naturalWidth, 600);
      canvas.height = Math.min(image.naturalHeight, 600);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      imageCache.set(image, pixels);
    }
    map.updateMatrix();
    tint.copy(material.color).convertLinearToSRGB();
    normalMatrix.getNormalMatrix(object.matrixWorld);
    const sampler = new MeshSurfaceSampler(object) as MeshSurfaceSampler & {
      setRandomGenerator(generator: () => number): MeshSurfaceSampler;
    };
    sampler.setRandomGenerator(random).build();
    const splats = material.userData.cafeLamp ? cafePaint : surroundingPaint;
    const count = Math.round(brush.count * (compact ? .55 : 1));
    const sampleHeight = pixels.height;
    const sampleWidth = pixels.width;
    for (let i = 0; i < count; i++) {
      sampler.sample(position, normal, undefined, uv);
      position.applyMatrix4(object.matrixWorld);
      normal.applyNormalMatrix(normalMatrix);
      if (position.y < -.12 || position.z < -28 || position.z > 20) continue;

      // Prefer the surfaces visible at the café. Extend only a little off their edges
      // so the marks have thickness but stay registered as the viewpoint travels.
      if (position.x < -3.35 || position.x > 5.2) continue;
      if (brush.direction === 'stone' && Math.abs(position.x) > 3.2) continue;
      if (brush.direction === 'horizontal' && normal.y > .4 && i % 4 !== 0) normal.negate();
      position.addScaledVector(normal, .012 + random() * .034);
      if (brush.direction === 'vertical') field.set(0, 1, -.14 + random() * .28);
      else if (brush.direction === 'horizontal') field.set(0, .15, 1);
      else field.set(.68, 0, .55 + random() * .48).normalize();
      tangent.copy(field).addScaledVector(normal, -field.dot(normal));
      if (tangent.lengthSq() < .06) {
        field.set(1, 0, 0);
        tangent.copy(field).addScaledVector(normal, -field.dot(normal));
      }
      tangent.normalize().applyAxisAngle(normal, (random() - .5) * .57);
      v.crossVectors(normal, tangent).normalize();
      u.crossVectors(v, normal).normalize();
      rotation.setFromRotationMatrix(basis.makeBasis(u, v, normal));
      const size = .42 + Math.pow(random(), 2) * 1.11;
      scale.set(brush.length * size, brush.width * size, .013 + .011 * size);

      map.transformUv(uv);
      const x = Math.round(uv.x * (sampleWidth - 1));
      const y = Math.round(uv.y * (sampleHeight - 1));
      const k = (y * sampleWidth + x) * 4;
      const shade = .71 + random() * .51;
      const warm = (i % 9 === 0 && brush.direction !== 'stone') ? .064 : 0;
      const cool = (i % 7 === 0 && brush.direction === 'stone') ? .11 : 0;
      color.setRGB(
        Math.min(1, pixels.data[k] * tint.r * shade / 255 + warm),
        Math.min(1, pixels.data[k + 1] * tint.g * shade / 255),
        Math.min(1, pixels.data[k + 2] * tint.b * shade / 255 + cool),
      );
      splats.pushSplat(position, scale, rotation, brush.opacity * (.46 + random() * .54), color);
    }
  });

  const surroundingCloud = new SplatMesh({ packedSplats: surroundingPaint, raycastable: false });
  const cafeCloud = new SplatMesh({ packedSplats: cafePaint, raycastable: false });
  try {
    await Promise.all([surroundingCloud.initialized, cafeCloud.initialized]);
    scene.add(spark, surroundingCloud, cafeCloud);
  } catch (error) {
    spark.dispose();
    surroundingCloud.dispose();
    cafeCloud.dispose();
    throw error;
  }

  let lastLight = Number.NaN;
  return {
    count: surroundingPaint.numSplats + cafePaint.numSplats,
    setLight(amount: number) {
      if (lastLight === amount) return;
      lastLight = amount;
      cafeCloud.recolor.setRGB(.38 + amount * .62, .46 + amount * .54, .76 + amount * .24);
      cafeCloud.opacity = .61 + amount * .39;
    },
    dispose() {
      spark.removeFromParent();
      surroundingCloud.removeFromParent();
      cafeCloud.removeFromParent();
      spark.dispose();
      surroundingCloud.dispose();
      cafeCloud.dispose();
    },
  };
}
