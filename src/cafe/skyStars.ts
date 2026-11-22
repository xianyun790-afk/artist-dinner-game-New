import * as THREE from 'three';

const turn = Math.PI * 2;
const tones = ['#ffe78a', '#fff0ad', '#ffde6b', '#fff3c4', '#ffd75d'];

export function createSkyStars(scene: THREE.Scene) {
  const clock = { value: 0 };
  const positions: number[] = [];
  const colors: number[] = [];
  const pulses: number[] = [];
  const color = new THREE.Color();
  let seed = 188826;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const bands = 8;
  const sectors = 16;
  const radius = 67;
  // Equal-area patches cover every direction, with uneven populations and
  // randomly placed stars inside each patch.
  for (let band = 0; band < bands; band++) {
    for (let sector = 0; sector < sectors; sector++) {
      const angle = turn * sector / sectors;
      const density = Math.sin(angle * 3 + band * 1.6) + .6 * Math.cos(angle * 5 - band * 1.3);
      const count = Math.round(10 + 2.6 * density + random() * 4);
      for (let i = 0; i < count; i++) {
        const bearing = turn * (sector + random()) / sectors;
        const height = .028 + .972 * (band + random()) / bands;
        const horizontal = radius * Math.sqrt(1 - height * height);
        const emphasis = random();
        const diameter = 5.5 + 15.5 * Math.pow(emphasis, 4.8)
          + 10 * THREE.MathUtils.smoothstep(emphasis, .86, 1);
        positions.push(Math.sin(bearing) * horizontal, height * radius, -Math.cos(bearing) * horizontal);
        color.set(tones[Math.floor(random() * tones.length)]).toArray(colors, colors.length);
        pulses.push(turn / (1.7 + random() * 3.2), random() * turn, .76 + emphasis * .24, diameter);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('starPulse', new THREE.Float32BufferAttribute(pulses, 4));

  const material = new THREE.PointsMaterial({
    size: 1, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.starClock = clock;
    shader.vertexShader = `
      uniform float starClock;
      attribute vec4 starPulse;
      varying float vStarLight;
    ` + shader.vertexShader.replace('gl_PointSize = size;', `
      float wave = 0.5 + 0.5 * sin(starClock * starPulse.x + starPulse.y);
      vStarLight = starPulse.z * mix(0.37, 1.0, pow(wave, 1.65));
      gl_PointSize = size * starPulse.w;
    `);
    shader.fragmentShader = 'varying float vStarLight;\n' + shader.fragmentShader.replace(
      '#include <alphatest_fragment>', `
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float core = 1.0 - smoothstep(0.12, 0.48, radius);
        float halo = 1.0 - smoothstep(0.17, 1.0, radius);
        diffuseColor.a *= vStarLight * (0.69 * core + 0.31 * halo * halo);
        #include <alphatest_fragment>
      `,
    );
  };
  const stars = new THREE.Points(geometry, material);
  stars.renderOrder = -1;
  scene.add(stars);

  return {
    update(seconds: number) { clock.value = seconds; },
    dispose() {
      stars.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
