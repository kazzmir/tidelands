import './style.css';
import { generateWorldHeights } from './world-generation';
import { TerrainSurface, type GridPoint, type TerrainBounds } from './terrain-surface';
import { PowerMeter } from './power';
import { Leadership, buildRallyField, rallySteps } from './leadership';
import { clearSubmergedRock, markVolcanicRock } from './rock';
import { grazingNeighbors, planFlock, SheepSpawner, type GrazingSheep } from './sheep';
import { elevationContours } from './terrain-contours';
import { advanceSurvival, createSurvival, SINKING_SECONDS, type Survival } from './survival';
import {
  clearSubmergedSwamps,
  earthquake,
  flood,
  volcano,
  swampTargets,
  SPELL_COSTS,
  SPELL_NAMES,
  type Spell,
} from './spells';
import { advanceSickness } from './sickness';
import {
  BIRTH_THRESHOLD,
  birthInterval,
  characterGrowthRate,
  growPopulation,
  INITIAL_CHARACTER_POWER,
  populationShirtColor,
} from './population';
import {
  fertileLand,
  evacuateSettlements,
  homeSupport,
  reconcileSettlements,
  totalBuildingPower,
  trySettle,
  type HousePower,
  type Resident,
} from './settlement';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type Tool = 'raise' | 'lower' | 'inspect';
interface Tile {
  x: number;
  z: number;
  height: number;
  tree: boolean;
  house: boolean;
  swamp: boolean;
  rock: boolean;
  reserved?: boolean;
  castleGap?: boolean;
}
interface Settler extends Resident<Tile> {
  mesh: THREE.Group;
  survival: Survival;
  sick: boolean;
  head: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  target: Tile | null;
  progress: number;
  wait: number;
  phase: number;
  legs: THREE.Mesh[];
}

