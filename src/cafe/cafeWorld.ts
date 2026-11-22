import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Brush } from './paintSplats';
import { createSkyStars } from './skyStars';
import { buildStreetBackdrop } from './streetBackdrop';

export const artDirectory = import.meta.env.BASE_URL + 'artworks/cafe-terrace/';

const textureNames = [
  'road', 'cobble', 'terrace-stone', 'gold', 'blue', 'plaster', 'ink', 'wood', 'stone', 'foliage',
  'awning', 'shutter', 'window', 'cafe-glass', 'door', 'table',
  'sky', 'bough', 'terrace-relief', 'wood-relief',
] as const;

type TextureName = (typeof textureNames)[number];
export type CafeTextures = Record<TextureName, THREE.Texture>;
type Point = [number, number, number];

export async function loadCafeTextures(anisotropy: number) {
  const loader = new THREE.TextureLoader();
  const settled = await Promise.allSettled(textureNames.map(async (name) => {
    const map = await loader.loadAsync(artDirectory + name + '.webp');
    map.colorSpace = name.endsWith('-relief') ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    return [name, map] as const;
  }));
  const entries = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (entries.length !== textureNames.length) {
    entries.forEach(([, texture]) => texture.dispose());
    throw new Error('The painting textures could not be loaded.');
  }
  return Object.fromEntries(entries) as CafeTextures;
}

