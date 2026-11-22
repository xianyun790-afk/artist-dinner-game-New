import * as THREE from 'three';
import { cafeRoute } from './cafeRoute';
import { buildCafeWorld, loadCafeTextures } from './cafeWorld';

const maxPitch = Math.PI / 2 - .002;
const eyeHeight = 1.58;
const arrowSteps: Record<string, [number, number]> = {
  ArrowLeft: [-.14, 0], ArrowRight: [.14, 0], ArrowUp: [0, .105], ArrowDown: [0, -.105],
};

export function mountCafeScene(
  canvas: HTMLCanvasElement,
  guideLayer: HTMLElement,
  onReady: () => void,
  onError: () => void,
  phonePortrait: MediaQueryList,
) {
  delete canvas.dataset.paintSplats;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const camera = new THREE.PerspectiveCamera(55, 1, .035, 96);
  camera.position.set(cafeRoute[0].x, eyeHeight, cafeRoute[0].z);
  const lookTarget = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const guides = Array.from(guideLayer.querySelectorAll('button'));
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let disposed = false;
  let animationFrame = 0;
  let previousTime = 0;
  let skyClock = 0;
  let world: ReturnType<typeof buildCafeWorld> | undefined;
  let paint: Awaited<ReturnType<typeof import('./paintSplats').addPaintSplats>> = null;
  let lit = false;
  let yaw = -.16;
  let pitch = .25;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let currentStop = 0;
  let travel: { destination: number; from: THREE.Vector3; elapsed: number; duration: number; autoLook: boolean } | null = null;
  let pointer: { id: number; x: number; y: number } | null = null;

  function look(dx: number, dy: number) {
    if (travel) travel.autoLook = false;
    targetYaw += dx;
    targetPitch = THREE.MathUtils.clamp(targetPitch + dy, -maxPitch, maxPitch);
    canvas.dataset.explored = 'true';
  }

  function pointerDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  }

  function pointerMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    // Undo the clockwise layout rotation before applying the drag to the camera.
    const rotated = phonePortrait.matches;
    look(-(rotated ? dy : dx) * .0039, (rotated ? -dx : dy) * .0037);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }

  function pointerUp(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    canvas.classList.remove('is-dragging');
  }

  function key(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
    if (!Object.hasOwn(arrowSteps, event.key)) return;
    look(...arrowSteps[event.key]);
    event.preventDefault();
  }

  function resize() {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (!nextWidth || !nextHeight || (width === nextWidth && height === nextHeight)) return;
    if (!nextWidth || !nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width > 850 ? 1.25 : 1.55));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / Math.min(camera.aspect, 1.05))),
      49, 78,
    );
    camera.updateProjectionMatrix();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    cancelAnimationFrame(animationFrame);
    onError();
  }

  function advanceWalk(elapsed: number, reduceMotion: boolean) {
    if (!travel) return;
    travel.elapsed += elapsed;
    const progress = reduceMotion ? 1 : Math.min(1, travel.elapsed / travel.duration);
    const stop = cafeRoute[travel.destination];
    camera.position.lerpVectors(travel.from, projected.set(stop.x, eyeHeight, stop.z), THREE.MathUtils.smoothstep(progress, 0, 1));
    if (progress < 1) return;

    currentStop = travel.destination;
    const next = cafeRoute[currentStop + 1];
    if (travel.autoLook && next) {
      const change = Math.atan2(next.x - stop.x, stop.z - next.z) - targetYaw;
      targetYaw += Math.atan2(Math.sin(change), Math.cos(change));
      targetPitch = .08;
    }
    travel = null;
  }

  function updateGuides() {
    camera.updateMatrixWorld();
    for (const [index, guide] of guides.entries()) {
      const stop = cafeRoute[index];
      projected.set(stop.x, .72, stop.z).project(camera);
      const x = (projected.x + 1) * width / 2;
      const y = (1 - projected.y) * height / 2;
      const visible = !travel && index !== currentStop && projected.z >= -1 && projected.z <= 1
        && x >= 22 && x <= width - 22 && y >= 22 && y <= height - 22;
      guide.toggleAttribute('data-visible', visible);
      if (!visible) continue;
      guide.toggleAttribute('data-next', index === currentStop + 1);
      guide.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  }

  function frame(timestamp: number) {
    if (!world || disposed) return;
    animationFrame = requestAnimationFrame(frame);
    const firstFrame = previousTime === 0;
    const elapsed = firstFrame ? 0 : Math.min((timestamp - previousTime) / 1000, 1);
    previousTime = timestamp;
    const reduceMotion = media.matches;
    advanceWalk(elapsed, reduceMotion);
    const ease = reduceMotion || firstFrame ? 1 : 1 - Math.exp(-elapsed * 17);
    yaw = THREE.MathUtils.lerp(yaw, targetYaw, ease);
    pitch = THREE.MathUtils.lerp(pitch, targetPitch, ease);
    lookTarget.set(
      camera.position.x + Math.sin(yaw) * Math.cos(pitch),
      camera.position.y + Math.sin(pitch),
      camera.position.z - Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(lookTarget);
    updateGuides();
    if (!reduceMotion) skyClock += Math.min(elapsed, .08);
    world.updateSky(skyClock);
    const light = world.updateLighting(lit, reduceMotion || firstFrame ? 2 : elapsed);
    paint?.setLight(light);
    renderer.render(world.scene, camera);
  }

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('webglcontextlost', contextLost);
  window.addEventListener('keydown', key);

  const paintModule = import('./paintSplats').catch(() => null);
  void loadCafeTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy())).then(async (textures) => {
    if (disposed) {
      Object.values(textures).forEach((texture) => texture.dispose());
      return;
    }
    world = buildCafeWorld(textures);
    // The textured terrain remains usable on WebGL devices that cannot initialize the splat pass.
    try {
      const module = await paintModule;
      if (disposed) return;
      const layer = module ? await module.addPaintSplats(renderer, world.scene, phonePortrait.matches || width < 640) : null;
      if (disposed) {
        layer?.dispose();
        return;
      }
      paint = layer;
      if (paint) canvas.dataset.paintSplats = String(paint.count);
    } catch {
      if (disposed) return;
    }
    renderer.compile(world.scene, camera);
    animationFrame = requestAnimationFrame((timestamp) => {
      frame(timestamp);
      if (!disposed) onReady();
    });
  }).catch(() => {
    if (!disposed) onError();
  });

  return {
    walkTo(destination: number) {
      const stop = cafeRoute[destination];
      if (travel || !stop || destination === currentStop) return;
      const from = camera.position.clone();
      const distance = Math.hypot(stop.x - from.x, stop.z - from.z);
      travel = { destination, from, elapsed: 0, duration: THREE.MathUtils.clamp(distance * .18, .8, 2.8), autoLook: true };
    },
    setLit(value: boolean) { lit = value; },
    dispose() {
      disposed = true;
      observer.disconnect();
      window.removeEventListener('keydown', key);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('lostpointercapture', pointerUp);
      canvas.removeEventListener('webglcontextlost', contextLost);
      cancelAnimationFrame(animationFrame);
      paint?.dispose();
      world?.dispose();
      renderer.dispose();
    },
  };
}