interface Sheep extends GrazingSheep<Tile> {
  mesh: THREE.Group;
  progress: number;
  wait: number;
  phase: number;
  legs: THREE.Mesh[];
}

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing element: ${selector}`);
  return result;
}
function createIconRenderer(): (name: string) => string {
  const icons: Record<string, string> = {
    rally: '<path d="M12 3v14m0-14h7l-2 3 2 3h-7M3 20h18M3 12l4 3-4 3m18-6-4 3 4 3"/>',
    refresh:
      '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17"/>',
    people:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
    power: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    earthquake: '<path d="m3 17 6 3 4-2 8 3M3 12l5-2 4 2 9-3M13 2l-3 5 5 2-5 6 3 3"/>',
    swamp:
      '<path d="M3 18c2-2 4 2 6 0s4 2 6 0 4 2 6 0M6 14V7m-2 3 2 2 2-2M15 15V4m-3 4 3 3 3-3M10 21h6"/>',
    flood:
      '<path d="M12 2v8m-3-3 3 3 3-3M3 14c2-3 4 3 6 0s4 3 6 0 4 3 6 0M3 20c2-3 4 3 6 0s4 3 6 0 4 3 6 0"/>',
    volcano: '<path d="m3 21 5-11h8l5 11ZM8 10l4 3 4-3M9 6 7 3m5 3V1m3 5 3-3"/>',
    raise: '<path d="m3 16 9 5 9-5M3 12l9 5 9-5M12 12V2m-4 4 4-4 4 4"/>',
    lower: '<path d="m3 17 9 5 9-5M3 13l9 5 9-5M12 2v10m-4-4 4 4 4-4"/>',
    inspect: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M10 7v6M7 10h6"/>',
    house: '<path d="m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7"/>',
    mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7M6 10h12"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    focus: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="3"/>',
  };
  function icon(name: string): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
  }
  return icon;
}

function initializeIcons(renderIcon: (name: string) => string): void {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => {
    node.innerHTML = renderIcon(node.dataset.icon ?? '');
  });
}

function createWorldView() {
  const canvas = element<HTMLCanvasElement>('#scene');
  const world = element('#world');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor('#a9cfc4');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#a9cfc4', 0.006);
  const camera = new THREE.OrthographicCamera(-25, 25, 20, -20, 0.1, 180);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = true;
  controls.minPolarAngle = Math.PI / 6;
  controls.maxPolarAngle = Math.PI / 2.6;
  controls.minZoom = 0.65;
  controls.maxZoom = 8;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  function resetCamera(): void {
    camera.position.set(34, 34, 34);
    controls.target.set(0, 0, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }
  resetCamera();
  scene.add(new THREE.HemisphereLight('#fff8dc', '#719e92', 2.4));
  const sun = new THREE.DirectionalLight('#fff2cc', 3.2);
  sun.position.set(-18, 32, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -26,
    right: 26,
    top: 26,
    bottom: -26,
    near: 1,
    far: 90,
  });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  return { canvas, world, renderer, scene, camera, controls, sun, resetCamera };
}

function startGame(): void {
  const icon = createIconRenderer();
  initializeIcons(icon);
  const { canvas, world, renderer, scene, camera, controls, sun, resetCamera } = createWorldView();
  const SIZE = 1000;
  const STEP = 0.65;
  const SEA = 0.08;
  const powerMeter = new PowerMeter(5, 10_000);
  let selectedSpell: Spell | null = null;
  let seed = 34;
  let randomState = seed;
  function random(): number {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  }
  function hash(x: number, z: number): number {
    const n = Math.sin(x * 127.1 + z * 311.7 + seed * 13.3) * 43758.5453;
    return n - Math.floor(n);
  }
  const tiles: Tile[] = [];
  const tileCache = new Map<number, Tile>();
  let visibleTiles: Tile[] = [];
  let renderedBounds: TerrainBounds = { x: 0, z: 0, width: 0, depth: 0 };
  const cornerLevels = new Uint8Array((SIZE + 1) ** 2);
  const terrain = new THREE.Group();
  const scenery = new THREE.Group();
  const people = new THREE.Group();
  const buildings = new THREE.Group();
  const farms = new THREE.Group();
  const animals = new THREE.Group();
  const trees = new THREE.Group();
  const fertileTiles = new Set<Tile>();
  const swampTiles = new Set<Tile>();
  const rockTiles = new Set<Tile>();
  const wetlands = new THREE.Group();
  scene.add(wetlands);
  scene.add(terrain, scenery, trees, farms, buildings, people, animals);
  // Distinct elevation colors, interpolated across each slope from its corner heights.
  const heightColors = [
    '#bca171', // 0: submerged sand
    '#d4b573', // 1: golden shore
    '#9bbd4b', // 2: bright lowland grass
    '#629d3e', // 3: green hills
    '#347c40', // 4: rich upland green
    '#205e46', // 5: deep forest green
    '#53675a', // 6: rocky highlands
    '#8c9080', // 7: exposed stone
    '#9fa99b', // 8: upper rock
    '#b2bbae', // 9: pale stone
    '#c4ccc0', // 10: alpine rock
    '#d5ddd0', // 11: frosted slopes
    '#e4eade', // 12: snow line
    '#eff3e8', // 13: snow
    '#fafbf5', // 14: high summit
  ].map((color) => new THREE.Color(color));
  const rockColors = Array.from({ length: TerrainSurface.MAX_HEIGHT + 1 }, (_, height) =>
    new THREE.Color('#454853').lerp(new THREE.Color('#aeb1b7'), height / TerrainSurface.MAX_HEIGHT),
  );
  const groundMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  });
  let ground: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  let contours: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null;
  const contourMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  let surface: TerrainSurface;
  let initialSurface: TerrainSurface;
  const tempColor = new THREE.Color();
  const treeTrunk = new THREE.MeshStandardMaterial({ color: '#796e48', roughness: 1 });
  const foliage = ['#3f7556', '#4e8057', '#64874f', '#5a8051'].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.075, 0.6, 5);
  const leafGeometry = new THREE.ConeGeometry(0.44, 1.2, 5);
  const rockGeometry = new THREE.IcosahedronGeometry(0.24, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#a6af94', roughness: 1 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#f0dfb7', roughness: 1 });
  const roofMaterials = ['#ad6548', '#bd7950', '#8b6650'].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
  const darkMaterial = new THREE.MeshStandardMaterial({ color: '#645c42', roughness: 1 });
  const pathMaterial = new THREE.MeshStandardMaterial({ color: '#b5ac79', roughness: 1 });
  const houseGeometry = new THREE.BoxGeometry(0.62, 0.48, 0.58);
  // A triangular prism roof, its ridge runs along the z axis.
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.4, 0);
  roofShape.lineTo(0, 0.37);
  roofShape.lineTo(0.4, 0);
  roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: 0.78, bevelEnabled: false });
  roofGeometry.translate(0, 0, -0.39);
  const doorGeometry = new THREE.BoxGeometry(0.13, 0.25, 0.02);
  const chimneyGeometry = new THREE.BoxGeometry(0.1, 0.32, 0.12);
  const pathGeometry = new THREE.PlaneGeometry(0.42, 0.92);
  function tileAt(x: number, z: number): Tile | undefined {
    if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return undefined;
    const index = z * SIZE + x;
    let tile = tileCache.get(index);
    if (!tile) {
      const height = surface.elevation(x, z);
      tile = {
        x,
        z,
        height,
        tree: initialSurface.elevation(x, z) > 2 && hash(x, z) > 0.97,
        house: false,
        swamp: false,
        rock: false,
      };
      tileCache.set(index, tile);
      tiles.push(tile);
    }
    return tile;
  }
  function position(tile: Tile): THREE.Vector3 {
    return new THREE.Vector3(
      tile.x - SIZE / 2 + 0.5,
      surface.sample(tile.x + 0.5, tile.z + 0.5),
      tile.z - SIZE / 2 + 0.5,
    );
  }
  function treeAnchor(tile: Tile): GridPoint {
    return {
      x: tile.x + 0.5 + (hash(tile.x + 71, tile.z) - 0.5) * 0.28,
      z: tile.z + 0.5 + (hash(tile.x + 83, tile.z) - 0.5) * 0.28,
    };
  }
  function hasTree(tile: Tile): boolean {
    if (!tile.tree) return false;
    const anchor = treeAnchor(tile);
    return tile.tree && surface.sample(anchor.x, anchor.z) > SEA;
  }
  function isWalkable(tile: Tile): boolean {
    return (
      surface.sample(tile.x + 0.5, tile.z + 0.5) > SEA &&
      !hasTree(tile) &&
      !tile.house &&
      !tile.reserved
    );
  }
  function neighbors(tile: Tile): Tile[] {
    const result: Tile[] = [];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = tileAt(tile.x + dx, tile.z + dz);
      if (
        next &&
        isWalkable(next) &&
        Math.abs(position(next).y - position(tile).y) <= STEP + 1e-6 &&
        surface.sample(tile.x + 0.5 + dx / 2, tile.z + 0.5 + dz / 2) > SEA
      )
        result.push(next);
    }
    return result;
  }
  function rebuildTrees(): void {
    for (const object of trees.children)
      if (object instanceof THREE.InstancedMesh) object.dispose();
    trees.clear();
    const wooded = visibleTiles.filter((tile) => !tile.house && !tile.reserved && hasTree(tile));
    if (!wooded.length) return;
    const trunks = new THREE.InstancedMesh(trunkGeometry, treeTrunk, wooded.length);
    const crowns = foliage.map((material, variant) => {
      const matching = wooded.filter(
        (tile) => Math.floor(hash(tile.x + 31, tile.z) * foliage.length) === variant,
      );
      return {
        matching,
        mesh: new THREE.InstancedMesh(leafGeometry, material, Math.max(1, matching.length * 2)),
      };
    });
    const dummy = new THREE.Object3D();
    function place(
      mesh: THREE.InstancedMesh,
      index: number,
      tile: Tile,
      offset: number,
      crownScale = 1,
    ): void {
      const anchor = treeAnchor(tile);
      const scale = 0.65 + hash(tile.x + 59, tile.z) * 0.35;
      dummy.position.set(
        anchor.x - SIZE / 2,
        surface.sample(anchor.x, anchor.z) + offset * scale,
        anchor.z - SIZE / 2,
      );
      dummy.rotation.set(0, hash(tile.x + 47, tile.z) * Math.PI, 0);
      dummy.scale.setScalar(scale * crownScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    wooded.forEach((tile, i) => place(trunks, i, tile, 0.27));
    trunks.castShadow = true;
    trees.add(trunks);
    for (const { matching, mesh } of crowns) {
      mesh.count = matching.length * 2;
      matching.forEach((tile, i) => {
        place(mesh, i * 2, tile, 0.95);
        place(mesh, i * 2 + 1, tile, 1.42, 0.77);
      });
      mesh.castShadow = true;
      trees.add(mesh);
    }
  }
  function addHouse(tile: Tile, power: HousePower): void {
    // Remove incidental rocks/paths when a settler claims this tile.
    for (const decoration of [...scenery.children]) {
      if (decoration.userData.tile !== tile) continue;
      scenery.remove(decoration);
      if (decoration instanceof THREE.Mesh && decoration.userData.ownedGeometry)
        decoration.geometry.dispose();
    }
    const group = new THREE.Group();
    const walls = new THREE.Mesh(houseGeometry, wallMaterial);
    walls.position.y = 0.24;
    const roof = new THREE.Mesh(
      roofGeometry,
      roofMaterials[Math.max(0, power - 1) % roofMaterials.length],
    );
    roof.position.y = 0.46;
    const door = new THREE.Mesh(doorGeometry, darkMaterial);
    door.position.set(0.08, 0.125, 0.3);
    const chimney = new THREE.Mesh(chimneyGeometry, wallMaterial);
    chimney.position.set(-0.2, 0.72, -0.15);
    group.add(walls, roof, door, chimney);
    group.position.copy(position(tile));
    const footprint = [-0.4, 0.4].flatMap((dx) =>
      [-0.4, 0.4].map((dz) => surface.sample(tile.x + 0.5 + dx, tile.z + 0.5 + dz)),
    );
    const floor = Math.max(tile.height * STEP, ...footprint) + 0.01;
    const foundationDepth = floor - Math.min(...footprint) + 0.04;
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, foundationDepth, 0.6),
      wallMaterial,
    );
    foundation.userData.ownedGeometry = true;
    foundation.position.y = -foundationDepth / 2;
    group.add(foundation);
    group.position.y = floor;
    group.scale.setScalar(0.8 + power * 0.08);
    group.rotation.y = (Math.floor(hash(tile.x, tile.z) * 4) * Math.PI) / 2;
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    buildings.add(group);
  }
  const castleBlockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const castleRoofGeometry = new THREE.ConeGeometry(1, 1, 4);
  const castleStone = new THREE.MeshStandardMaterial({ color: '#b6b9a4', roughness: 1 });
  const castleTrim = new THREE.MeshStandardMaterial({ color: '#8c9889', roughness: 1 });
  const castleRoof = new THREE.MeshStandardMaterial({ color: '#855443', roughness: 1 });
  const castleFlag = new THREE.MeshStandardMaterial({ color: '#c34e45', roughness: 1 });
  function addCastle(home: Tile): void {
    for (const decoration of [...scenery.children]) {
      const tile = decoration.userData.tile as Tile | undefined;
      if (!tile || Math.abs(tile.x - home.x) > 1 || Math.abs(tile.z - home.z) > 1) continue;
      scenery.remove(decoration);
      decoration.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData.ownedGeometry)
          object.geometry.dispose();
      });
    }
    const castle = new THREE.Group();
    const block = (
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
      material = castleStone,
    ): void => {
      const mesh = new THREE.Mesh(castleBlockGeometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      castle.add(mesh);
    };
    block(0, 0.04, 0, 2.96, 0.08, 2.96, castleTrim);
    block(0, 0.75, 0, 1.1, 1.45, 1.1);
    block(0, 0.3, 0.56, 0.23, 0.52, 0.025, darkMaterial);
    const roof = new THREE.Mesh(castleRoofGeometry, castleRoof);
    roof.position.y = 1.78;
    roof.scale.set(0.88, 0.62, 0.88);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    castle.add(roof);
    for (const side of [-1, 1]) {
      block(0, 0.37, side * 1.29, 2.6, 0.65, 0.16);
      block(side * 1.29, 0.37, 0, 0.16, 0.65, 2.6);
      for (let i = -2; i <= 2; i++) {
        block(i * 0.42, 0.79, side * 1.29, 0.22, 0.2, 0.2);
        block(side * 1.29, 0.79, i * 0.42, 0.2, 0.2, 0.22);
      }
      for (const other of [-1, 1]) {
        block(side * 1.24, 0.65, other * 1.24, 0.43, 1.22, 0.43);
        for (const dx of [-0.14, 0.14]) {
          for (const dz of [-0.14, 0.14])
            block(side * 1.24 + dx, 1.34, other * 1.24 + dz, 0.15, 0.2, 0.15);
        }
      }
    }
    block(0, 2.23, 0, 0.035, 0.75, 0.035, darkMaterial);
    block(0.2, 2.46, 0, 0.4, 0.23, 0.025, castleFlag);
    castle.position.copy(position(home));
    buildings.add(castle);
  }
  const farmCanvas = document.createElement('canvas');
  farmCanvas.width = farmCanvas.height = 128;
  const farmContext = farmCanvas.getContext('2d');
  if (!farmContext) throw new Error('Unable to create farming texture');
  farmContext.strokeStyle = '#000000';
  farmContext.lineWidth = 2;
  for (let line = 0; line <= 128; line += 32) {
    farmContext.beginPath();
    farmContext.moveTo(line, 0);
    farmContext.lineTo(line, 128);
    farmContext.moveTo(0, line);
    farmContext.lineTo(128, line);
    farmContext.stroke();
  }
  const farmTexture = new THREE.CanvasTexture(farmCanvas);
  farmTexture.colorSpace = THREE.SRGBColorSpace;
  farmTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const farmGeometry = new THREE.PlaneGeometry(0.96, 0.96);
  const farmMaterial = new THREE.MeshBasicMaterial({
    map: farmTexture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  function rebuildFarms(): void {
    farms.clear();
    fertileTiles.clear();
    for (const point of fertileLand(settlers, surface, tileAt)) {
      const tile = tileAt(point.x, point.z);
      if (!tile) continue;
      fertileTiles.add(tile);
      const field = new THREE.Mesh(farmGeometry, farmMaterial);
      field.rotation.x = -Math.PI / 2;
      field.position.copy(position(tile));
      // Castle courtyards have a shallow foundation above the underlying surface.
      field.position.y += tile.reserved ? 0.085 : 0.012;
      field.renderOrder = 2;
      farms.add(field);
    }
    // Refresh instance batches when farms or castles clear trees.
    rebuildTrees();
    syncFlock();
  }
  const swampTime = { value: 0 };
  const swampMaterial = createSwampMaterial();
  function createSwampMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: swampTime },
      transparent: true,
      depthWrite: false,
      vertexShader: `varying vec2 vWorld;
        void main() { vWorld = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, 0.018, 0.0), 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vWorld;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float moldNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash2(i),hash2(i+vec2(1.,0.)),f.x),mix(hash2(i+vec2(0.,1.)),hash2(i+vec2(1.,1.)),f.x),f.y); }
        void main() {
          vec2 drift=vec2(sin(uTime*.3),cos(uTime*.24))*.15;
          float patches=moldNoise(vWorld*3.5+drift);
          float specks=moldNoise(vWorld*22.0-drift);
          float mold=smoothstep(.22,.78,patches*.7+specks*.3);
          vec3 color=mix(vec3(.018,.065,.008),vec3(.29,.46,.055),mold);
          color*=.9+.1*sin(uTime*1.4+patches*10.0);
          gl_FragColor=vec4(color,.82);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }
  function rebuildSwamps(): void {
    wetlands.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    wetlands.clear();
    const tiles = visibleTiles.filter((tile) => tile.swamp);
    if (!tiles.length) return;
    const source = ground.geometry.getAttribute('position');
    const positions = new Float32Array(tiles.length * 18);
    tiles.forEach((tile, index) => {
      const start =
        ((tile.z - renderedBounds.z) * renderedBounds.width + tile.x - renderedBounds.x) * 6;
      for (let i = 0; i < 6; i++) {
        positions[(index * 6 + i) * 3] = source.getX(start + i);
        positions[(index * 6 + i) * 3 + 1] = source.getY(start + i);
        positions[(index * 6 + i) * 3 + 2] = source.getZ(start + i);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry, swampMaterial);
    mesh.renderOrder = 3;
    wetlands.add(mesh);
  }
  function rebuildBuildings(): void {
    buildings.traverse((object) => {
      if (object.userData.ownedGeometry && object instanceof THREE.Mesh) object.geometry.dispose();
    });
    buildings.clear();
    for (const settler of settlers) {
      if (!settler.home) continue;
      if (settler.power === 5) addCastle(settler.home);
      else addHouse(settler.home, settler.power);
    }
    rebuildFarms();
    rebuildSwamps();
  }
  function rebuild(): void {
    if (ground) {
      terrain.remove(ground);
      ground.geometry.dispose();
    }
    if (contours) {
      terrain.remove(contours);
      contours.geometry.dispose();
    }
    scenery.traverse((object) => {
      if (object.userData.ownedGeometry && object instanceof THREE.Mesh) object.geometry.dispose();
    });
    scenery.clear();
    visibleTiles = [];
    for (let z = renderedBounds.z; z < renderedBounds.z + renderedBounds.depth; z++) {
      for (let x = renderedBounds.x; x < renderedBounds.x + renderedBounds.width; x++) {
        const tile = tileAt(x, z);
        if (tile) {
          tile.height = surface.elevation(x, z);
          visibleTiles.push(tile);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(surface.positions(renderedBounds), 3),
    );
    const vertices = geometry.getAttribute('position');
    const colors = new Float32Array(visibleTiles.length * 6 * 3);
    ground = new THREE.Mesh(geometry, groundMaterial);
    ground.castShadow = true;
    ground.receiveShadow = true;
    for (let i = 0; i < visibleTiles.length; i++) {
      const tile = visibleTiles[i];
      for (let vertex = 0; vertex < 6; vertex++) {
        const index = i * 6 + vertex;
        const height = THREE.MathUtils.clamp(
          Math.round(vertices.getY(index) / STEP),
          0,
          heightColors.length - 1,
        );
        tempColor.copy((tile.rock ? rockColors : heightColors)[height]);
        // Shared corners have identical colors, so adjoining tiles blend without seams.
        tempColor.multiplyScalar(
          0.98 + hash(vertices.getX(index) + SIZE / 2, vertices.getZ(index) + SIZE / 2) * 0.04,
        );
        tempColor.toArray(colors, index * 3);
      }
      if (tile.house || tile.reserved) continue;
      if (!hasTree(tile) && tile.height > 1) {
        if (hash(tile.x + 60, tile.z) > 0.967) {
          const rock = new THREE.Mesh(rockGeometry, rockMaterial);
          rock.position.copy(position(tile));
          rock.position.y += 0.09;
          rock.scale.set(1, 0.7, 0.9);
          rock.rotation.y = hash(tile.x, tile.z) * 6;
          rock.castShadow = true;
          rock.userData.tile = tile;
          scenery.add(rock);
        } else if (tile.height === 2 && hash(tile.x + 90, tile.z) > 0.75) {
          const path = new THREE.Mesh(pathGeometry, pathMaterial);
          path.geometry = pathGeometry.clone();
          path.userData.ownedGeometry = true;
          path.userData.tile = tile;
          path.rotation.x = -Math.PI / 2;
          path.position.copy(position(tile));
          const vertices = path.geometry.getAttribute('position');
          for (let i = 0; i < vertices.count; i++) {
            const y = surface.sample(
              tile.x + 0.5 + vertices.getX(i),
              tile.z + 0.5 - vertices.getY(i),
            );
            vertices.setZ(i, y - path.position.y + 0.008);
          }
          path.geometry.computeVertexNormals();
          scenery.add(path);
        }
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    terrain.add(ground);
    const contourGeometry = new THREE.BufferGeometry();
    const contourPositions = elevationContours(vertices.array, STEP);
    contourGeometry.setAttribute('position', new THREE.BufferAttribute(contourPositions, 3));
    const contourColors = new Float32Array(contourPositions.length);
    for (let i = 0; i < contourPositions.length; i += 6) {
      const level = THREE.MathUtils.clamp(
        Math.round(contourPositions[i + 1] / STEP),
        0,
        heightColors.length - 1,
      );
      const tile = tileAt(
        Math.floor((contourPositions[i] + contourPositions[i + 3]) / 2 + SIZE / 2),
        Math.floor((contourPositions[i + 2] + contourPositions[i + 5]) / 2 + SIZE / 2),
      );
      tempColor.copy((tile?.rock ? rockColors : heightColors)[level]).multiplyScalar(0.85);
      tempColor.toArray(contourColors, i);
      tempColor.toArray(contourColors, i + 3);
    }
    contourGeometry.setAttribute('color', new THREE.BufferAttribute(contourColors, 3));
    contours = new THREE.LineSegments(contourGeometry, contourMaterial);
    contours.position.y = 0.012; // Keep the lines above their surface without z-fighting.
    contours.renderOrder = 1;
    terrain.add(contours);
    rebuildBuildings();
  }

  function createWater() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 3, SIZE * 3),
      new THREE.MeshStandardMaterial({ color: '#659e95', roughness: 1, metalness: 0 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = SEA;
    water.receiveShadow = true;
    scene.add(water);
    const wavePositions: number[] = [];
    for (let i = 0; i < 900; i++) {
      const x = random() * 110 - 55;
      const z = random() * 110 - 55;
      const length = 0.12 + random() * 0.6;
      wavePositions.push(x, SEA + 0.015, z, x + length, SEA + 0.015, z);
    }
    const waveGeometry = new THREE.BufferGeometry();
    waveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wavePositions, 3));
    const waveMaterial = new THREE.LineBasicMaterial({
      color: '#e3eed6',
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const waves = new THREE.LineSegments(waveGeometry, waveMaterial);
    scene.add(waves);
    return { water, waves, waveMaterial };
  }
  const { water, waves, waveMaterial } = createWater();

  const settlers: Settler[] = [];
  const leadership = new Leadership<Tile, Settler>();
  let navigationRevision = 0;
  let rallyRevision = -1;
  let rallyDestination: Tile | null = null;
  let rallyDistance = new Map<Tile, number>();
  const leaderObject = createLeaderObject();
  function createLeaderObject(): THREE.Group {
    const group = new THREE.Group();
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, 0.8, 6),
      new THREE.MeshStandardMaterial({ color: '#776b49', roughness: 1 }),
    );
    staff.position.y = 0.42;
    const whiteObject = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffffff',
        emissiveIntensity: 0.2,
        roughness: 0.7,
      }),
    );
    whiteObject.position.y = 0.98;
    staff.castShadow = true;
    whiteObject.castShadow = true;
    group.add(staff, whiteObject);
    group.visible = false;
    scene.add(group);
    return group;
  }
  function characterTile(settler: Settler): Tile {
    return (
      settler.home ??
      tileAt(
        Math.floor(settler.mesh.position.x + SIZE / 2),
        Math.floor(settler.mesh.position.z + SIZE / 2),
      ) ??
      settler.tile
    );
  }
  function updateLeadershipVisual(): void {
    const owner = leadership.leader;
    if (owner) {
      if (owner.home) {
        if (leaderObject.parent !== scene) scene.add(leaderObject);
        leaderObject.position.copy(position(owner.home));
        leaderObject.position.y += owner.power === 5 ? 2.15 : 0.55 + owner.power * 0.05;
      } else {
        if (leaderObject.parent !== owner.mesh) owner.mesh.add(leaderObject);
        leaderObject.position.set(0.17, 0, 0.02);
      }
      leaderObject.visible = true;
    } else if (leadership.droppedTile) {
      if (leaderObject.parent !== scene) scene.add(leaderObject);
      leaderObject.position.copy(position(leadership.droppedTile));
      leaderObject.position.y = Math.max(SEA, leaderObject.position.y) + 0.02;
      leaderObject.visible = true;
    } else leaderObject.visible = false;
  }
  function updateRallyButton(): void {
    const button = element<HTMLButtonElement>('#rally');
    const label = leadership.rallying ? 'Stop gathering' : 'Gather followers';
    if (element('#rally-label').textContent !== label) element('#rally-label').textContent = label;
    button.classList.toggle('active', leadership.rallying);
    button.setAttribute('aria-pressed', String(leadership.rallying));
    button.title = `${leadership.leader ? `Leader HP ${leadership.leader.characterPower.toFixed(1)}` : 'Leader object awaiting pickup'} · ${leadership.rallying ? 'Click to resume wandering and building' : 'Residents leave homes and merge their HP/power into the leader'}`;
  }
  function encounterLeader(settler: Settler): boolean {
    if (settler.home || settler.survival.phase !== 'alive') return false;
    const owner = leadership.leader;
    if (owner && owner.survival.phase !== 'alive') return false;
    const result = leadership.encounter(
      settler,
      characterTile(settler),
      owner ? characterTile(owner) : null,
    );
    if (result === 'none') return false;
    if (result === 'absorbed') {
      settler.survival.phase = 'dead';
      settler.target = null;
      settler.mesh.visible = false;
    } else rallyDestination = null;
    return true;
  }
  function resolveLeadership(): boolean {
    let changed = false;
    const owner = leadership.leader;
    if (owner && (owner.survival.phase === 'sinking' || owner.survival.phase === 'dead')) {
      leadership.drop(owner, characterTile(owner));
      rallyDestination = null;
      changed = true;
    }
    for (const settler of settlers) if (encounterLeader(settler)) changed = true;
    return changed;
  }
  function followerOptions(settler: Settler): Tile[] {
    const goal = leadership.leader ? characterTile(leadership.leader) : leadership.droppedTile;
    if (!goal) return [];
    if (goal !== rallyDestination || rallyRevision !== navigationRevision) {
      rallyDestination = goal;
      rallyRevision = navigationRevision;
      rallyDistance = buildRallyField(isWalkable(goal) ? [goal] : neighbors(goal), neighbors);
    }
    return rallySteps(settler.tile, neighbors(settler.tile), rallyDistance);
  }
  function toggleRally(): void {
    if (!leadership.leader && !leadership.droppedTile) {
      toast('There is no leader object to gather around.');
      return;
    }
    leadership.rallying = !leadership.rallying;
    navigationRevision++;
    rallyDestination = null;
    if (leadership.rallying) {
      evacuateSettlements(settlers, tileAt);
      reconcileWorldSettlements();
      rebuildBuildings();
      syncResidentMeshes();
    }
    for (const settler of settlers) {
      if (settler === leadership.leader || settler.home || settler.survival.phase !== 'alive')
        continue;
      settler.tile = characterTile(settler);
      settler.target = null;
      settler.progress = 0;
      settler.wait = 0;
    }
    updateSettlementStats();
    updateLeadershipVisual();
    if (lastPointer) updateHover(lastPointer);
  }
  const flock: Sheep[] = [];
  const sheepSpawner = new SheepSpawner();
  const woolMaterial = new THREE.MeshStandardMaterial({ color: '#f3efda', roughness: 1 });
  const sheepFaceMaterial = new THREE.MeshStandardMaterial({ color: '#635e50', roughness: 1 });
  const woolGeometry = new THREE.IcosahedronGeometry(0.19, 1);
  const sheepHeadGeometry = new THREE.BoxGeometry(0.12, 0.13, 0.15);
  const sheepEarGeometry = new THREE.BoxGeometry(0.065, 0.035, 0.06);
  const sheepLegGeometry = new THREE.CylinderGeometry(0.022, 0.025, 0.13, 4);
  function canGraze(tile: Tile): boolean {
    return fertileTiles.has(tile) && !tile.house && !tile.reserved;
  }
  function createSheep(tile: Tile): void {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(woolGeometry, woolMaterial);
    body.scale.set(1.05, 0.9, 1.4);
    body.position.y = 0.24;
    const head = new THREE.Mesh(sheepHeadGeometry, sheepFaceMaterial);
    head.position.set(0, 0.27, 0.27);
    mesh.add(body, head);
    const legs: THREE.Mesh[] = [];
    for (const x of [-1, 1]) {
      const ear = new THREE.Mesh(sheepEarGeometry, sheepFaceMaterial);
      ear.position.set(x * 0.085, 0.31, 0.26);
      mesh.add(ear);
      for (const z of [-1, 1]) {
        const leg = new THREE.Mesh(sheepLegGeometry, sheepFaceMaterial);
        leg.position.set(x * 0.09, 0.075, z * 0.14);
        legs.push(leg);
        mesh.add(leg);
      }
    }
    mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    mesh.position.copy(position(tile));
    mesh.scale.setScalar(1.1);
    mesh.rotation.y = random() * Math.PI * 2;
    animals.add(mesh);
    flock.push({
      mesh,
      tile,
      target: null,
      progress: 0,
      wait: 1 + random() * 3,
      phase: random() * 6,
      legs,
    });
  }
  function syncFlock(): void {
    const valid = flock.filter((sheep) => {
      const current = tileAt(
        Math.floor(sheep.mesh.position.x + SIZE / 2),
        Math.floor(sheep.mesh.position.z + SIZE / 2),
      );
      if (!current || !canGraze(current)) return false;
      if (!canGraze(sheep.tile) || (sheep.target && !canGraze(sheep.target))) {
        sheep.tile = current;
        sheep.target = null;
        sheep.progress = 0;
        sheep.wait = 1;
        sheep.mesh.position.copy(position(current));
      }
      sheep.mesh.position.y = surface.sample(
        sheep.mesh.position.x + SIZE / 2,
        sheep.mesh.position.z + SIZE / 2,
      );
      return true;
    });
    const plan = planFlock(
      valid,
      fertileTiles,
      settlers.filter((settler) => settler.home).length,
      canGraze,
    );
    const keep = new Set(plan.keep);
    for (const sheep of flock) if (!keep.has(sheep)) animals.remove(sheep.mesh);
    flock.length = 0;
    flock.push(...plan.keep);
  }
  function spawnSheep(dt: number): void {
    const plan = planFlock(
      flock,
      fertileTiles,
      settlers.filter((settler) => settler.home).length,
      canGraze,
    );
    if (!sheepSpawner.advance(dt, plan.spawn.length > 0, random)) return;
    createSheep(plan.spawn[Math.floor(random() * plan.spawn.length)]);
    updateSettlementStats();
    if (lastPointer) updateHover(lastPointer);
  }
  function animateSheep(dt: number): void {
    if (!dt) return;
    for (const sheep of flock) {
      if (!sheep.target) {
        sheep.wait -= dt;
        if (sheep.wait > 0) continue;
        const options = grazingNeighbors(sheep.tile, fertileTiles, tileAt, canGraze);
        if (!options.length) {
          sheep.wait = 1;
          continue;
        }
        sheep.target = options[Math.floor(random() * options.length)];
        sheep.progress = 0;
        sheep.mesh.rotation.y = Math.atan2(
          sheep.target.x - sheep.tile.x,
          sheep.target.z - sheep.tile.z,
        );
      }
      sheep.progress = Math.min(1, sheep.progress + dt * 0.45);
      sheep.mesh.position.lerpVectors(position(sheep.tile), position(sheep.target), sheep.progress);
      sheep.mesh.position.y += Math.abs(Math.sin(simulationTime * 9 + sheep.phase)) * 0.012;
      sheep.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(simulationTime * 9 + sheep.phase) * (i % 3 === 0 ? 0.35 : -0.35);
      });
      if (sheep.progress >= 1) {
        sheep.tile = sheep.target;
        sheep.target = null;
        sheep.wait = 0.8 + random() * 2.5;
        sheep.legs.forEach((leg) => {
          leg.rotation.x = 0;
        });
      }
    }
  }
  const skinMaterial = new THREE.MeshStandardMaterial({ color: '#e3bb8b', roughness: 1 });
  const hairMaterial = new THREE.MeshStandardMaterial({ color: '#685139', roughness: 1 });
  const trouserMaterial = new THREE.MeshStandardMaterial({ color: '#54665a', roughness: 1 });
  const shirtMaterial = new THREE.MeshStandardMaterial({
    color: populationShirtColor('red'),
    roughness: 1,
  });
  const bodyGeometry = new THREE.BoxGeometry(0.17, 0.21, 0.12);
  const headGeometry = new THREE.BoxGeometry(0.135, 0.14, 0.13);
  const hairGeometry = new THREE.BoxGeometry(0.145, 0.055, 0.14);
  const limbGeometry = new THREE.BoxGeometry(0.055, 0.16, 0.065);
  function createSettler(tile: Tile, characterPower = INITIAL_CHARACTER_POWER): Settler {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, shirtMaterial);
    body.position.y = 0.25;
    const head = new THREE.Mesh(headGeometry, skinMaterial.clone());
    head.position.y = 0.425;
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.set(0, 0.49, -0.01);
    const legs: THREE.Mesh[] = [];
    for (const sign of [-1, 1]) {
      const leg = new THREE.Mesh(limbGeometry, trouserMaterial);
      leg.position.set(sign * 0.05, 0.085, 0);
      const arm = new THREE.Mesh(limbGeometry, skinMaterial);
      arm.position.set(sign * 0.115, 0.25, 0);
      legs.push(leg, arm);
      mesh.add(leg, arm);
    }
    mesh.add(body, head, hair);
    mesh.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    mesh.position.copy(position(tile));
    mesh.scale.setScalar(1.15);
    people.add(mesh);
    const settler: Settler = {
      mesh,
      tile,
      survival: createSurvival(),
      sick: false,
      head,
      home: null,
      power: 0,
      homeLevel: null,
      characterPower,
      target: null,
      progress: 0,
      wait: random() * 3,
      phase: random() * 6,
      legs,
    };
    settlers.push(settler);
    return settler;
  }
  function clearSettlers(): void {
    leadership.reset();
    leaderObject.visible = false;
    rallyDistance.clear();
    rallyDestination = null;
    rallyRevision = -1;
    navigationRevision = 0;
    for (const settler of settlers) settler.head.material.dispose();
    people.clear();
    settlers.length = 0;
  }
  function spawnSettlers(): void {
    clearSettlers();
    const walkable = visibleTiles.filter(
      (t) =>
        Math.hypot(t.x - SIZE / 2, t.z - SIZE / 2) < 14 &&
        t.height > 1 &&
        isWalkable(t) &&
        neighbors(t).length > 0,
    );
    for (let i = 0; i < Math.min(24, walkable.length); i++)
      createSettler(walkable[Math.floor(random() * walkable.length)]);
    if (settlers[0]) leadership.appoint(settlers[0]);
    updateSettlementStats();
  }
  function findBirthTile(home: Tile): Tile | null {
    const queue = [home];
    const visited = new Set(queue);
    for (let head = 0; head < queue.length; head++) {
      const tile = queue[head];
      if (!tile.swamp && isWalkable(tile) && neighbors(tile).length > 0) return tile;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = tileAt(tile.x + dx, tile.z + dz);
        if (!next || visited.has(next)) continue;
        visited.add(next);
        const ownCastle =
          home.reserved && Math.abs(next.x - home.x) <= 1 && Math.abs(next.z - home.z) <= 1;
        if (
          next.house ||
          (next.reserved && !ownCastle) ||
          hasTree(next) ||
          position(next).y <= SEA ||
          Math.abs(position(next).y - position(tile).y) > STEP + 1e-6 ||
          surface.sample(tile.x + 0.5 + dx / 2, tile.z + 0.5 + dz / 2) <= SEA
        )
          continue;
        queue.push(next);
      }
    }
    return null;
  }
  function updatePowerDisplay(): void {
    element('#power').textContent = powerMeter.value.toLocaleString();
    document.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((button) => {
      const spell = button.dataset.spell as Spell;
      const affordable = powerMeter.value >= SPELL_COSTS[spell];
      button.classList.toggle('affordable', affordable);
      button.classList.toggle('selected', selectedSpell === spell);
      button.setAttribute('aria-pressed', String(selectedSpell === spell));
      button.setAttribute('aria-disabled', String(!affordable));
    });
  }
  function updateSettlementStats(): void {
    const living = settlers.filter(
      (settler) => settler.survival.phase === 'alive' || settler.survival.phase === 'drowning',
    );
    const housed = living.filter((settler) => settler.home !== null).length;
    const drowning = living.filter((settler) => settler.survival.phase === 'drowning').length;
    const roaming = living.length - housed - drowning;
    const sick = living.filter((settler) => settler.sick).length;
    element('#population').innerHTML = `${living.length} <small>settlers</small>`;
    const castles = settlers.filter((settler) => settler.power === 5).length;
    element('#population').title =
      `${roaming} roaming · ${housed} at home${drowning ? ` · ${drowning} drowning` : ''}${castles ? ` · ${castles} castle${castles > 1 ? 's' : ''}` : ''}${sick ? ` · ${sick} sick` : ''} · ${flock.length} sheep`;
    element('#population').title += leadership.leader
      ? ` · Leader HP ${leadership.leader.characterPower.toFixed(1)}`
      : leadership.droppedTile
        ? ' · Leader object dropped'
        : '';
    updateRallyButton();
    element('#power').title =
      `+${totalBuildingPower(settlers, 'normal')} power / ${powerMeter.interval}s${totalBuildingPower(settlers, 'rock') ? ` · +${totalBuildingPower(settlers, 'rock')} rock power / ${powerMeter.interval * 2}s` : ''} · Terrain costs 1 power per affected point`;
  }
  function resetWalkingPose(settler: Settler): void {
    settler.legs.forEach((limb, i) => {
      limb.rotation.set(0, 0, 0);
      if (i % 2 === 1) limb.position.y = 0.25;
    });
  }
  function anchorDrowningSettler(settler: Settler): void {
    settler.tile =
      tileAt(
        Math.floor(settler.mesh.position.x + SIZE / 2),
        Math.floor(settler.mesh.position.z + SIZE / 2),
      ) ?? settler.tile;
    settler.target = null;
    settler.progress = 0;
    settler.wait = 0;
  }
  function renderSurvival(settler: Settler): void {
    const state = settler.survival;
    settler.mesh.visible = state.phase !== 'dead';
    if (state.phase === 'drowning') {
      settler.mesh.position.y = SEA - 0.18 + Math.sin(simulationTime * 7 + settler.phase) * 0.015;
      settler.legs.forEach((limb, i) => {
        if (i % 2 === 1) {
          limb.position.y = 0.38;
          limb.rotation.z =
            (i === 1 ? -1 : 1) * (2.4 + Math.sin(simulationTime * 12 + settler.phase) * 0.5);
          limb.rotation.x = Math.sin(simulationTime * 10 + i) * 0.8;
        }
      });
    } else {
      resetWalkingPose(settler);
      settler.mesh.position.y = SEA - 0.18 - (state.elapsed / SINKING_SECONDS) * 0.9;
    }
  }
  function updateSickness(settler: Settler, seconds: number): boolean {
    const tile =
      settler.home ??
      tileAt(
        Math.floor(settler.mesh.position.x + SIZE / 2),
        Math.floor(settler.mesh.position.z + SIZE / 2),
      );
    const died = advanceSickness(settler, seconds, Boolean(tile?.swamp));
    settler.head.material.color.set(settler.sick ? '#a3b86b' : '#e3bb8b');
    return died;
  }
  function syncResidentMeshes(affected: ReadonlySet<Tile | undefined> = new Set()): void {
    for (const settler of settlers) {
      if (settler.survival.phase === 'sinking' || settler.survival.phase === 'dead') continue;
      if (settler.home) {
        settler.mesh.visible = false;
        settler.target = null;
        continue;
      }
      if (!settler.mesh.visible) settler.mesh.position.copy(position(settler.tile));
      updateSickness(settler, 0);
      const previous = settler.survival.phase;
      const ground = surface.sample(
        settler.mesh.position.x + SIZE / 2,
        settler.mesh.position.z + SIZE / 2,
      );
      advanceSurvival(settler.survival, 0, ground <= SEA);
      if (settler.survival.phase === 'drowning') {
        anchorDrowningSettler(settler);
        renderSurvival(settler);
        continue;
      }
      if (previous === 'drowning') {
        resetWalkingPose(settler);
        settler.wait = 0;
      }
      if (
        !settler.mesh.visible ||
        affected.has(settler.tile) ||
        (settler.target && (!isWalkable(settler.target) || affected.has(settler.target)))
      ) {
        settler.target = null;
        settler.progress = 0;
        settler.wait = 0;
        // Stay at the actual position: snapping to a former tile center can move a flooded walker.
        settler.tile =
          tileAt(
            Math.floor(settler.mesh.position.x + SIZE / 2),
            Math.floor(settler.mesh.position.z + SIZE / 2),
          ) ?? settler.tile;
      }
      if (
        !isWalkable(settler.tile) &&
        ground > SEA &&
        (settler.tile.house || settler.tile.reserved || hasTree(settler.tile))
      ) {
        const dry = tiles.filter(isWalkable);
        dry.sort(
          (a, b) =>
            (a.x - settler.tile.x) ** 2 +
            (a.z - settler.tile.z) ** 2 -
            (b.x - settler.tile.x) ** 2 -
            (b.z - settler.tile.z) ** 2,
        );
        if (dry[0]) {
          settler.tile = dry[0];
          settler.mesh.position.copy(position(settler.tile));
        }
      }
      settler.mesh.visible = true;
      settler.mesh.position.y = surface.sample(
        settler.mesh.position.x + SIZE / 2,
        settler.mesh.position.z + SIZE / 2,
      );
    }
  }
  function cameraTerrainBounds(): TerrainBounds {
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersections: THREE.Vector3[] = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (hit) intersections.push(hit);
      }
    }
    if (!intersections.length) intersections.push(controls.target.clone());
    const direction = camera.position.clone().sub(controls.target);
    const padding =
      Math.ceil(
        (TerrainSurface.MAX_HEIGHT * STEP * Math.hypot(direction.x, direction.z)) /
          Math.max(0.1, Math.abs(direction.y)),
      ) + 2;
    const x = THREE.MathUtils.clamp(
      Math.floor((Math.min(...intersections.map((p) => p.x)) + SIZE / 2) / 16) * 16 - padding,
      0,
      SIZE - 1,
    );
    const z = THREE.MathUtils.clamp(
      Math.floor((Math.min(...intersections.map((p) => p.z)) + SIZE / 2) / 16) * 16 - padding,
      0,
      SIZE - 1,
    );
    const right = THREE.MathUtils.clamp(
      Math.ceil((Math.max(...intersections.map((p) => p.x)) + SIZE / 2) / 16) * 16 + padding,
      x + 1,
      SIZE,
    );
    const bottom = THREE.MathUtils.clamp(
      Math.ceil((Math.max(...intersections.map((p) => p.z)) + SIZE / 2) / 16) * 16 + padding,
      z + 1,
      SIZE,
    );
    return { x, z, width: right - x, depth: bottom - z };
  }
  function updateVisibleTerrain(): boolean {
    const next = cameraTerrainBounds();
    if (
      next.x === renderedBounds.x &&
      next.z === renderedBounds.z &&
      next.width === renderedBounds.width &&
      next.depth === renderedBounds.depth
    )
      return false;
    renderedBounds = next;
    rebuild();
    return true;
  }
  function reconcileWorldSettlements(): void {
    if (reconcileSettlements(settlers, tiles, surface, tileAt)) navigationRevision++;
  }
  function generateWorld(): void {
    powerMeter.reset();
    updatePowerDisplay();
    randomState = seed;
    clearSettlers();
    swampTiles.clear();
    rockTiles.clear();
    animals.clear();
    flock.length = 0;
    sheepSpawner.reset();
    tiles.length = 0;
    tileCache.clear();
    cornerLevels.set(generateWorldHeights(SIZE, seed));
    surface = new TerrainSurface(SIZE, cornerLevels, STEP);
    initialSurface = new TerrainSurface(SIZE, cornerLevels.slice(), STEP);
    renderedBounds = cameraTerrainBounds();
    rebuild();
    spawnSettlers();
  }
  // Normal selection highlights a corner; Shift highlights the entire tile surface.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext('2d');
  if (!glowContext) throw new Error('Unable to create corner glow texture');
  const gradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(235, 48, 60, 0.9)');
  gradient.addColorStop(0.3, 'rgba(190, 25, 40, 0.5)');
  gradient.addColorStop(1, 'rgba(160, 15, 30, 0)');
  glowContext.fillStyle = gradient;
  glowContext.fillRect(0, 0, 128, 128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const cornerGlowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  const cornerGlow = new THREE.Sprite(cornerGlowMaterial);
  cornerGlow.scale.setScalar(0.65);
  cornerGlow.renderOrder = 10;
  const cornerMaterial = new THREE.MeshBasicMaterial({
    color: '#d92c3c',
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });
  const cornerPoint = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), cornerMaterial);
  cornerPoint.renderOrder = 11;
  const cornerMarker = new THREE.Group();
  cornerMarker.add(cornerGlow, cornerPoint);
  cornerMarker.visible = false;
  scene.add(cornerMarker);
  const surfaceHighlightGeometry = new THREE.BufferGeometry();
  surfaceHighlightGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(18), 3),
  );
  const surfaceHighlightMaterial = new THREE.MeshStandardMaterial({
    color: '#8c1e28',
    emissive: '#b32432',
    emissiveIntensity: 0.65,
    roughness: 1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const surfaceHighlight = new THREE.Mesh(surfaceHighlightGeometry, surfaceHighlightMaterial);
  surfaceHighlight.visible = false;
  surfaceHighlight.renderOrder = 5;
  scene.add(surfaceHighlight);
  let shiftHeld = false;
  let lastPointer: Pick<PointerEvent, 'clientX' | 'clientY'> | null = null;
  let glowingSurface: Tile | null = null;
  let surfaceStrength = 0;
  let surfaceTarget = 0;
  let hoveredCorner: GridPoint | null = null;
  let glowingCorner: GridPoint | null = null;
  let hoverStrength = 0;
  let hoverTarget = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: Tile | null = null;
  let tool: Tool = 'raise';
  let pointerDown = { x: 0, y: 0 };
  let toastTimer: ReturnType<typeof setTimeout>;
  function toast(message: string): void {
    const node = element('#toast');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 2800);
  }
  function updateHover(event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([ground, water])[0];
    hovered =
      hit?.object === ground && hit.faceIndex != null
        ? visibleTiles[Math.floor(hit.faceIndex / 2)]
        : hit
          ? (tileAt(Math.floor(hit.point.x + SIZE / 2), Math.floor(hit.point.z + SIZE / 2)) ?? null)
          : null;
    hoveredCorner =
      hovered && hit ? surface.nearestCorner(hit.point.x + SIZE / 2, hit.point.z + SIZE / 2) : null;
    const surfaceSelection = shiftHeld || selectedSpell !== null;
    hoverTarget = !surfaceSelection && hoveredCorner ? 1 : 0;
    surfaceTarget = surfaceSelection && hovered ? 1 : 0;
    if (surfaceSelection) {
      cornerMarker.visible = false;
      hoverStrength = 0;
      if (hovered) {
        if (glowingSurface !== hovered) {
          surfaceStrength = 0;
          surfaceHighlightMaterial.opacity = 0;
          glowingSurface = hovered;
        }
        surfaceHighlight.visible = true;
        const source = ground.geometry.getAttribute('position');
        const target = surfaceHighlightGeometry.getAttribute('position');
        for (let i = 0; i < target.count; i++) {
          const vertex =
            ((hovered.z - renderedBounds.z) * renderedBounds.width + hovered.x - renderedBounds.x) *
              6 +
            i;
          target.setXYZ(
            i,
            source.getX(vertex),
            Math.max(SEA + 0.015, source.getY(vertex)),
            source.getZ(vertex),
          );
        }
        target.needsUpdate = true;
        surfaceHighlightGeometry.computeVertexNormals();
        surfaceHighlightGeometry.computeBoundingSphere();
      }
    } else {
      surfaceHighlight.visible = false;
      surfaceStrength = 0;
      glowingSurface = null;
    }
    if (!surfaceSelection && hoveredCorner) {
      if (
        !glowingCorner ||
        glowingCorner.x !== hoveredCorner.x ||
        glowingCorner.z !== hoveredCorner.z
      ) {
        hoverStrength = 0;
        cornerMaterial.opacity = 0;
        cornerGlowMaterial.opacity = 0;
        glowingCorner = { ...hoveredCorner };
      }
      cornerMarker.visible = true;
      cornerMarker.position.set(
        hoveredCorner.x - SIZE / 2,
        Math.max(SEA, surface.corner(hoveredCorner.x, hoveredCorner.z)) + 0.035,
        hoveredCorner.z - SIZE / 2,
      );
    }
    const info = element('#tile-info');
    info.hidden = selectedSpell !== null || tool !== 'inspect' || !hovered;
    if (!selectedSpell && hovered && tool === 'inspect') {
      const kind = hovered.swamp
        ? 'Swamp · Infectious ground'
        : hovered.rock
          ? 'Volcanic rock · Half-speed buildings'
          : hovered.height === 0
            ? 'Open water'
            : hovered.reserved
              ? 'Castle grounds'
              : hovered.house
                ? 'A settler’s cottage'
                : hasTree(hovered)
                  ? 'Woodland'
                  : fertileTiles.has(hovered)
                    ? 'Fertile farmland'
                    : hovered.height === 1
                      ? 'Sandy shore'
                      : 'Grassy highlands';
      const walkers = settlers.filter(
        (s) =>
          s.tile === hovered &&
          !s.home &&
          (s.survival.phase === 'alive' || s.survival.phase === 'drowning'),
      );
      const drowning = walkers.some((s) => s.survival.phase === 'drowning');
      const sheepHere = flock.filter((sheep) => sheep.tile === hovered).length;
      const leaderHere = leadership.leader && characterTile(leadership.leader) === hovered;
      const objectHere = leadership.droppedTile === hovered;
      const visitors = walkers.length;
      const walkerPower = walkers
        .reduce((sum, walker) => sum + walker.characterPower, 0)
        .toFixed(1);
      const inspected = hovered;
      const resident = settlers.find(
        (s) =>
          s.home === inspected ||
          (s.power === 5 &&
            s.home &&
            Math.abs(s.home.x - inspected.x) <= 1 &&
            Math.abs(s.home.z - inspected.z) <= 1),
      );
      const buildingInfo = resident?.home
        ? `${resident.power === 5 ? 'Castle' : 'House'} · Level ${resident.power} · ${homeSupport(surface, resident.home, tileAt).count}/9 flat tiles<br>Resident HP ${resident.characterPower.toFixed(1)}${resident.sick ? ' · Sick (-1 HP/s)' : ''} · Growth +${characterGrowthRate(resident.power, Boolean(resident.home.rock)).toFixed(3)}/s<br>Birth cycle ~${birthInterval(resident.power, Boolean(resident.home.rock))}s · Threshold ${BIRTH_THRESHOLD}`
        : '';
      const cornerInfo = shiftHeld
        ? 'Surface selected · All four corners'
        : hoveredCorner
          ? `Corner ${hoveredCorner.x}, ${hoveredCorner.z} · Height ${surface.level(hoveredCorner.x, hoveredCorner.z)}`
          : '';
      info.innerHTML = `<strong>${kind}</strong>${cornerInfo}<br>Tile ${hovered.x}, ${hovered.z} · Corners ${surface.level(hovered.x, hovered.z)}, ${surface.level(hovered.x + 1, hovered.z)}, ${surface.level(hovered.x + 1, hovered.z + 1)}, ${surface.level(hovered.x, hovered.z + 1)}<br>${resident ? `${buildingInfo}<br>1 settler lives here.` : drowning ? 'Drowning — raise the land beneath them to rescue!' : visitors ? `${visitors} settler${visitors > 1 ? 's' : ''} here · HP ${walkerPower}${walkers.some((walker) => walker.sick) ? ' · Sick (-1 HP/s)' : ''}` : 'Select a corner to shape the land.'}${sheepHere ? `<br>${sheepHere} sheep grazing here` : ''}${leaderHere ? `<br>Leader · HP/power ${leadership.leader?.characterPower.toFixed(1)}` : objectHere ? '<br>White leader object · Walk here to pick it up' : ''}`;
    }
    canvas.style.cursor = hovered
      ? tool === 'inspect' && !selectedSpell
        ? 'help'
        : 'crosshair'
      : 'grab';
  }
  function setShift(held: boolean): void {
    if (shiftHeld === held) return;
    shiftHeld = held;
    selectTool(tool);
    if (lastPointer) updateHover(lastPointer);
  }
  function bindTerrainInput(): void {
    canvas.addEventListener('pointermove', (event) => {
      setShift(event.shiftKey);
      updateHover(event);
    });
    canvas.addEventListener('pointerleave', () => {
      hoverTarget = 0;
      surfaceTarget = 0;
      hovered = null;
      hoveredCorner = null;
      lastPointer = null;
      element('#tile-info').hidden = true;
    });
    canvas.addEventListener('pointerdown', (event) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      if (
        (event.button !== 0 && event.button !== 2) ||
        Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5
      )
        return;
      setShift(event.shiftKey);
      updateHover(event);
      if (selectedSpell) {
        if (event.button === 2) cancelSpell();
        else if (hovered) castSpell(selectedSpell, hovered);
        return;
      }
      if (!hovered || !hoveredCorner) return;
      // Mouse buttons directly choose elevation; touch keeps the selected toolbar tool.
      const action = event.pointerType === 'touch' ? tool : event.button === 2 ? 'lower' : 'raise';
      if (action === 'inspect') return;
      selectTool(action);
      const delta = action === 'raise' ? 1 : -1;
      const selection = shiftHeld ? hovered : hoveredCorner;
      const result = surface.terraform(selection.x, selection.z, delta, shiftHeld, powerMeter);
      if (result.status === 'insufficient') {
        toast(
          `Not enough power. This edit needs ${result.cost} power, including neighboring points.`,
        );
        return;
      }
      if (result.status === 'limit') {
        toast(
          shiftHeld
            ? `All four corners must stay between sea level and height ${TerrainSurface.MAX_HEIGHT}.`
            : action === 'raise'
              ? 'This corner is as close to the sky as it can go.'
              : 'This corner is already at sea level.',
        );
        return;
      }
      refreshTerrainAfterEdit();
      updateHover(event);
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  function refreshTerrainAfterEdit(): void {
    navigationRevision++;
    clearSubmergedSwamps(surface, swampTiles);
    clearSubmergedRock(surface, rockTiles);
    const affected = new Set<Tile>();
    // A world-wide edit need not materialize tile objects in unvisited regions.
    for (const point of surface.changedPoints) {
      for (const z of [point.z - 1, point.z]) {
        for (const x of [point.x - 1, point.x]) {
          if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) continue;
          const tile = tileCache.get(z * SIZE + x);
          if (tile) affected.add(tile);
        }
      }
    }
    for (const tile of affected) if (tile) tile.height = surface.elevation(tile.x, tile.z);
    reconcileWorldSettlements();
    rebuild();
    syncResidentMeshes(affected);
    updateSettlementStats();
    updatePowerDisplay();
    if (lastPointer) updateHover(lastPointer);
  }
  let shakeTimer: ReturnType<typeof setTimeout>;
  function cancelSpell(): void {
    selectedSpell = null;
    updatePowerDisplay();
    selectTool(tool);
    if (lastPointer) updateHover(lastPointer);
  }
  function selectSpell(spell: Spell): void {
    if (selectedSpell === spell) {
      cancelSpell();
      return;
    }
    if (powerMeter.value < SPELL_COSTS[spell]) {
      toast(`${SPELL_NAMES[spell]} needs ${SPELL_COSTS[spell].toLocaleString()} power.`);
      return;
    }
    if (spell === 'flood') {
      cancelSpell();
      castSpell(spell);
      return;
    }
    selectedSpell = spell;
    updatePowerDisplay();
    selectTool(tool);
    if (lastPointer) updateHover(lastPointer);
  }
  function castSpell(spell: Spell, target?: Tile): void {
    if (spell !== 'flood' && !target) return;
    const cost = SPELL_COSTS[spell];
    if (powerMeter.value < cost) {
      toast(`${SPELL_NAMES[spell]} needs ${cost.toLocaleString()} power.`);
      return;
    }
    controls.update();
    camera.updateMatrixWorld();
    const preview = new TerrainSurface(SIZE, cornerLevels.slice(), STEP);
    let changed = false;
    let marsh: Tile[] = [];
    if (spell === 'swamp' && target) {
      marsh = swampTargets(surface, target, tileAt, random);
      changed = marsh.length > 0;
    } else if (spell === 'flood') {
      changed = flood(preview);
    } else if (target) {
      const center = { x: target.x + 0.5, z: target.z + 0.5 };
      if (spell === 'earthquake') {
        changed = earthquake(preview, center, random);
      } else {
        const nearby: GridPoint[] = [];
        for (let z = Math.max(0, target.z - 2); z <= Math.min(SIZE, target.z + 3); z++) {
          for (let x = Math.max(0, target.x - 2); x <= Math.min(SIZE, target.x + 3); x++) {
            if (Math.hypot(x - center.x, z - center.z) <= 3) nearby.push({ x, z });
          }
        }
        changed = volcano(preview, nearby, random, center);
      }
    }
    if (!changed) {
      toast(
        spell === 'swamp'
          ? 'No dry tiles remain to turn into swamp.'
          : spell === 'flood'
            ? 'There is no land left to flood.'
            : spell === 'earthquake'
              ? 'No land changed here. Try another tile.'
              : 'There are no points left to raise around this tile.',
      );
      return;
    }
    if (!powerMeter.spend(cost)) return;
    selectedSpell = null;
    selectTool(tool);
    for (const tile of marsh) {
      tile.swamp = true;
      swampTiles.add(tile);
    }
    cornerLevels.set(preview.levels);
    surface.changedPoints.length = 0;
    for (const point of preview.changedPoints) surface.changedPoints.push(point);
    if (spell === 'volcano') markVolcanicRock(surface, tileAt, rockTiles, swampTiles);
    refreshTerrainAfterEdit();
    const messages: Record<Spell, string> = {
      earthquake: 'The earth trembles.',
      volcano: 'A volcano rises above the land.',
      flood: 'The seas rise. All land sinks one level.',
      swamp: 'A sickly marsh spreads across the land.',
    };
    toast(messages[spell]);
    if (spell === 'earthquake') {
      clearTimeout(shakeTimer);
      document.body.classList.remove('earthquake-shake');
      void document.body.offsetWidth;
      document.body.classList.add('earthquake-shake');
      shakeTimer = setTimeout(() => document.body.classList.remove('earthquake-shake'), 1000);
    }
  }
  function bindSpellControls(): void {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-spell]'));
    buttons.sort(
      (a, b) => SPELL_COSTS[a.dataset.spell as Spell] - SPELL_COSTS[b.dataset.spell as Spell],
    );
    for (const button of buttons) {
      button.parentElement?.append(button);
      button.addEventListener('click', () => selectSpell(button.dataset.spell as Spell));
    }
  }
  function selectTool(next: Tool): void {
    tool = next;
    document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      const active = button.dataset.tool === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const hints: Record<Tool, [string, string]> = {
      raise: [
        shiftHeld ? 'Raise a surface' : 'Raise a corner',
        shiftHeld
          ? 'All four corners · Left raises · Right lowers'
          : 'Left raises · Right lowers · Shift selects surface',
      ],
      lower: [
        shiftHeld ? 'Lower a surface' : 'Lower a corner',
        shiftHeld
          ? 'All four corners · Left raises · Right lowers'
          : 'Left raises · Right lowers · Shift selects surface',
      ],
      inspect: ['Explore your world', 'Hover a tile to discover what lives there'],
    };
    element('#tool-hint').innerHTML = selectedSpell
      ? `<strong>Cast ${SPELL_NAMES[selectedSpell]}</strong><span class="hint-detail">Click a tile to cast · Esc or right-click to cancel</span>`
      : `<strong>${hints[next][0]}</strong><span class="hint-detail">${hints[next][1]}</span>`;
    element('#tile-info').hidden = true;
  }
  function bindToolControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        cancelSpell();
        selectTool(button.dataset.tool as Tool);
      });
    });
  }
  let paused = false;
  let speed = 1;
  let simulationTime = 0;
  function togglePause(): void {
    paused = !paused;
    const button = element<HTMLButtonElement>('#pause');
    button.innerHTML = icon(paused ? 'play' : 'pause');
    button.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    button.title = `${paused ? 'Resume' : 'Pause'} simulation (Space)`;
  }
  function bindSimulationControls(): void {
    element('#rally').addEventListener('click', toggleRally);
    element('#pause').addEventListener('click', togglePause);
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        speed = Number(button.dataset.speed);
        document
          .querySelectorAll('[data-speed]')
          .forEach((node) => node.classList.toggle('selected', node === button));
      });
    });
    element('#reset-view').addEventListener('click', resetCamera);
    element('#new-world').addEventListener('click', () => {
      clearTimeout(shakeTimer);
      document.body.classList.remove('earthquake-shake');
      selectedSpell = null;
      selectTool(tool);
      seed += 17;
      simulationTime = 0;
      resetCamera();
      generateWorld();
      hovered = null;
      hoveredCorner = null;
      cornerMarker.visible = false;
      lastPointer = null;
      glowingSurface = null;
      surfaceStrength = 0;
      surfaceTarget = 0;
      surfaceHighlight.visible = false;
      surfaceHighlightMaterial.opacity = 0;
      glowingCorner = null;
      hoverStrength = 0;
      hoverTarget = 0;
      cornerMaterial.opacity = 0;
      cornerGlowMaterial.opacity = 0;
      element('#tile-info').hidden = true;
      toast('A new shore. A fresh beginning.');
    });
  }
  const panKeys = new Set<string>();
  const arrowKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const panRight = new THREE.Vector3();
  const panForward = new THREE.Vector3();
  const panOffset = new THREE.Vector3();
  function bindKeyboardControls(): void {
    window.addEventListener('keydown', (event) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.matches('input, textarea, select'))
      )
        return;
      if (arrowKeys.has(event.code)) {
        event.preventDefault();
        panKeys.add(event.code);
      }
      if (event.key === 'Escape') {
        cancelSpell();
        return;
      }
      if (['1', '2', '3'].includes(event.key)) cancelSpell();
      if (event.key === 'Shift') setShift(true);
      if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePause();
      }
      if (event.key === '1') selectTool('raise');
      if (event.key === '2') selectTool('lower');
      if (event.key === '3') selectTool('inspect');
    });

    window.addEventListener('keyup', (event) => {
      panKeys.delete(event.code);
      if (event.key === 'Shift') setShift(event.shiftKey);
    });
    window.addEventListener('blur', () => {
      panKeys.clear();
      lastPointer = null;
      setShift(false);
      hoverTarget = 0;
      surfaceTarget = 0;
    });
  }
  function resize(): void {
    const width = world.clientWidth;
    const height = world.clientHeight;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewHeight = aspect < 1 ? 47 : 36;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  const clock = new THREE.Clock();
  function animate(): void {
    requestAnimationFrame(animate);
    const elapsed = clock.getDelta();
    // Pan on the ground relative to the camera's current orientation, even while paused.
    const horizontal = Number(panKeys.has('ArrowRight')) - Number(panKeys.has('ArrowLeft'));
    const vertical = Number(panKeys.has('ArrowUp')) - Number(panKeys.has('ArrowDown'));
    if (horizontal || vertical) {
      panRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
      panForward.subVectors(controls.target, camera.position).setY(0).normalize();
      panOffset
        .copy(panRight)
        .multiplyScalar(horizontal)
        .addScaledVector(panForward, vertical)
        .normalize()
        .multiplyScalar((24 * Math.min(elapsed, 0.05)) / camera.zoom);
      camera.position.add(panOffset);
      controls.target.add(panOffset);
    }
    // Real-time easing keeps feedback responsive even when the simulation is paused.
    hoverStrength = THREE.MathUtils.lerp(
      hoverStrength,
      hoverTarget,
      1 - Math.exp(-8 * Math.min(elapsed, 0.1)),
    );
    surfaceStrength = THREE.MathUtils.lerp(
      surfaceStrength,
      surfaceTarget,
      1 - Math.exp(-8 * Math.min(elapsed, 0.1)),
    );
    surfaceHighlightMaterial.opacity = surfaceStrength * 0.68;
    if (surfaceTarget === 0 && surfaceStrength < 0.005) {
      surfaceHighlight.visible = false;
      glowingSurface = null;
    }
    cornerMaterial.opacity = hoverStrength;
    cornerGlowMaterial.opacity = hoverStrength;
    if (hoverTarget === 0 && hoverStrength < 0.005) {
      cornerMarker.visible = false;
      glowingCorner = null;
    }
    const dt = paused ? 0 : Math.min(elapsed, 0.05) * speed;
    simulationTime += dt;
    let settlementsChanged = false;
    let survivalChanged = false;
    for (const settler of settlers) {
      if (settler.survival.phase === 'alive' || settler.survival.phase === 'drowning') {
        const wasSick = settler.sick;
        const died = updateSickness(settler, dt);
        if (settler.sick !== wasSick) survivalChanged = true;
        if (died) {
          if (settler.home) settlementsChanged = true;
          const wet =
            !settler.home &&
            surface.sample(
              settler.mesh.position.x + SIZE / 2,
              settler.mesh.position.z + SIZE / 2,
            ) <= SEA;
          settler.survival.phase = wet ? 'sinking' : 'dead';
          settler.survival.elapsed = 0;
          settler.target = null;
          renderSurvival(settler);
          survivalChanged = true;
          continue;
        }
      }
      if (settler.home) continue;
      if (encounterLeader(settler)) survivalChanged = true;
      if (settler.survival.phase === 'dead') continue;
      const previous = settler.survival.phase;
      const ground = surface.sample(
        settler.mesh.position.x + SIZE / 2,
        settler.mesh.position.z + SIZE / 2,
      );
      advanceSurvival(settler.survival, dt, ground <= SEA);
      if (settler.survival.phase !== previous) survivalChanged = true;
      if (settler.survival.phase !== 'alive') {
        if (settler.survival.phase === 'drowning' && previous === 'alive')
          anchorDrowningSettler(settler);
        renderSurvival(settler);
        continue;
      }
      if (previous === 'drowning') {
        resetWalkingPose(settler);
        settler.wait = 0;
        settler.mesh.position.y = ground;
      }
      if (!dt) continue;
      // Another settler may have built a house after this walk was planned.
      if (settler.target && !isWalkable(settler.target)) {
        settler.target = null;
        settler.mesh.position.copy(position(settler.tile));
      }
      if (!settler.target) {
        settler.wait -= dt;
        if (settler.wait > 0) continue;
        const options =
          leadership.rallying && settler !== leadership.leader
            ? followerOptions(settler)
            : neighbors(settler.tile);
        if (!options.length) {
          settler.wait = 1;
          continue;
        }
        settler.target = options[Math.floor(random() * options.length)];
        settler.progress = 0;
        settler.mesh.rotation.y = Math.atan2(
          settler.target.x - settler.tile.x,
          settler.target.z - settler.tile.z,
        );
      }
      settler.progress = Math.min(1, settler.progress + dt * 0.65);
      const from = position(settler.tile);
      const to = position(settler.target);
      settler.mesh.position.lerpVectors(from, to, settler.progress);
      settler.mesh.position.y =
        surface.sample(settler.mesh.position.x + SIZE / 2, settler.mesh.position.z + SIZE / 2) +
        Math.abs(Math.sin(settler.progress * Math.PI * 4)) * 0.035;
      const wasSick = settler.sick;
      updateSickness(settler, 0);
      if (settler.sick !== wasSick) survivalChanged = true;
      for (let i = 0; i < settler.legs.length; i++) {
        settler.legs[i].rotation.x =
          Math.sin(simulationTime * 9 + settler.phase) * (i < 2 ? 0.45 : -0.45);
      }
      if (encounterLeader(settler)) survivalChanged = true;
      if (settler.characterPower <= 0) continue;
      if (settler.progress >= 1) {
        settler.tile = settler.target;
        settler.target = null;
        settler.wait = random() < 0.2 ? random() * 3 : 0;
        settler.legs.forEach((leg) => {
          leg.rotation.x = 0;
        });
        if (!leadership.rallying && trySettle(settler, surface)) {
          settler.mesh.visible = false;
          settlementsChanged = true;
        }
      }
    }
    if (settlementsChanged) {
      reconcileWorldSettlements();
      rebuildBuildings();
      syncResidentMeshes();
      updateSettlementStats();
      if (lastPointer) updateHover(lastPointer);
    }
    if (resolveLeadership()) survivalChanged = true;
    for (let i = settlers.length - 1; i >= 0; i--) {
      if (settlers[i].survival.phase !== 'dead') continue;
      people.remove(settlers[i].mesh);
      settlers[i].head.material.dispose();
      settlers.splice(i, 1);
      survivalChanged = true;
    }
    if (survivalChanged) {
      updateSettlementStats();
      if (lastPointer) updateHover(lastPointer);
    }
    const births = growPopulation(settlers, dt, findBirthTile);
    for (const birth of births) createSettler(birth.tile, birth.characterPower).wait = 0;
    if (births.length) {
      updateSettlementStats();
      if (lastPointer) updateHover(lastPointer);
    }
    swampTime.value = simulationTime;
    animateSheep(dt);
    spawnSheep(dt);
    waves.position.x =
      Math.floor(controls.target.x / 32) * 32 + Math.sin(simulationTime * 0.15) * 0.4;
    waves.position.z =
      Math.floor(controls.target.z / 32) * 32 + Math.cos(simulationTime * 0.1) * 0.3;
    waveMaterial.opacity = 0.2 + Math.sin(simulationTime * 0.7) * 0.045;
    powerMeter.advance(
      dt,
      totalBuildingPower(settlers, 'normal'),
      totalBuildingPower(settlers, 'rock'),
    );
    updatePowerDisplay();
    updateLeadershipVisual();
    updateRallyButton();
    controls.update();
    const viewChanged = updateVisibleTerrain();
    sun.position.copy(controls.target).add(new THREE.Vector3(-18, 32, 12));
    sun.target.position.copy(controls.target);
    if ((horizontal || vertical || viewChanged) && lastPointer) updateHover(lastPointer);
    const direction = camera.position.clone().sub(controls.target);
    element<HTMLElement>('.compass svg').style.transform =
      `rotate(${(-Math.atan2(direction.x, direction.z) * 180) / Math.PI}deg)`;
    renderer.render(scene, camera);
  }
  function startRendering(): void {
    new ResizeObserver(resize).observe(world);
    resize();
    animate();
    requestAnimationFrame(() => element('#loading').classList.add('done'));
  }

  resize();
  generateWorld();
  bindTerrainInput();
  bindSpellControls();
  bindToolControls();
  bindSimulationControls();
  bindKeyboardControls();
  startRendering();
}

startGame();