function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function buildCafeWorld(textures: CafeTextures) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#142744');
  scene.fog = new THREE.FogExp2('#142e52', .0235);
  const random = randomSequence(1888);
  const extraTextures: THREE.Texture[] = [];
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  const register = <T extends THREE.Material>(material: T) => {
    materials.add(material);
    return material;
  };

  function repeatMap(name: TextureName, repeat: [number, number]) {
    if (repeat[0] === 1 && repeat[1] === 1) return textures[name];
    const map = textures[name].clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(...repeat);
    map.needsUpdate = true;
    extraTextures.push(map);
    return map;
  }

  function paint(
    name: TextureName,
    color: string,
    repeat: [number, number] = [1, 1],
    relief?: [TextureName, number],
    emission = .42,
  ) {
    const map = repeatMap(name, repeat);
    return register(new THREE.MeshStandardMaterial({
      map,
      color,
      emissive: color,
      emissiveMap: map,
      emissiveIntensity: emission,
      bumpMap: relief ? repeatMap(relief[0], repeat) : null,
      bumpScale: relief?.[1] ?? 0,
      roughness: .89,
      side: THREE.DoubleSide,
    }));
  }

  function flat(color: string, map?: THREE.Texture, fog = true) {
    return register(new THREE.MeshBasicMaterial({ color, map, fog }));
  }

  function pigment(name: TextureName, color: string, repeat: [number, number], brush?: Brush) {
    const material = register(new THREE.MeshBasicMaterial({
      map: repeatMap(name, repeat), color, side: THREE.DoubleSide,
    }));
    material.userData.brush = brush;
    return material;
  }

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    position: Point,
    parent: THREE.Object3D = scene,
  ) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    parent.add(object);
    return object;
  }

  function box(
    size: Point, position: Point, material: THREE.Material,
    parent: THREE.Object3D = scene,
  ) {
    const segments = size.map((length) => Math.max(1, Math.ceil(length / 1.1))) as Point;
    return mesh(new THREE.BoxGeometry(...size, ...segments), material, position, parent);
  }

  function panel(
    width: number, height: number, position: Point, material: THREE.Material, yaw = 0,
    parent: THREE.Object3D = scene,
  ) {
    const object = mesh(new THREE.PlaneGeometry(width, height), material, position, parent);
    object.rotation.y = yaw;
    return object;
  }

  function rod(
    start: Point, end: Point, radius: number, material: THREE.Material,
    parent: THREE.Object3D = scene, radiusEnd = radius,
  ) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const mid = a.clone().lerp(b, .5);
    const object = mesh(
      new THREE.CylinderGeometry(radiusEnd, radius, a.distanceTo(b), 8),
      material, [mid.x, mid.y, mid.z], parent,
    );
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return object;
  }

  const matteBlack = flat('#211c16');
  const wroughtIron = paint('ink', '#9e8f5c', [1, 2], undefined, .63);
  const warmTrim = paint('wood', '#eac782', [1, 1], ['wood-relief', .017]);
  const paleTrim = paint('stone', '#b9b5a0', [2, 1]);
  const blueTrim = paint('blue', '#b0b6c6', [1, 1], undefined, .68);
  const greenTrim = pigment('blue', '#86eed3', [.92, 1]);
  const darkBlue = paint('ink', '#b6bac3', [2, 2], undefined, .62);
  const wallBrush: Brush = { count: 7400, length: .178, width: .033, opacity: .64, direction: 'vertical' };
  const roofBrush: Brush = { count: 6200, length: .25, width: .052, opacity: .67, direction: 'horizontal' };
  const facadeBrush: Brush = { count: 2700, length: .19, width: .038, opacity: .50, direction: 'vertical' };
  const roadBrush: Brush = { count: 9200, length: .155, width: .041, opacity: .51, direction: 'stone' };
  const lampLocations = [4.36, -1.33, -4.97];
  const paintLight = { value: 0 };
  const wallWash = lampLocations.map((z) => `cafeLightFalloff(vec3(-2.30, 2.61, ${z.toFixed(2)}))`).join(' + ');

  function lightPaint<T extends THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>(material: T, weight = 1) {
    material.userData.cafeLamp = true;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.cafeLight = paintLight;
      shader.uniforms.cafePaintWeight = { value: weight };
      shader.vertexShader = 'varying vec3 vCafePosition;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCafePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      shader.fragmentShader = `
        uniform float cafeLight;
        uniform float cafePaintWeight;
        varying vec3 vCafePosition;
        float cafeLightFalloff(vec3 source) {
          vec3 d = (vCafePosition - source) * vec3(0.67, 0.50, 0.55);
          return exp(-0.62 * dot(d, d));
        }
      ` + shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `float pool = clamp(${wallWash}, 0.0, 1.0);
         vec3 pigment = gl_FragColor.rgb;
         float value = dot(pigment, vec3(0.28, 0.59, 0.13));
         vec3 moonlit = pigment * vec3(0.099, 0.135, 0.32) + value * vec3(0.039, 0.065, 0.22);
         vec3 lamplit = pigment * (0.82 + pool * 0.24) + value * pool * vec3(0.043, 0.024, 0.005);
         gl_FragColor.rgb = mix(pigment, mix(moonlit, lamplit, cafeLight), cafePaintWeight);
         #include <tonemapping_fragment>`,
      );
    };
    return material;
  }

  const goldWall = lightPaint(pigment('gold', '#fff1b8', [3.7, .95], wallBrush));
  const sidewalk = lightPaint(paint('terrace-stone', '#ffab88', [1.2, 6], ['terrace-relief', .020], .41));
  sidewalk.userData.brush = { ...roadBrush, count: 3700, length: .12, width: .031, opacity: .48 };
  const street = pigment('cobble', '#d6c6d8', [4.7, 12], { ...roadBrush, opacity: .37 });
  // Painterly reflections are fixed to the stones. Lamp state changes how
  // much amber and vermilion show through the cold stone colors.
  street.onBeforeCompile = (shader) => {
    shader.uniforms.terraceLight = paintLight;
    shader.vertexShader = 'varying vec3 vStreetPosition;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvStreetPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = `
      uniform float terraceLight;
      varying vec3 vStreetPosition;
    ` + shader.fragmentShader.replace(
      '#include <tonemapping_fragment>',
      `vec2 p = vStreetPosition.xz;
       vec2 cafe = (p - vec2(0.35, 1.95)) * vec2(0.46, 0.174);
       vec2 shop = (p - vec2(3.36, -4.50)) * vec2(0.62, 0.48);
       float paintVariation = 0.5 + 0.5 * sin(p.x * 2.37 + p.y * 4.31 + sin(p.y * 2.08 - p.x * 5.1));
       float scrape = 0.5 + 0.5 * cos(p.y * 5.2 - p.x * 9.05);
       vec3 pigment = gl_FragColor.rgb;
       float amount = terraceLight * exp(-0.70 * dot(cafe, cafe)) * (0.53 + 0.38 * paintVariation)
                    + exp(-0.63 * dot(shop, shop)) * (0.28 + 0.20 * scrape);
       vec3 ochre = mix(vec3(0.43, 0.082, 0.025), vec3(0.56, 0.25, 0.065), paintVariation * scrape);
       vec3 warmStone = pigment * vec3(1.41, 0.88, 0.32) + ochre * (0.61 + 0.38 * scrape);
       gl_FragColor.rgb = mix(pigment, warmStone, min(amount, 0.91));
       #include <tonemapping_fragment>`,
    );
  };
  const skyMap = repeatMap('sky', [3.1, 1.75]);
  const sky = register(new THREE.MeshBasicMaterial({
    map: skyMap, color: '#e3e6ff', side: THREE.BackSide, fog: false,
  }));
  mesh(new THREE.SphereGeometry(75, 40, 24), sky, [0, 0, 0]);

  const skyStars = createSkyStars(scene);
  const ground = mesh(new THREE.PlaneGeometry(27, 62), street, [0, -.026, -10]);
  ground.rotation.x = -Math.PI / 2;
  box([3.17, .13, 17], [-1.59, .034, .45], sidewalk);
  const curb = paint('wood', '#c07e59', [8, 1]);
  for (let i = 0; i < 39; i++) {
    const z = -7.83 + i * .435;
    const top = .11 + Math.sin(i * 1.27) * .012;
    const curbStone = box([.105, top + .025, .419], [.014 + Math.sin(i * 1.35) * .012, top / 2 - .01, z], curb);
    curbStone.rotation.y = Math.sin(i * 2.1) * .037;
  }
  box([1.07, .10, 39], [3.76, .0, -3.2], paint('stone', '#98a2b5', [.8, 15], undefined, .59));

  // Street-facing architecture carries readable features from the source painting.
  const cafeFacade = new THREE.Group();
  cafeFacade.userData.preserveGeometry = true;
  scene.add(cafeFacade);
  box([.18, 3.62, 19.4], [-3.2, 1.86, 1], goldWall, cafeFacade);
  box([.20, 4.4, 19.4], [-3.23, 5.86, 1], pigment('plaster', '#e8dccf', [3.3, 1.1], facadeBrush), cafeFacade);
  box([.20, .12, 19.4], [-3.09, .17, 1], warmTrim, cafeFacade);
  const ochre = pigment('door', '#eaba70', [1, 3]);
  rod([-3.1, .92, -8.1], [-3.075, .83, 10.3], .028, ochre);
  rod([-3.13, 3.47, -7.94], [-3.095, 3.60, 9.7], .052, greenTrim);
  box([.22, .13, 19.4], [-3.09, 3.55, 1], blueTrim);

  const leftAngle = Math.PI / 2;
  const doorTexture = lightPaint(pigment('door', '#ffe9bc', [1, 1], { ...wallBrush, count: 1150, opacity: .45 }));
  const shutterTexture = paint('shutter', '#d6dbe0', [1, 1], undefined, .74);
  const windowTexture = paint('window', '#e4d4af', [1, 1], undefined, .68);
  const cafeGlass = lightPaint(pigment('cafe-glass', '#ffe3ad', [1, 1], { ...wallBrush, count: 1100 }));
  const bronze = lightPaint(paint('wood', '#b49b5e', [1, 1], undefined, .44), .69);
  lightPaint(warmTrim, .76);
  lightPaint(greenTrim, .77);
  lightPaint(windowTexture, .79);
  lightPaint(ochre, .82);

  const cafeOpenings = [
    { z: 6.73, width: 1.33, bottom: .04, top: 3.02, trim: blueTrim, inside: windowTexture, panes: false },
    { z: 3.48, width: .83, bottom: .08, top: 2.52, trim: greenTrim, inside: doorTexture, panes: false },
    { z: .81, width: 1.55, bottom: .70, top: 2.44, trim: greenTrim, inside: cafeGlass, panes: true },
    { z: -2.60, width: 1.04, bottom: .08, top: 2.35, trim: blueTrim, inside: doorTexture, panes: false },
    { z: -5.44, width: 1.62, bottom: .78, top: 2.51, trim: greenTrim, inside: cafeGlass, panes: true },
  ];
  for (const opening of cafeOpenings) {
    const { z, width, bottom, top, trim, inside, panes } = opening;
    const y = (bottom + top) / 2;
    const height = top - bottom;
    box([.117, height + .09, width + .13], [-3.045, y, z], trim, cafeFacade);
    panel(width - .06, height - .12, [-2.942, y, z], inside, leftAngle, cafeFacade);
    box([.22, .096, width + .25], [-3.055, top + .064, z], trim, cafeFacade);
    box([.18, .065, width + .13], [-3.047, bottom, z], trim, cafeFacade);
    if (panes) {
      for (const offset of [-width / 6, width / 6]) {
        box([.039, height, .037], [-2.904, y, z + offset], bronze, cafeFacade);
      }
      box([.040, .058, width], [-2.902, y - height * .15, z], bronze, cafeFacade);
    }
  }
  for (const [z, width, y] of [[7.2, .75, 4.88], [5.94, .65, 4.72], [3.15, .82, 4.76],
    [.10, .64, 4.58], [-.95, .59, 4.58], [-4.20, .72, 4.67], [-7.40, .64, 4.71]]) {
    panel(width, 1.22, [-3.112, y, z], shutterTexture, leftAngle, cafeFacade);
    panel(width * .82, 1.03, [-3.111, y + 1.70, z + .15], shutterTexture, leftAngle, cafeFacade);
    box([.13, .062, width + .1], [-3.101, y - .65, z], paleTrim, cafeFacade);
  }

  const canopy = lightPaint(pigment('awning', '#fff6c2', [1, 1], roofBrush));
  const canopyFold = (u: number, v: number) => .039 * u * Math.sin(v * 19 + (1 - u) * 1.8) +
    .024 * u * u * Math.sin(v * 47 + .8) + .034 * Math.sin(u * 24 + v * 9) * Math.sin(Math.PI * u);
  const canopyGeometry = new THREE.PlaneGeometry(1, 1, 30, 55);
  const canopyPositions = canopyGeometry.attributes.position;
  for (let i = 0; i < canopyPositions.count; i++) {
    const u = canopyGeometry.attributes.uv.getX(i);
    const v = canopyGeometry.attributes.uv.getY(i);
    canopyPositions.setXYZ(
      i, -3.13 + u * 3.08,
      3.62 - .71 * u - .14 * Math.sin(u * Math.PI) + canopyFold(u, v),
      6.4 - v * 12.85 + .18 * u,
    );
  }
  canopyGeometry.computeVertexNormals();
  mesh(canopyGeometry, canopy, [0, 0, 0]);
  const valanceGeometry = new THREE.PlaneGeometry(1, 1, 80, 2);
  const valancePositions = valanceGeometry.attributes.position;
  for (let i = 0; i < valancePositions.count; i++) {
    const u = valanceGeometry.attributes.uv.getX(i);
    const v = valanceGeometry.attributes.uv.getY(i);
    valancePositions.setXYZ(
      i, -.055 + (1 - v) * .04,
      2.91 + canopyFold(1, u) - (1 - v) * (.155 + .035 * Math.sin(u * Math.PI * 38)),
      6.58 - 12.85 * u,
    );
  }
  valanceGeometry.computeVertexNormals();
  mesh(valanceGeometry, lightPaint(pigment('awning', '#ffbc67', [1, 1])), [0, 0, 0]);

  for (const z of [6.45, 2.22, -2, -6.21]) {
    rod([-3.07, 3.44, z - .21], [-.065, 2.9, z + .018], .023, bronze);
    rod([-3.07, 3.01, z - .22], [-1.68, 3.15, z - .08], .015, wroughtIron);
  }

  // A glass lantern is set just above eye level, deep inside the warm pool of light.
  const lampDim = new THREE.Color('#383f58');
  const lampLit = new THREE.Color('#fff3ba');
  const lampGold = flat('#383f58', textures.gold);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 96;
  const haloBrush = haloCanvas.getContext('2d')!;
  const haloGradient = haloBrush.createRadialGradient(48, 48, 2, 48, 48, 48);
  haloGradient.addColorStop(0, '#ffd279');
  haloGradient.addColorStop(.27, '#f7ab3e76');
  haloGradient.addColorStop(.58, '#ef882519');
  haloGradient.addColorStop(1, '#ef882500');
  haloBrush.fillStyle = haloGradient;
  haloBrush.fillRect(0, 0, 96, 96);
  const haloMap = new THREE.CanvasTexture(haloCanvas);
  haloMap.colorSpace = THREE.SRGBColorSpace;
  extraTextures.push(haloMap);
  const floorGlow = register(new THREE.MeshBasicMaterial({
    map: haloMap, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const cafeLamps: Array<{ light: THREE.PointLight; glow: THREE.SpriteMaterial }> = [];
  const lampFrame = paint('wood', '#9d7138');
  for (const z of lampLocations) {
    rod([-3.07, 2.95, z - .22], [-2.52, 3.0, z], .022, wroughtIron);
    rod([-2.52, 3.0, z], [-2.52, 2.82, z], .02, wroughtIron);
    mesh(new THREE.CylinderGeometry(.13, .085, .25, 6), lampGold, [-2.52, 2.68, z]);
    mesh(new THREE.CylinderGeometry(.025, .158, .09, 6), lampFrame, [-2.52, 2.85, z]);
    mesh(new THREE.CylinderGeometry(.09, .028, .062, 6), lampFrame, [-2.52, 2.54, z]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      rod(
        [-2.52 + Math.sin(a) * .089, 2.56, z + Math.cos(a) * .09],
        [-2.52 + Math.sin(a) * .133, 2.808, z + Math.cos(a) * .133],
        .006, lampFrame,
      );
    }
    const lamp = new THREE.PointLight('#ffbc57', 0, 6.5, 1.8);
    lamp.position.set(-2.30, 2.61, z);
    const glow = register(new THREE.SpriteMaterial({
      map: haloMap, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const halo = new THREE.Sprite(glow);
    halo.scale.set(1.75, 1.75, 1);
    halo.position.set(-2.43, 2.68, z + .07);
    scene.add(lamp, halo);
    const reflection = mesh(new THREE.PlaneGeometry(3.1, 5.5), floorGlow, [-1.33, .105, z]);
    reflection.rotation.x = -Math.PI / 2;
    cafeLamps.push({ light: lamp, glow });
  }

  const leavesCutout = register(new THREE.MeshBasicMaterial({
    map: textures.bough, color: '#bcbca1', alphaTest: .33, side: THREE.DoubleSide,
  }));
  for (const [x, z, height] of [[3.38, -5.65, 5.34], [3.77, -13, 4.88]] as Point[]) {
    const bark = paint('foliage', '#887150', [1, 3]);
    rod([x, 0, z], [x - .08, height * .72, z - .38], .14, bark, scene, .063);
    const leafGeometry = new THREE.IcosahedronGeometry(1, 2);
    const positions = leafGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i), py = positions.getY(i), pz = positions.getZ(i);
      const lean = 1 + .11 * Math.sin(px * 11 + py * 5 + pz * 4);
      positions.setXYZ(i, px * lean, py * lean, pz * lean);
    }
    leafGeometry.computeVertexNormals();
    const leaves = ['#b5d28b', '#8ba854', '#bdc078', '#799980'].map((color) =>
      paint('foliage', color, [1.5, 1], undefined, .62));
    for (let i = 0; i < 15; i++) {
      const dx = (random() - .5) * 3.1;
      const dz = (random() - .5) * 2.9;
      const y = height + (random() - .65) * 1.7;
      if (i < 5) rod([x - .055, height * .5, z], [x + dx, y - .34, z + dz], .064, bark, scene, .019);
      const leaf = mesh(leafGeometry, leaves[i % leaves.length], [x + dx, y, z + dz]);
      leaf.scale.set(.47 + random() * .51, .19 + random() * .3, .46 + random() * .69);
      leaf.rotation.set((random() - .5) * .58, random() * 6.28, (random() - .5) * .6);
      if (i < 11) {
        const bough = panel(1.58 + random() * .71, 1.50 + random() * .75,
          [x + dx - .15, y - .15, z + dz + .42], leavesCutout, (random() - .5) * 2.3);
        bough.rotation.z = (random() - .5) * 1.4;
      }
    }
  }

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const brush = shadowCanvas.getContext('2d')!;
  const fade = brush.createRadialGradient(32, 32, 2, 32, 32, 31);
  fade.addColorStop(0, 'rgba(19,12,16,.67)');
  fade.addColorStop(.38, 'rgba(19,12,16,.42)');
  fade.addColorStop(1, 'rgba(19,12,16,0)');
  brush.fillStyle = fade;
  brush.fillRect(0, 0, 64, 64);
  const shadowMap = new THREE.CanvasTexture(shadowCanvas);
  shadowMap.colorSpace = THREE.SRGBColorSpace;
  extraTextures.push(shadowMap);
  const shadowMaterial = register(new THREE.MeshBasicMaterial({
    map: shadowMap, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }));
  function shadow(x: number, z: number, width: number, length: number, y = .104) {
    mesh(new THREE.PlaneGeometry(width, length), shadowMaterial, [x, y, z]).rotation.x = -Math.PI / 2;
  }

  buildStreetBackdrop({
    plaster: [
      paint('blue', '#8cadd4', [1.14, 1.13], undefined, .66),
      paint('ink', '#c4cbdc', [1.14, 1.13], undefined, .64),
      paint('blue', '#a2bdcd', [1.14, 1.13], undefined, .63),
      paint('plaster', '#dbecdf', [1.14, 1.13], undefined, .75),
      paint('plaster', '#6590b0', [1.14, 1.13], undefined, .62),
    ],
    stone: paint('stone', '#b4c2cd', [1.2, 1.2], undefined, .52),
    cornice: darkBlue,
    recess: flat('#162239'),
    canopy: paint('wood', '#db763f', [1.5, 1], undefined, .54),
    shutters: paint('blue', '#72bd90', [1, 1], undefined, .73),
    roof: paint('road', '#796476', [1.45, 1.2], undefined, .41),
    glass: [
      flat('#fff0aa', textures.gold),
      flat('#ffd070', textures.gold),
      flat('#ffde87', textures.gold),
    ],
    sill: blueTrim,
    paving: paint('cobble', '#aeb5c2', [4.3, 3.4], undefined, .6),
    flagstone: paint('stone', '#acc4bd', [1.7, 3.7], undefined, .64),
    curb,
    spill: register(new THREE.MeshBasicMaterial({
      map: haloMap, transparent: true, opacity: .43, depthWrite: false, blending: THREE.AdditiveBlending,
    })),
  }, mesh, scene, shadow);

  const tableTop = lightPaint(paint('table', '#b0ebbc', [1, 1], undefined, .52), .88);
  const chairWood = lightPaint(paint('wood', '#d7a84e', [1, 3], ['wood-relief', .012]), .82);
  const tableEdge = lightPaint(paint('wood', '#b4ae70'), .83);
  const cup = lightPaint(paint('stone', '#fff0d0', [1, 1], undefined, .56), .82);

  function chair(x: number, z: number, angle: number) {
    const group = new THREE.Group();
    group.position.set(x, .106, z);
    group.rotation.y = angle;
    scene.add(group);
    mesh(new THREE.CylinderGeometry(.218, .199, .055, 12), warmTrim, [0, .45, 0], group).scale.z = .86;
    for (const dx of [-.139, .139]) {
      rod([dx * 1.27, .022, .17], [dx, .46, .125], .018, chairWood, group);
      rod([dx * 1.27, .022, -.222], [dx, .46, -.135], .02, chairWood, group);
      rod([dx, .46, -.135], [dx * .91, .907, -.247], .019, chairWood, group);
    }
    const back = box([.292, .135, .037], [0, .819, -.224], chairWood, group);
    back.rotation.x = -.12;
    rod([-.13, .687, -.204], [.13, .687, -.204], .017, chairWood, group);
    shadow(x, z, .68, .65);
  }

  function table(x: number, z: number, serving: boolean) {
    const table = mesh(new THREE.CylinderGeometry(.438, .414, .063, 34), [tableEdge, tableTop, tableEdge], [x, .866, z]);
    table.rotation.y = (random() - .5) * 1.3;
    rod([x, .20, z], [x, .841, z], .041, wroughtIron);
    for (let j = 0; j < 3; j++) {
      const a = .15 + j * Math.PI * 2 / 3;
      rod([x, .36, z], [x + Math.cos(a) * .311, .127, z + Math.sin(a) * .311], .024, wroughtIron);
    }
    if (serving) {
      mesh(new THREE.CylinderGeometry(.111, .097, .015, 22), cup, [x + .114, .907, z + .058]);
      const ceramic = mesh(new THREE.LatheGeometry([
        new THREE.Vector2(.011, 0), new THREE.Vector2(.046, 0), new THREE.Vector2(.051, .018),
        new THREE.Vector2(.068, .075), new THREE.Vector2(.066, .079), new THREE.Vector2(.057, .079),
        new THREE.Vector2(.052, .026), new THREE.Vector2(.016, .022),
      ], 24), cup, [x + .113, .914, z + .059]);
      ceramic.rotation.y = -.15;
      mesh(new THREE.TorusGeometry(.026, .006, 8, 12), cup, [x + .173, .96, z + .059]);
      mesh(new THREE.CircleGeometry(.053, 24), matteBlack, [x + .113, .975, z + .059]).rotation.x = -Math.PI / 2;
    }
    shadow(x, z, 1.22, 1.23);
  }

  table(-1.51, 4.81, false);
  chair(-.84, 5.31, .9);
  chair(-2.11, 4.45, -2.0);
  table(-1.73, 1.48, true);
  chair(-.99, 1.06, 2.02);
  chair(-2.36, 1.99, -.9);
  table(-1.56, -1.65, false);
  chair(-.87, -1.90, 1.65);
  chair(-2.21, -1.35, -.69);
  table(-1.92, -4.62, false);
  chair(-1.24, -4.69, 1.53);

  // The texture follows world geometry. The slight continuous bend loosens rigid
  // construction lines without opening seams where planes meet.
  scene.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, Map<boolean, THREE.Mesh[]>>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)
      || object.material === sky || object.material.transparent || object.material.alphaTest > 0) return;
    const batch = batches.get(object.material) ?? new Map<boolean, THREE.Mesh[]>();
    const indexed = object.geometry.index !== null;
    const members = batch.get(indexed) ?? [];
    members.push(object);
    batch.set(indexed, members);
    batches.set(object.material, batch);
  });

  for (const [material, sets] of batches) {
    for (const members of sets.values()) {
      const pieces = members.map((member) => {
        const piece = member.geometry.clone().applyMatrix4(member.matrixWorld);
        // A facade, its window frames and its recessed glass use different
        // triangulations. Bending them separately can push walls through panes.
        if (member.parent?.userData.preserveGeometry) return piece;
        const points = piece.attributes.position;
        for (let i = 0; i < points.count; i++) {
          const x = points.getX(i), y = points.getY(i), z = points.getZ(i);
          const envelope = THREE.MathUtils.smoothstep(y, .12, .75);
          const bend = envelope * .054;
          points.setXYZ(i,
            x + bend * Math.sin(y * 2.26 + z * 1.13) * Math.cos(x * 1.55 + y),
            y + bend * .67 * Math.sin(x * 2.1 - z * 1.04 + y * 1.94),
            z + bend * .85 * Math.sin(y * 1.84 + x * 1.27 + z * .74),
          );
        }
        return piece;
      });
      const merged = mergeGeometries(pieces);
      pieces.forEach((piece) => piece.dispose());
      if (merged) {
        members.forEach((member) => member.removeFromParent());
        mesh(merged, material, [0, 0, 0]);
      }
    }
  }

  scene.add(new THREE.HemisphereLight('#d2dfff', '#cdb890', 1.37));
  const skyLight = new THREE.DirectionalLight('#b1c3ed', .9);
  skyLight.position.set(2.4, 6, 4.0);
  scene.add(skyLight);
  const lanternWash = new THREE.DirectionalLight('#ffd78b');
  lanternWash.intensity = 0;
  lanternWash.position.set(-1, 3.0, 5.0);
  scene.add(lanternWash);

  function updateLighting(lit: boolean, delta: number) {
    const target = Number(lit);
    const current = paintLight.value;
    if (current === target) return current;
    const next = THREE.MathUtils.lerp(current, target, 1 - Math.exp(-delta * 7.8));
    const warmth = Math.abs(next - target) < .002 ? target : next;
    for (const { light, glow } of cafeLamps) {
      light.intensity = warmth * 18;
      glow.opacity = warmth * .70;
    }
    paintLight.value = warmth;
    lanternWash.intensity = warmth * .26;
    floorGlow.opacity = warmth * .37;
    lampGold.color.copy(lampDim).lerp(lampLit, warmth);
    return warmth;
  }

  function dispose() {
    skyStars.dispose();
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    extraTextures.forEach((texture) => texture.dispose());
    Object.values(textures).forEach((texture) => texture.dispose());
  }

  return { scene, updateLighting, updateSky: skyStars.update, dispose };
}
