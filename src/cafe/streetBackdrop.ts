import * as THREE from 'three';

type Point = [number, number, number];
type Surface = THREE.Material;

type StreetMaterials = {
  plaster: Surface[];
  stone: Surface;
  cornice: Surface;
  recess: Surface;
  canopy: Surface;
  shutters: Surface;
  roof: Surface;
  glass: Surface[];
  sill: Surface;
  paving: Surface;
  flagstone: Surface;
  curb: Surface;
  spill: Surface;
};

type Front = {
  at: Point;
  yaw: number;
  width: number;
  height: number;
  depth: number;
  palette: number;
  floors: number;
  windows: number;
  roof: 'gable' | 'hip' | 'parapet' | 'none';
  shop?: boolean;
  arcade?: boolean;
  balcony?: boolean;
  returnInset?: number;
};

type Opening = { x: number; y: number; w: number; h: number; arch: number };
const archSegments = 10;

export function buildStreetBackdrop(
  materials: StreetMaterials,
  addMesh: (geometry: THREE.BufferGeometry, surface: Surface, position: Point, parent?: THREE.Object3D) => THREE.Mesh,
  scene: THREE.Scene,
  shadow: (x: number, z: number, width: number, depth: number, y?: number) => void,
) {
  let seed = 1824;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function box(group: THREE.Group, size: Point, at: Point, surface: Surface) {
    return addMesh(new THREE.BoxGeometry(...size), surface, at, group);
  }

  function trace(path: THREE.Path, { x, y, w, h, arch }: Opening) {
    const left = x - w / 2;
    const right = x + w / 2;
    const top = y + h;
    path.moveTo(left, y);
    path.lineTo(right, y);
    if (arch) {
      path.lineTo(right, top - arch);
      path.bezierCurveTo(right, top - arch * .42, x + w * .30, top, x, top);
      path.bezierCurveTo(x - w * .30, top, left, top - arch * .42, left, top - arch);
    } else {
      path.lineTo(right, top);
      path.lineTo(left, top);
    }
    path.lineTo(left, y);
    path.closePath();
  }

  function cutout(shape: THREE.Shape, opening: Opening) {
    const hole = new THREE.Path();
    trace(hole, opening);
    shape.holes.push(hole);
  }

  function facadeGeometry(shape: THREE.Shape) {
    const geometry = new THREE.ShapeGeometry(shape, archSegments);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3.25, uv.getY(i) / 4.2);
    return geometry;
  }

  function openingDetails(group: THREE.Group, opening: Opening, floor: number, column: number, shop: boolean, dim: boolean) {
    const { x, y, w, h, arch } = opening;
    const inset = new THREE.Shape();
    trace(inset, opening);
    const glaze = new THREE.ShapeGeometry(inset, archSegments);
    const uv = glaze.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - x) / w + .5, (uv.getY(i) - y) / h);
    const isDoor = !floor && shop && column === 1;
    const isLit = !isDoor && (shop && !floor || random() < (dim ? .35 : .57));
    const glass = isDoor ? materials.shutters : isLit ? materials.glass[(column + floor) % materials.glass.length] : materials.recess;
    addMesh(glaze, glass, [0, 0, -.248], group);

    const lip = floor ? .075 : .095;
    const surround = new THREE.Shape();
    trace(surround, { x, y: y - lip, w: w + lip * 2, h: h + lip * 2, arch });
    cutout(surround, opening);
    const frame = new THREE.ExtrudeGeometry(surround, { depth: .28, bevelEnabled: false, curveSegments: archSegments });
    addMesh(frame, floor ? materials.stone : materials.cornice, [0, 0, -.227], group);
    box(group, [w + .19, .079, .25], [x, y - .071, .092], materials.sill);
    box(group, [w, .026, .031], [x, y + h * .64, -.218], materials.cornice);
    const panes = shop && !floor ? [-w * .24, 0, w * .24] : [0];
    for (const offset of panes) {
      box(group, [.031, h - .035, .03], [x + offset, y + h / 2, -.215], materials.cornice);
    }
    if (floor && column !== 1 && !dim) {
      const leafWidth = w * .33;
      for (const side of [-1, 1]) {
        const shutter = box(group, [leafWidth, h - .12, .046],
          [x + side * (w / 2 + leafWidth * .37), y + (h - .06) / 2, .077], materials.shutters);
        shutter.rotation.y = .27 * side;
      }
    }
  }

  function front(spec: Front) {
    const { at, yaw, width, height, depth, floors, windows, roof, shop = false,
      arcade = false, balcony = false, returnInset = 0 } = spec;
    const group = new THREE.Group();
    group.position.set(...at);
    group.rotation.y = yaw;
    group.userData.preserveGeometry = true;
    scene.add(group);
    const wall = materials.plaster[spec.palette];
    const shape = new THREE.Shape()
      .moveTo(-width / 2, 0).lineTo(width / 2, 0).lineTo(width / 2, height)
      .lineTo(-width / 2, height).closePath() as THREE.Shape;

    for (let row = 0; row < floors; row++) {
      for (let col = 0; col < windows; col++) {
        if (row > 0 && col === windows - 1 && !shop && !arcade && random() < .16) continue;
        const step = (width - .54) / windows;
        const x = (col - (windows - 1) / 2) * step;
        const tall = row === 0 ? 2.28 : 1.02 + random() * .35;
        const arched = !shop && (arcade || row === 0 && col === 0);
        const opening = {
          x, y: row ? 2.86 + (row - 1) * (height - 3.05) / (floors - 1) : (shop && col !== 1 ? .29 : .076),
          w: Math.min(step * (row ? .51 : shop ? .80 : .59), row ? .98 : 1.47),
          h: tall, arch: arched ? (row ? .23 : .40) : 0,
        };
        if (opening.y + opening.h + .19 > height) continue;
        cutout(shape, opening);
        openingDetails(group, opening, row, col, shop, at[2] < -23 || at[2] > 23);
      }
    }
    addMesh(facadeGeometry(shape), wall, [0, 0, 0], group);
    if (depth > .43) {
      // Leave clearance at the end with the perpendicular shopfront.
      box(group, [width - returnInset, height, depth - .29], [-returnInset / 2, height / 2, -(depth + .29) / 2], wall);
    }
    box(group, [width + .12, .135, .23], [0, height - .23, .07], materials.cornice);
    box(group, [width + .18, .15, .34], [0, height + .02, .09], materials.roof);
    if (shop) {
      box(group, [width + .11, .31, .36], [0, 2.62, .123], materials.cornice);
      box(group, [width - .24, .095, .151], [0, 2.45, .296], materials.canopy);
      box(group, [width + .13, .072, .25], [0, .10, .09], materials.cornice);
      const step = (width - .54) / windows;
      for (let i = 0; i <= windows; i++) {
        box(group, [.13, 2.58, .17], [(i - windows / 2) * step, 1.34, .079], materials.cornice);
      }
      const glow = addMesh(new THREE.PlaneGeometry(width * .95, 2.56), materials.spill, [0, .132, 1.19], group);
      glow.rotation.x = -Math.PI / 2;
    } else if (arcade || balcony) {
      box(group, [width + .052, .107, .25], [0, 2.66, .06], materials.stone);
    }
    if (balcony) {
      const y = 2.795;
      box(group, [width * .63, .10, .52], [0, y, .23], materials.stone);
      box(group, [width * .63, .045, .053], [0, y + .62, .47], materials.cornice);
      for (let i = 0; i < 13; i++) {
        box(group, [.023, .57, .024], [(i - 6) * width * .05, y + .315, .468], materials.cornice);
      }
    }

    if (roof === 'gable' || roof === 'hip') {
      const rise = roof === 'hip' ? 1.04 : 1.26;
      const lip = .14;
      const x = width * .5 + lip;
      const back = -depth - lip;
      const middle = (back + lip) / 2;
      const shoulder = roof === 'hip' ? Math.max(.33, x - depth * .43) : x;
      const positions = [
        -x, height, lip, x, height, lip, -shoulder, height + rise, middle,
        x, height, lip, shoulder, height + rise, middle, -shoulder, height + rise, middle,
        x, height, back, -x, height, back, shoulder, height + rise, middle,
        -x, height, back, -shoulder, height + rise, middle, shoulder, height + rise, middle,
        x, height, lip, x, height, back, shoulder, height + rise, middle,
        -x, height, back, -x, height, lip, -shoulder, height + rise, middle,
      ];
      const roofGeometry = new THREE.BufferGeometry();
      roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const uv = positions.flatMap((coordinate, i) => i % 3 === 0 ? [(coordinate + x) / width, positions[i + 2] / 2.4] : []);
      roofGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      roofGeometry.computeVertexNormals();
      addMesh(roofGeometry, materials.roof, [0, .063, 0], group);
      box(group, [width * .8, .073, .17], [0, height + rise + .08, middle], materials.sill);
      const chimneyX = (spec.palette % 2 ? -.27 : .29) * width;
      box(group, [.37, .80, .51], [chimneyX, height + rise * .81, middle - .18], materials.stone);
      box(group, [.51, .11, .63], [chimneyX, height + rise * .81 + .42, middle - .18], materials.roof);
    }
    return group;
  }

  const left = Math.PI / 2;
  const right = -left;
  const houses: Front[] = [
    { at: [4.48, 0, 10.5], yaw: right, width: 6.4, height: 7.7, depth: 4.7, palette: 0, floors: 3, windows: 3, roof: 'hip', balcony: true },
    { at: [4.77, 0, 4.5], yaw: right, width: 5.55, height: 8.35, depth: 4.9, palette: 1, floors: 3, windows: 2, roof: 'gable', arcade: true },
    { at: [8.84, 0, -.82], yaw: right + .13, width: 5.1, height: 7.5, depth: 4.6, palette: 2, floors: 3, windows: 3, roof: 'hip' },
    { at: [4.06, 0, -6.45], yaw: right, width: 6.13, height: 6.1, depth: 4.8, palette: 3, floors: 2, windows: 3, roof: 'hip', shop: true, returnInset: .32 },
    { at: [6.46, 0, -3.36], yaw: 0, width: 4.82, height: 6.1, depth: .40, palette: 3, floors: 2, windows: 3, roof: 'none', shop: true },
    { at: [4.63, 0, -12.35], yaw: right, width: 5.63, height: 8.22, depth: 4.9, palette: 1, floors: 3, windows: 3, roof: 'gable', arcade: true },
    { at: [4.95, 0, -18.15], yaw: right + .045, width: 5.9, height: 6.02, depth: 4.8, palette: 2, floors: 2, windows: 2, roof: 'hip' },
    { at: [5.61, 0, -24.15], yaw: right + .18, width: 6.14, height: 8.1, depth: 5.2, palette: 0, floors: 3, windows: 3, roof: 'gable' },
    { at: [6.94, 0, -30.54], yaw: right + .25, width: 7.10, height: 6.8, depth: 5.5, palette: 2, floors: 2, windows: 3, roof: 'hip', arcade: true },
    { at: [-3.51, 0, -11.46], yaw: left, width: 5.47, height: 6.73, depth: 5.3, palette: 2, floors: 3, windows: 2, roof: 'hip' },
    { at: [-3.68, 0, -17.11], yaw: left - .035, width: 5.78, height: 8.1, depth: 4.9, palette: 1, floors: 3, windows: 3, roof: 'gable', arcade: true },
    { at: [-3.08, 0, -23.15], yaw: left - .17, width: 6.29, height: 6.5, depth: 4.7, palette: 3, floors: 2, windows: 2, roof: 'hip', balcony: true },
    { at: [-2.02, 0, -29.1], yaw: left - .20, width: 6.05, height: 7.63, depth: 5.1, palette: 0, floors: 3, windows: 3, roof: 'gable' },
    { at: [-2.09, 0, -35.75], yaw: .17, width: 6.56, height: 5.32, depth: 4.8, palette: 4, floors: 2, windows: 3, roof: 'hip', arcade: true },
    { at: [8.19, 0, -48.65], yaw: -.22, width: 8.85, height: 6.14, depth: 5.2, palette: 2, floors: 2, windows: 3, roof: 'hip' },
    { at: [1.72, 0, -54.1], yaw: .21, width: 7.3, height: 7.31, depth: 4.5, palette: 4, floors: 2, windows: 3, roof: 'hip' },
    { at: [-4.86, 0, -58.7], yaw: -.16, width: 6.8, height: 8.26, depth: 5.2, palette: 0, floors: 3, windows: 2, roof: 'gable' },
    { at: [-3.61, 0, 13.52], yaw: left, width: 5.1, height: 7.7, depth: 4.8, palette: 1, floors: 3, windows: 3, roof: 'gable', balcony: true },
    { at: [-4.27, 0, 18.61], yaw: left + .17, width: 5.4, height: 8.1, depth: 4.5, palette: 3, floors: 3, windows: 3, roof: 'hip', arcade: true },
  ];
  for (const house of houses) {
    front(house);
    shadow(house.at[0] + .17 * Math.sin(house.yaw), house.at[2] + .15 * Math.cos(house.yaw),
      Math.abs(Math.sin(house.yaw)) > .5 ? 1.38 : house.width, Math.abs(Math.sin(house.yaw)) > .5 ? house.width + .55 : 1.35, .122);
  }

  const square: Front[] = [
    { at: [-8.07, 0, 22.8], yaw: Math.PI + .18, width: 4.1, height: 6.9, depth: 4.1, palette: 0, floors: 2, windows: 2, roof: 'gable' },
    { at: [-3.9, 0, 24.9], yaw: Math.PI + .12, width: 4.15, height: 7.85, depth: 5.1, palette: 3, floors: 3, windows: 2, roof: 'hip' },
    { at: [.95, 0, 26.04], yaw: Math.PI - .05, width: 5.56, height: 6.11, depth: 4.9, palette: 4, floors: 2, windows: 3, roof: 'hip', arcade: true },
    { at: [6.02, 0, 24.35], yaw: Math.PI - .20, width: 4.6, height: 7.13, depth: 4.94, palette: 2, floors: 3, windows: 2, roof: 'gable', balcony: true },
    { at: [11.60, 0, 22.41], yaw: Math.PI - .32, width: 5.51, height: 6.9, depth: 4.9, palette: 0, floors: 3, windows: 3, roof: 'hip', shop: true },
    { at: [16.04, 0, 20.33], yaw: Math.PI - .39, width: 5.56, height: 8.58, depth: 5.1, palette: 2, floors: 3, windows: 3, roof: 'hip', arcade: true },
    { at: [5.43, 0, 34.3], yaw: Math.PI + .14, width: 10.15, height: 7.86, depth: 5.1, palette: 1, floors: 2, windows: 3, roof: 'hip' },
  ];
  for (const house of square) {
    front(house);
    shadow(house.at[0], house.at[2] - .42, house.width + .52, 1.65, -.006);
  }

  function streetPlane(surface: Surface, width: number, depth: number, x: number, y: number, z: number, twist = 0) {
    const plane = addMesh(new THREE.PlaneGeometry(width, depth), surface, [x, y, z]);
    plane.rotation.set(-Math.PI / 2, 0, twist);
  }

  streetPlane(materials.paving, 37, 23, 2, -.029, 29);
  streetPlane(materials.paving, 28, 23, 5.1, -.030, -48.4);
  streetPlane(materials.flagstone, 4.85, 4.54, 6.18, .105, -4.23);
  streetPlane(materials.spill, 3.7, 5.15, 2.84, -.022, -6.63);
  streetPlane(materials.spill, 4.6, 5.6, 5.12, .114, -2.57, -.14);
  streetPlane(materials.spill, 2.2, 3.1, -2.38, -.015, -17.64, .11);
  for (const [x, z, depth, tilt] of [[3.82, -13.9, 21, 0], [4.32, -26.72, 7.8, -.19], [5.60, -33.66, 7.02, -.23]]) {
    const curb = addMesh(new THREE.BoxGeometry(.18, .13, depth), materials.curb, [x, .038, z]);
    curb.rotation.y = tilt;
  }
  const corner = new THREE.Group();
  corner.position.set(3.38, .087, -5.65);
  scene.add(corner);
  addMesh(new THREE.CylinderGeometry(.63, .51, .52, 10), materials.stone, [0, .24, 0], corner);
  addMesh(new THREE.CylinderGeometry(.67, .65, .081, 10), materials.sill, [0, .495, 0], corner);
  addMesh(new THREE.CylinderGeometry(.54, .54, .036, 10), materials.recess, [0, .532, 0], corner);

  // A small masonry campanile is visible above the distant roofs. The apse
  // and the corner houses leave the passage to its right open in perspective.
  const tower = new THREE.Group();
  tower.position.set(-2.64, 0, -42.3);
  tower.userData.preserveGeometry = true;
  scene.add(tower);
  box(tower, [2.8, 10.38, 3.13], [0, 5.19, 0], materials.plaster[4]);
  for (const y of [7.48, 9.13, 10.36]) {
    box(tower, [2.98, .12, 3.32], [0, y, 0], materials.stone);
  }
  for (const x of [-.56, .56]) {
    const recess = new THREE.Shape();
    trace(recess, { x, y: 7.78, w: .61, h: 1.12, arch: .32 });
    addMesh(new THREE.ShapeGeometry(recess, 9), materials.recess, [0, 0, 1.576], tower);
  }
  const roof = addMesh(new THREE.ConeGeometry(2.20, 2.55, 4), materials.roof, [0, 11.61, 0], tower);
  roof.rotation.y = Math.PI / 4;
  addMesh(new THREE.SphereGeometry(.13, 8, 6), materials.sill, [0, 12.96, 0], tower);
}
