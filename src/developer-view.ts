import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGameModels, animateWalkingModel, type CharacterModel } from './game-models';
import { createCombatEffects, type FightingVisual } from './combat-effects';
import { TerrainSurface } from './terrain-surface';
import type { HousePower } from './settlement';

export type DeveloperModel =
  | 'character'
  | 'house-1'
  | 'house-2'
  | 'house-3'
  | 'house-4'
  | 'castle'
  | 'knight'
  | 'combat';
export function developerModels(): readonly { id: DeveloperModel; label: string }[] {
  return [
    { id: 'character', label: 'Character walking' },
    { id: 'house-1', label: 'Hut · level 1' },
    { id: 'house-2', label: 'Cottage · level 2' },
    { id: 'house-3', label: 'Townhouse · level 3' },
    { id: 'house-4', label: 'Manor · level 4' },
    { id: 'castle', label: 'Castle · level 5' },
    { id: 'knight', label: 'Knight walking' },
    { id: 'combat', label: 'Two characters fighting' },
  ];
}

/** An isolated model stage, using production geometry, walking poses and combat effects. */
export function createDeveloperView(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  reducedMotion = false,
) {
  const models = createGameModels(),
    effects = createCombatEffects(),
    scene = new THREE.Scene();
  scene.background = new THREE.Color('#adc8bb');
  scene.add(new THREE.HemisphereLight('#fff8dc', '#719e92', 2.4));
  const sun = new THREE.DirectionalLight('#fff2cc', 3.2);
  sun.position.set(-4, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.1, far: 25 });
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const groundGeometry = new THREE.CylinderGeometry(3.2, 3.2, 0.12, 64),
    groundMaterial = new THREE.MeshStandardMaterial({ color: '#94ae7c', roughness: 1 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.name = 'developer-stage';
  ground.position.y = -0.09;
  ground.receiveShadow = true;
  scene.add(ground);
  const previousTouchAction = canvas.style.touchAction;
  const previousCursor = canvas.style.cursor;
  const pointers = new Set<number>();
  function trackPointer(event: PointerEvent): void {
    pointers.add(event.pointerId);
  }
  function releasePointer(event: PointerEvent): void {
    pointers.delete(event.pointerId);
  }
  canvas.addEventListener('pointerdown', trackPointer);
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 50),
    controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.cursorStyle = 'grab';
  controls.enablePan = false;
  controls.minZoom = 0.5;
  controls.maxZoom = 4;
  controls.minPolarAngle = Math.PI / 12;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  const surface = new TerrainSurface(8, new Uint8Array(81), 0.65),
    tile = { x: 4, z: 4 };
  const root = new THREE.Group();
  scene.add(root);
  let actors: (CharacterModel & FightingVisual)[] = [],
    choice: DeveloperModel = 'character',
    time = 0,
    disposed = false,
    paused = reducedMotion;
  let viewHeight = 1.7,
    viewWidth = 1;
  function clear(): void {
    effects.update([], time);
    for (const child of [...root.children]) models.disposeInstance(child);
    root.clear();
    actors = [];
  }
  function character(population: 'red' | 'blue', x = 0): CharacterModel & FightingVisual {
    const actor = { ...models.character(population), phase: population === 'red' ? 0 : Math.PI };
    actor.mesh.position.x = x;
    root.add(actor.mesh);
    actors.push(actor);
    return actor;
  }
  function select(model: DeveloperModel): void {
    if (disposed || !developerModels().some((item) => item.id === model)) return;
    clear();
    choice = model;
    time = 0;
    let targetHeight = 0.35;
    viewHeight = 1.7;
    viewWidth = 1;
    if (model === 'character') character('red');
    else if (model === 'knight') {
      const actor = character('red');
      models.equipKnight(actor, 'red');
      targetHeight = 0.7;
      viewHeight = 2.8;
      viewWidth = 1.8;
    } else if (model === 'combat') {
      character('red', -0.2);
      character('blue', 0.2);
      viewHeight = 2;
      viewWidth = 1.5;
    } else {
      const power = model === 'castle' ? 5 : (Number(model.slice(-1)) as HousePower);
      const building =
        power === 5
          ? models.castle(tile, 'red', surface)
          : models.house(tile, power, 'red', surface, 0);
      building.position.x = building.position.z = 0;
      root.add(building);
      targetHeight = power === 5 ? 1 : power >= 3 ? 0.75 : 0.5;
      viewHeight = power === 5 ? 4.8 : power >= 3 ? 3 : 2.5;
      viewWidth = power === 5 ? 4.6 : 1.8;
    }
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    camera.position.set(5, targetHeight + 4, 7);
    camera.zoom = 1;
    controls.target.set(0, targetHeight, 0);
    controls.update();
  }
  function render(seconds: number, width: number, height: number): void {
    if (disposed) return;
    if (!paused && Number.isFinite(seconds) && seconds > 0) time += Math.min(seconds, 0.05);
    if (choice === 'combat') effects.update([{ a: actors[0], b: actors[1] }], time);
    else
      for (const actor of actors) {
        animateWalkingModel(actor, time, actor.phase);
        actor.mesh.position.y = Math.abs(Math.sin(time * 0.65 * Math.PI * 4)) * 0.035;
      }
    const h = Math.max(1, height),
      sidebar = width < 700 ? 154 : 248,
      available = Math.max(50, width - sidebar - 16);
    const frame = Math.max(viewHeight, (viewWidth * h) / available),
      aspect = Math.max(1, width) / h,
      shift = (frame * sidebar) / (2 * h);
    camera.left = (-frame * aspect) / 2 - shift;
    camera.right = (frame * aspect) / 2 - shift;
    camera.top = frame / 2;
    camera.bottom = -frame / 2;
    camera.updateProjectionMatrix();
    controls.update();
    renderer.render(scene, camera);
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clear();
    controls.dispose();
    for (const pointer of pointers)
      if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointers.clear();
    canvas.removeEventListener('pointerdown', trackPointer);
    canvas.removeEventListener('pointerup', releasePointer);
    canvas.removeEventListener('pointercancel', releasePointer);
    canvas.style.touchAction = previousTouchAction;
    canvas.style.cursor = previousCursor;
    effects.dispose();
    models.dispose();
    groundGeometry.dispose();
    groundMaterial.dispose();
    sun.shadow.dispose();
    scene.clear();
    renderer.renderLists.dispose();
  }
  select('character');
  return {
    select,
    render,
    dispose,
    get selection() {
      return choice;
    },
    get paused() {
      return paused;
    },
    set paused(value: boolean) {
      paused = value;
    },
  };
}
