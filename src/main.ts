import './style.css';
import { generateWorldHeights, playerStartAnchor, enemyStartAnchor } from './world-generation';
import { EnemyTerraformer } from './enemy-ai';
import { EnemySpellcaster } from './enemy-spells';
import { EnemyKnightStrategy } from './enemy-knights';
import { difficultyProfile, type Difficulty } from './ai-profiles';
import { planTerrainSpell, safeForAllies } from './spell-plan';
import { birthLocation } from './birth-location';
import { createAttractView, type AttractView } from './attract-view';
import {
  STARTING_POWER,
  worldDimension,
  newGameSettings,
  type WorldSize,
  type NewGameSettings,
} from './game-settings';
import { createEncounterScenario, unoccupiedWalkSteps } from './encounter-scenario';
import { CombatSystem, combatClosingOffset } from './combat';
import { enemyBuildingContacts, buildingDefenderPoint, touchesBuilding } from './building-contact';
import { createCombatEffects } from './combat-effects';
import { LeaderAnchor } from './leader-anchor';
import { createLeaderAnchorMarker } from './leader-anchor-marker';
import {
  MinimapTerrain,
  layoutMinimapMarkers,
  minimapWorldPoint,
  type MinimapMarker,
} from './minimap';
import { TerrainSurface, type GridPoint, type TerrainBounds } from './terrain-surface';
import { PowerMeter } from './power';
import { Leadership, buildRallyField, rallySteps } from './leadership';
import { AttackOrder, SharedPursuit } from './attack-order';
import { Armageddon, armageddonLand } from './armageddon';
import { nearestPoleCollector } from './pole-recovery';
import { leaderVitals, createLeaderVitalsView } from './leader-vitals';
import { withinTerrainReach } from './terrain-reach';
import { createSilverArmorMaterial, equipKnightArmor } from './knight-armor';
import { createWaterTextures, animateWaterTextures } from './water-texture';
import {
  convertLeaderToKnight,
  nearestEnemy,
  inCombatRange,
  type KnightConversion,
} from './knights';
import { clearSubmergedRock, markVolcanicRock } from './rock';
import { grazingNeighbors, planFlock, SheepSpawner, type GrazingSheep } from './sheep';
import { elevationContours } from './terrain-contours';
import { advanceSurvival, createSurvival, SINKING_SECONDS, type Survival } from './survival';
import { clearSubmergedSwamps, SPELL_COSTS, SPELL_NAMES, type Spell } from './spells';
import { advanceSickness } from './sickness';
import {
  BIRTH_THRESHOLD,
  birthInterval,
  characterGrowthRate,
  growPopulation,
  INITIAL_CHARACTER_POWER,
  populationShirtColor,
  type PopulationColor,
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
  population: PopulationColor;
  knight: boolean;
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
    test: '<path d="M9 3h6m-5 0v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 16h10"/><circle cx="10" cy="18" r=".7"/>',
    armageddon:
      '<path d="m4 4 6 5-5 3 5 8m10-16-6 5 5 3-5 8M12 3v6m0 6v6"/><circle cx="12" cy="12" r="3"/>',
    attack:
      '<path d="m3 3 5 1 12 13-3 3L4 8 3 3Zm18 0-5 1-5 6M9 14l-6 3 3 3 5-6M4 15l5 5m6-16 5 5"/>',
    anchor:
      '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 11h10M4 14c0 9 16 9 16 0M4 14l-2 3m18-3 2 3"/>',
    pole: '<path d="M9 10v11m-4 0h8M9 2l4 4-4 4-4-4zM16 13h5m-2-2 2 2-2 2"/>',
    rally: '<path d="M12 3v14m0-14h7l-2 3 2 3h-7M3 20h18M3 12l4 3-4 3m18-6-4 3 4 3"/>',
    refresh:
      '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17"/>',
    people:
      '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
    power: '<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
    earthquake: '<path d="m3 17 6 3 4-2 8 3M3 12l5-2 4 2 9-3M13 2l-3 5 5 2-5 6 3 3"/>',
    swamp:
      '<path d="M3 18c2-2 4 2 6 0s4 2 6 0 4 2 6 0M6 14V7m-2 3 2 2 2-2M15 15V4m-3 4 3 3 3-3M10 21h6"/>',
    knight:
      '<path d="m5 3 9 9m-3-9-8 8m1-7 7 7M4 12l-2 2m12-5 7 2v5c0 3-3 5-4 6-2-1-5-3-5-6v-5z"/>',
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
  function resetCamera(target = new THREE.Vector3()): void {
    camera.position.copy(target).add(new THREE.Vector3(34, 34, 34));
    controls.target.copy(target);
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
  const leaderVitalsView = createLeaderVitalsView(
    element('#leader-vitals'),
    world,
    element('.spellbox'),
  );
  let worldSize: WorldSize = 'large';
  let SIZE = worldDimension(worldSize);
  let gameStarted = false;
  const newGameMenu = element<HTMLDialogElement>('#new-game-menu');
  let startingGame = false;
  let attractView: AttractView | null = null;
  let encounterTest = false;
  const playerStart = playerStartAnchor(SIZE);
  const enemyStart = enemyStartAnchor(SIZE);
  function resetEnemyCamera(): void {
    resetCamera(new THREE.Vector3(enemyStart.x - SIZE / 2 + 0.5, 0, enemyStart.z - SIZE / 2 + 0.5));
  }
  function resetPlayerCamera(): void {
    resetCamera(
      new THREE.Vector3(playerStart.x - SIZE / 2 + 0.5, 0, playerStart.z - SIZE / 2 + 0.5),
    );
  }
  const STEP = 0.65;
  const SEA = 0.08;
  const powerMeter = new PowerMeter(5, STARTING_POWER);
  const enemyPowerMeter = new PowerMeter(5, STARTING_POWER);
  let difficulty: Difficulty = 'normal';
  let profile = difficultyProfile(difficulty);
  let enemyAI = new EnemyTerraformer(enemyStart, profile.terrainInterval);
  let enemySpellcaster = new EnemySpellcaster(
    profile.spells.minimumDelay,
    profile.spells.maximumDelay,
    profile.spells,
  );
  let enemyKnights = new EnemyKnightStrategy<Settler>(profile.knights);
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
  let cornerLevels = new Uint8Array((SIZE + 1) ** 2);
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
  const minimapCanvas = element<HTMLCanvasElement>('#minimap');
  const minimapBase = document.createElement('canvas');
  minimapBase.width = minimapCanvas.width;
  minimapBase.height = minimapCanvas.height;
  function minimapContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create minimap');
    return context;
  }
  const mapContext = minimapContext(minimapCanvas);
  const mapBaseContext = minimapContext(minimapBase);
  function createMinimapTerrain(): MinimapTerrain {
    return new MinimapTerrain(SIZE, minimapCanvas.width, minimapCanvas.height, [
      '#659e95',
      ...heightColors.slice(1).map((color) => `#${color.getHexString()}`),
    ]);
  }
  let minimapTerrain = createMinimapTerrain();
  const minimapImage = mapBaseContext.createImageData(minimapCanvas.width, minimapCanvas.height);
  const minimapRay = new THREE.Raycaster();
  const minimapPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let lastMinimapPaint = 0;
  function updateMinimap(): void {
    const now = performance.now();
    if (now - lastMinimapPaint < 150 && !minimapTerrain.needsUpdate) return;
    lastMinimapPaint = now;
    const width = minimapCanvas.width,
      height = minimapCanvas.height;
    if (minimapTerrain.update(surface)) {
      minimapImage.data.set(minimapTerrain.pixels);
      mapBaseContext.putImageData(minimapImage, 0, 0);
    }
    mapContext.clearRect(0, 0, width, height);
    mapContext.drawImage(minimapBase, 0, 0);
    const markers: MinimapMarker[] = [];
    for (const settler of settlers) {
      if (settler.survival.phase !== 'alive' && settler.survival.phase !== 'drowning') continue;
      if (settler.home)
        markers.push({
          x: settler.home.x + 0.5,
          z: settler.home.z + 0.5,
          population: settler.population,
          kind: settler.power === 5 ? 'castle' : 'house',
        });
      else
        markers.push({
          x: settler.mesh.position.x + SIZE / 2,
          z: settler.mesh.position.z + SIZE / 2,
          population: settler.population,
          kind: 'character',
          priority:
            settler === leadership.leader || settler === enemyLeadership.leader
              ? 3
              : settler.knight
                ? 2
                : 0,
        });
    }
    for (const glyph of layoutMinimapMarkers(SIZE, width, height, markers)) {
      const x = Math.round(glyph.px - glyph.size / 2),
        y = Math.round(glyph.py - glyph.size / 2);
      mapContext.fillStyle = populationShirtColor(glyph.population);
      mapContext.fillRect(x, y, glyph.size, glyph.size);
      mapContext.strokeStyle = glyph.priority ? '#ffffff' : '#173c45';
      mapContext.lineWidth = 1;
      mapContext.strokeRect(x - 0.5, y - 0.5, glyph.size + 1, glyph.size + 1);
    }
    mapContext.beginPath();
    let first = true;
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      minimapRay.setFromCamera(new THREE.Vector2(x, y), camera);
      const point = minimapRay.ray.intersectPlane(minimapPlane, new THREE.Vector3());
      if (!point) continue;
      const px = ((point.x + SIZE / 2) / SIZE) * width,
        py = ((point.z + SIZE / 2) / SIZE) * height;
      if (first) {
        mapContext.moveTo(px, py);
        first = false;
      } else mapContext.lineTo(px, py);
    }
    mapContext.closePath();
    mapContext.lineWidth = 3;
    mapContext.strokeStyle = '#173c4599';
    mapContext.stroke();
    mapContext.lineWidth = 1;
    mapContext.strokeStyle = '#ffffff';
    mapContext.stroke();
    element('#minimap-player-key').style.color = populationShirtColor(populationColor);
    element('#minimap-enemy-key').style.color = populationShirtColor(enemyColor);
  }
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
        tree: !encounterTest && initialSurface.elevation(x, z) > 2 && hash(x, z) > 0.97,
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
  const populationColor: PopulationColor = 'red';
  const enemyColor: PopulationColor = populationColor === 'red' ? 'blue' : 'red';
  const populationMaterials: Record<PopulationColor, THREE.MeshStandardMaterial> = {
    red: new THREE.MeshStandardMaterial({ color: populationShirtColor('red'), roughness: 1 }),
    blue: new THREE.MeshStandardMaterial({ color: populationShirtColor('blue'), roughness: 1 }),
  };
  const flagPoleGeometry = new THREE.BoxGeometry(0.035, 0.75, 0.035);
  const flagClothGeometry = new THREE.BoxGeometry(0.4, 0.23, 0.025);
  function createPopulationFlag(population: PopulationColor): THREE.Group {
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(flagPoleGeometry, darkMaterial);
    pole.position.y = 0.375;
    const cloth = new THREE.Mesh(flagClothGeometry, populationMaterials[population]);
    cloth.position.set(0.2, 0.61, 0);
    pole.castShadow = true;
    cloth.castShadow = true;
    flag.add(pole, cloth);
    return flag;
  }
  function addHouse(
    tile: Tile,
    power: HousePower,
    population: PopulationColor = populationColor,
  ): void {
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
    const flag = createPopulationFlag(population);
    flag.position.set(0.12, 0.68, 0.08);
    flag.scale.setScalar(0.7);
    group.add(walls, roof, door, chimney, flag);
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
  function addCastle(home: Tile, population: PopulationColor = populationColor): void {
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
    const flag = createPopulationFlag(population);
    flag.position.y = 1.855;
    castle.add(flag);
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
      if (settler.power === 5) addCastle(settler.home, settler.population);
      else addHouse(settler.home, settler.power, settler.population);
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
      if (encounterTest || tile.house || tile.reserved) continue;
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
    const waterTextures = createWaterTextures(SIZE * 3, renderer.capabilities.getMaxAnisotropy());
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE * 3, SIZE * 3),
      new THREE.MeshStandardMaterial({
        map: waterTextures.map,
        normalMap: waterTextures.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.85,
        metalness: 0.03,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = SEA;
    water.receiveShadow = true;
    scene.add(water);
    return { water, waterTextures };
  }
  const { water, waterTextures } = createWater();

  const settlers: Settler[] = [];
  const poleCollectors = new Map<PopulationColor, Settler>();
  const armageddon = new Armageddon<Settler>();
  const attackOrder = new AttackOrder();
  const sharedPursuit = new SharedPursuit<Tile>();
  const leaderAnchor = new LeaderAnchor<Tile>();
  const anchorMarker = createLeaderAnchorMarker();
  scene.add(anchorMarker);
  const combat = new CombatSystem<Settler>();
  const combatEffects = createCombatEffects();
  let combatHudElapsed = 0;
  let displayedPopulation = '';
  function combatPosition(settler: Settler): { x: number; z: number } {
    return settler.home
      ? { x: settler.home.x + 0.5, z: settler.home.z + 0.5 }
      : { x: settler.mesh.position.x + SIZE / 2, z: settler.mesh.position.z + SIZE / 2 };
  }
  function hasNearbyOpponent(settler: Settler): boolean {
    const origin = combatPosition(settler);
    return settlers.some((other) => {
      if (
        other === settler ||
        other.population === settler.population ||
        other.home ||
        other.survival.phase !== 'alive' ||
        other.characterPower <= 0
      )
        return false;
      const point = combatPosition(other);
      return (point.x - origin.x) ** 2 + (point.z - origin.z) ** 2 <= 1.6 ** 2;
    });
  }
  function triggerBuildingContacts(seconds: number): boolean {
    if (seconds <= 0) return false;
    const contacts = enemyBuildingContacts<Tile, Settler>(
      settlers,
      combatPosition,
      (actor) => !combat.opponent(actor),
    );
    if (!contacts.length) return false;
    evacuateSettlements(
      contacts.map((contact) => contact.defender),
      tileAt,
    );
    reconcileWorldSettlements();
    navigationRevision++;
    for (const { attacker, defender, home } of contacts) {
      const point = buildingDefenderPoint(home, combatPosition(attacker));
      defender.mesh.position.set(
        point.x - SIZE / 2,
        surface.sample(point.x, point.z),
        point.z - SIZE / 2,
      );
      defender.mesh.visible = true;
      for (const actor of [attacker, defender]) {
        actor.tile = characterTile(actor);
        actor.target = null;
        actor.progress = 0;
        actor.wait = 0;
        resetWalkingPose(actor);
      }
      combat.engage(attacker, defender);
    }
    rebuildBuildings();
    syncResidentMeshes();
    return true;
  }
  function updateCombatVisuals(seconds: number): void {
    const pairs = combat.pairs.filter((pair) => combat.opponent(pair.a) === pair.b);
    for (const { a, b } of pairs) {
      const gap = (0.4 * (a.mesh.scale.x + b.mesh.scale.x)) / (2 * 1.15);
      const offset = combatClosingOffset(a.mesh.position, b.mesh.position, seconds, gap);
      for (const [actor, direction] of [
        [a, 1],
        [b, -1],
      ] as const) {
        if (actor.home) continue;
        const x = actor.mesh.position.x + offset.x * direction;
        const z = actor.mesh.position.z + offset.z * direction;
        const tile = tileAt(Math.floor(x + SIZE / 2), Math.floor(z + SIZE / 2));
        const height = surface.sample(x + SIZE / 2, z + SIZE / 2);
        if (!tile || !isWalkable(tile) || height <= SEA) continue;
        actor.mesh.position.set(x, height, z);
        actor.tile = characterTile(actor);
      }
    }
    combatEffects.update(pairs, simulationTime);
  }
  const leadership = new Leadership<Tile, Settler>();
  const enemyLeadership = new Leadership<Tile, Settler>();
  let enemyBuilder: Settler | null = null;
  let enemyBuildingSite: Tile | null = null;
  let enemyBuildRevision = -1;
  let enemyBuildDistance = new Map<Tile, number>();
  function updateEnemyBuilder(): void {
    const site = enemyAI.nextBuildSite(surface, tileAt);
    if (site !== enemyBuildingSite || enemyBuildRevision !== navigationRevision) {
      enemyBuildingSite = site;
      enemyBuildRevision = navigationRevision;
      enemyBuildDistance = site ? buildRallyField([site], neighbors) : new Map<Tile, number>();
    }
    if (!site) {
      enemyBuilder = null;
      return;
    }
    if (
      enemyBuilder &&
      !enemyBuilder.knight &&
      !enemyKnights.holds(enemyBuilder) &&
      !enemyKnights.follows(enemyBuilder) &&
      !enemyBuilder.home &&
      enemyBuilder.survival.phase === 'alive' &&
      enemyBuildDistance.has(characterTile(enemyBuilder))
    )
      return;
    enemyBuilder =
      settlers
        .filter(
          (settler) =>
            settler.population === enemyColor &&
            !settler.knight &&
            !enemyKnights.holds(settler) &&
            !enemyKnights.follows(settler) &&
            !settler.home &&
            settler.survival.phase === 'alive' &&
            enemyBuildDistance.has(characterTile(settler)),
        )
        .sort(
          (a, b) =>
            (enemyBuildDistance.get(characterTile(a)) ?? Infinity) -
            (enemyBuildDistance.get(characterTile(b)) ?? Infinity),
        )[0] ?? null;
  }
  const pursuitRoutes = new Map<
    Settler,
    { goal: Tile; revision: number; distance: Map<Tile, number> }
  >();
  const armorMaterial = createSilverArmorMaterial();
  function equipKnight(settler: Settler): void {
    function part(
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
    ): THREE.Mesh {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.ownedGeometry = true;
      parent.add(mesh);
      return mesh;
    }
    equipKnightArmor(settler.mesh, settler.legs, armorMaterial, darkMaterial);
    const teamFlag = createPopulationFlag(settler.population);
    teamFlag.name = 'knight-team-flag';
    teamFlag.position.set(-0.27, 0.23, -0.08);
    teamFlag.rotation.y = Math.PI; // Fly outward, clear of the white leader object and sword.
    settler.mesh.add(teamFlag);
    const sword = new THREE.Group();
    sword.position.z = 0.09;
    part(sword, new THREE.BoxGeometry(0.045, 0.4, 0.025), armorMaterial, 0, 0.24, 0);
    part(sword, new THREE.BoxGeometry(0.15, 0.028, 0.045), darkMaterial, 0, 0.035, 0);
    part(sword, new THREE.BoxGeometry(0.035, 0.11, 0.035), darkMaterial, 0, -0.03, 0);
    settler.legs[3].add(sword);
    const shield = new THREE.Group();
    shield.position.set(-0.04, 0.02, 0.1);
    const rim = part(
      shield,
      new THREE.CylinderGeometry(0.155, 0.155, 0.06, 6),
      armorMaterial,
      0,
      0,
      0,
    );
    rim.rotation.x = Math.PI / 2;
    part(
      shield,
      new THREE.CircleGeometry(0.125, 6),
      populationMaterials[settler.population],
      0,
      0,
      0.032,
    );
    settler.legs[1].add(shield);
  }
  function disposeSettlerVisual(settler: Settler): void {
    settler.head.material.dispose();
    settler.mesh.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData.ownedGeometry) object.geometry.dispose();
    });
  }
  function pursuitOptions(character: Settler, enemy: Settler): Tile[] {
    const goal = characterTile(enemy);
    let route = pursuitRoutes.get(character);
    if (!route || route.goal !== goal || route.revision !== navigationRevision) {
      const starts: Tile[] = [];
      const range = enemy.home && enemy.power === 5 ? 2 : 1;
      if (isWalkable(goal)) starts.push(goal);
      else
        for (let z = goal.z - range; z <= goal.z + range; z++)
          for (let x = goal.x - range; x <= goal.x + range; x++) {
            const tile = tileAt(x, z);
            if (
              tile &&
              isWalkable(tile) &&
              (enemy.home
                ? touchesBuilding({ x: x + 0.5, z: z + 0.5 }, enemy.home, enemy.power)
                : inCombatRange(tile, goal, range))
            )
              starts.push(tile);
          }
      route = {
        goal,
        revision: navigationRevision,
        distance: sharedPursuit.field(character.tile, goal, starts, neighbors, navigationRevision),
      };
      pursuitRoutes.set(character, route);
    }
    return rallySteps(character.tile, neighbors(character.tile), route.distance);
  }
  let navigationRevision = 0;
  let rallyRevision = -1;
  let rallyDestination: Tile | null = null;
  let rallyDistance = new Map<Tile, number>();
  const leaderObject = createLeaderObject();
  const enemyLeaderObject = createLeaderObject();
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
    for (const [state, object] of [
      [leadership, leaderObject],
      [enemyLeadership, enemyLeaderObject],
    ] as const) {
      const owner = state.leader;
      if (owner) {
        if (owner.home) {
          if (object.parent !== scene) scene.add(object);
          object.position.copy(position(owner.home));
          object.position.y += owner.power === 5 ? 2.15 : 0.55 + owner.power * 0.05;
        } else {
          if (object.parent !== owner.mesh) owner.mesh.add(object);
          object.position.set(owner.knight ? 0 : 0.17, 0, owner.knight ? -0.13 : 0.02);
        }
        object.visible = true;
      } else if (state.droppedTile) {
        if (object.parent !== scene) scene.add(object);
        object.position.copy(position(state.droppedTile));
        const tile = state.droppedTile;
        const building = settlers.find(
          (resident) =>
            resident.home &&
            (resident.home === tile ||
              (resident.power === 5 &&
                Math.abs(resident.home.x - tile.x) <= 1 &&
                Math.abs(resident.home.z - tile.z) <= 1)),
        );
        if (building)
          object.position.y += building.power === 5 ? 2.15 : 0.55 + building.power * 0.05;
        object.position.y = Math.max(SEA, object.position.y) + 0.02;
        object.visible = true;
      } else object.visible = false;
    }
    leaderVitalsView.update(leaderVitals(leadership.leader, combat.pairs));
  }
  function updateAnchorButton(): void {
    const button = element<HTMLButtonElement>('#leader-anchor');
    button.disabled = armageddon.active;
    button.classList.toggle('active', leaderAnchor.active);
    button.setAttribute('aria-pressed', String(leaderAnchor.active));
    button.setAttribute(
      'aria-label',
      leaderAnchor.active ? 'Remove leader destination anchor' : 'Place leader destination anchor',
    );
    button.title = leaderAnchor.placing
      ? 'Click the map to place an anchor; click again to cancel'
      : leaderAnchor.target
        ? attackOrder.active
          ? 'Leader anchor paused while attacking; click to remove it'
          : 'Remove leader destination anchor'
        : 'Place an anchor for your leader to walk toward';
  }
  function toggleLeaderAnchor(): void {
    if (armageddon.active) return;
    if (leaderAnchor.active) {
      leaderAnchor.reset();
      anchorMarker.visible = false;
      toast('Leader anchor removed.');
    } else {
      cancelSpell();
      leaderAnchor.toggle();
      toast('Click a map location to place the leader anchor.');
    }
    if (leadership.leader) leadership.leader.wait = 0;
    updateAnchorButton();
    selectTool(tool);
    if (lastPointer) updateHover(lastPointer);
  }
  function placeLeaderAnchor(tile: Tile): void {
    if (!leaderAnchor.place(tile)) return;
    const owner = leadership.leader;
    if (owner?.home && owner.survival.phase === 'alive') {
      evacuateSettlements([owner], tileAt);
      reconcileWorldSettlements();
      navigationRevision++;
      rebuildBuildings();
      syncResidentMeshes();
      updateSettlementStats();
    }
    if (owner) owner.wait = 0;
    updateAnchorButton();
    selectTool(tool);
    toast(
      attackOrder.active
        ? 'Anchor placed. Your leader will follow it when Attack enemy is off.'
        : 'Your leader will walk toward the anchor. Click the anchor button again to remove it.',
    );
  }
  function updateAnchorMarker(): void {
    const target = leaderAnchor.target;
    anchorMarker.visible = target !== null;
    if (!target) return;
    anchorMarker.position.set(
      target.x - SIZE / 2 + 0.5,
      Math.max(SEA, surface.sample(target.x + 0.5, target.z + 0.5)) + 0.08,
      target.z - SIZE / 2 + 0.5,
    );
    anchorMarker.rotation.y = Math.atan2(
      camera.position.x - anchorMarker.position.x,
      camera.position.z - anchorMarker.position.z,
    );
  }
  function focusLeaderPole(): void {
    if (!leadership.leader && !leadership.droppedTile) return;
    updateLeadershipVisual();
    const target = leaderObject.getWorldPosition(new THREE.Vector3());
    camera.position.add(target.clone().sub(controls.target));
    controls.target.copy(target);
    controls.update();
    lastMinimapPaint = 0;
  }
  function updateAttackButton(): void {
    const button = element<HTMLButtonElement>('#attack-enemy');
    button.disabled = armageddon.active;
    button.classList.toggle('active', attackOrder.active);
    button.setAttribute('aria-pressed', String(attackOrder.active));
    button.setAttribute(
      'aria-label',
      attackOrder.active ? 'Stop attacking enemy' : 'Attack enemy with roaming human characters',
    );
    button.title = attackOrder.active
      ? 'Stop attacking; resume normal wandering, building, and leader anchor orders'
      : 'Attack enemy: roaming human characters pursue enemies; buildings remain occupied';
  }
  function toggleAttackOrder(): void {
    if (armageddon.active) return;
    cancelSpell();
    attackOrder.toggle();
    if (attackOrder.active) {
      leadership.rallying = false;
      rallyDestination = null;
    }
    navigationRevision++;
    for (const actor of settlers) {
      if (actor.population !== populationColor || actor.home || actor.survival.phase !== 'alive')
        continue;
      actor.tile = characterTile(actor);
      actor.target = null;
      actor.progress = 0;
      actor.wait = 0;
      resetWalkingPose(actor);
    }
    updateAttackButton();
    updateAnchorButton();
    updateSettlementStats();
    updateLeadershipVisual();
    if (lastPointer) updateHover(lastPointer);
    toast(
      attackOrder.active
        ? 'Attack enemy: your roaming characters are advancing. Buildings and residents stay in place.'
        : 'Attack order cancelled. Normal orders resumed.',
    );
  }
  function updateRallyButton(): void {
    const poleButton = element<HTMLButtonElement>('#leader-view');
    poleButton.disabled = !leadership.leader && !leadership.droppedTile;
    poleButton.title = leadership.droppedTile
      ? 'Locate your dropped leader pole, including in water (L)'
      : 'Locate your leader pole (L)';
    const button = element<HTMLButtonElement>('#rally');
    button.disabled = encounterTest || armageddon.active;
    const label = leadership.rallying ? 'Stop gathering' : 'Gather followers';
    button.setAttribute('aria-label', label);
    button.classList.toggle('active', leadership.rallying);
    button.setAttribute('aria-pressed', String(leadership.rallying));
    button.title = `${label} · ${leadership.leader ? `Leader HP ${leadership.leader.characterPower.toFixed(1)}${leadership.leader.knight ? ' · Knight' : ''}` : 'Leader object awaiting pickup'} · ${armageddon.active ? 'Armageddon: both populations merge into their leaders' : encounterTest ? 'Gathering disabled in encounter test' : leadership.rallying ? 'Click to resume wandering and building' : 'Roaming followers merge their HP/power into the leader; buildings stay occupied'}`;
  }
  function updatePoleCollectors(): void {
    poleCollectors.clear();
    if (armageddon.active) return;
    for (const [color, state] of [
      [populationColor, leadership],
      [enemyColor, enemyLeadership],
    ] as const) {
      const goal = state.droppedTile;
      if (state.leader || !goal) continue;
      const collector = nearestPoleCollector(
        tileCenter(goal),
        color,
        settlers,
        combatPosition,
        (actor) => !combat.opponent(actor) && state.canRecover(actor, characterTile(actor)),
      );
      if (collector) poleCollectors.set(color, collector);
    }
  }
  function tileCenter(tile: Tile): GridPoint {
    return { x: tile.x + 0.5, z: tile.z + 0.5 };
  }
  function poleRecoveryOptions(settler: Settler, goal: Tile): Tile[] {
    const starts = isWalkable(goal) ? [goal] : neighbors(goal);
    const field = sharedPursuit.field(settler.tile, goal, starts, neighbors, navigationRevision);
    return rallySteps(settler.tile, neighbors(settler.tile), field);
  }
  function encounterLeader(settler: Settler): boolean {
    if (armageddon.finished || (armageddon.active && paused)) return false;
    if (settler.home || settler.survival.phase !== 'alive') return false;
    const state = settler.population === populationColor ? leadership : enemyLeadership;
    const owner = state.leader;
    if (armageddon.active && (!owner || owner.characterPower <= 0)) return false;
    if (owner && owner.survival.phase !== 'alive') return false;
    if (
      !armageddon.active &&
      owner &&
      owner === enemyKnights.commander &&
      enemyKnights.isSuccessor(settler)
    ) {
      const from = combatPosition(settler),
        to = combatPosition(owner);
      if (
        (!settler.target || settler.progress >= 1) &&
        Math.hypot(from.x - to.x, from.z - to.z) <= 0.8 &&
        state.transfer(owner, settler)
      ) {
        enemyKnights.complete(settler);
        owner.tile = characterTile(owner);
        owner.target = null;
        owner.progress = 0;
        owner.wait = 0;
        settler.tile = characterTile(settler);
        settler.target = null;
        settler.progress = 0;
        settler.wait = 0;
        return true;
      }
    }
    const gathering = state.rallying || (!armageddon.active && enemyKnights.donates(settler));
    const atLeaderBuilding =
      gathering && owner?.home && touchesBuilding(combatPosition(settler), owner.home, owner.power);
    const result = state.encounter(
      settler,
      atLeaderBuilding && owner?.home ? owner.home : characterTile(settler),
      owner ? characterTile(owner) : null,
      gathering,
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
    for (const state of [leadership, enemyLeadership]) {
      const owner = state.leader;
      if (owner && (owner.survival.phase === 'sinking' || owner.survival.phase === 'dead')) {
        state.drop(owner, characterTile(owner));
        rallyDestination = null;
        changed = true;
      }
    }
    for (const settler of settlers) if (encounterLeader(settler)) changed = true;
    return changed;
  }
  function followerOptions(settler: Settler): Tile[] {
    if (leadership.leader?.home) return pursuitOptions(settler, leadership.leader);
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
    if (encounterTest || armageddon.active) return;
    if (!leadership.leader && !leadership.droppedTile) {
      toast('There is no leader object to gather around.');
      return;
    }
    leadership.rallying = !leadership.rallying;
    if (leadership.rallying) {
      attackOrder.reset();
      updateAttackButton();
      updateAnchorButton();
    }
    navigationRevision++;
    rallyDestination = null;
    for (const settler of settlers) {
      if (
        settler.population !== populationColor ||
        settler === leadership.leader ||
        settler.home ||
        settler.survival.phase !== 'alive'
      )
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
  const bodyGeometry = new THREE.BoxGeometry(0.17, 0.21, 0.12);
  const headGeometry = new THREE.BoxGeometry(0.135, 0.14, 0.13);
  const hairGeometry = new THREE.BoxGeometry(0.145, 0.055, 0.14);
  const limbGeometry = new THREE.BoxGeometry(0.055, 0.16, 0.065);
  function createSettler(
    tile: Tile,
    characterPower = INITIAL_CHARACTER_POWER,
    population: PopulationColor = populationColor,
  ): Settler {
    const shirtMaterial = populationMaterials[population];
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
      population,
      knight: false,
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
    leaderVitalsView.update(null);
    poleCollectors.clear();
    armageddon.reset();
    element('#game-result').hidden = true;
    element<HTMLButtonElement>('#pause').disabled = false;
    element('#pause-overlay').hidden = !paused;
    attackOrder.reset();
    sharedPursuit.reset();
    updateAttackButton();
    leaderAnchor.reset();
    anchorMarker.visible = false;
    updateAnchorButton();
    combatEffects.clear();
    combat.reset();
    leadership.reset();
    enemyLeadership.reset();
    leaderObject.visible = false;
    enemyLeaderObject.visible = false;
    enemyBuilder = null;
    enemyBuildingSite = null;
    enemyBuildRevision = -1;
    enemyBuildDistance.clear();
    rallyDistance.clear();
    rallyDestination = null;
    rallyRevision = -1;
    navigationRevision = 0;
    pursuitRoutes.clear();
    for (const settler of settlers) disposeSettlerVisual(settler);
    people.clear();
    settlers.length = 0;
  }
  function spawnSettlers(): void {
    clearSettlers();
    const claimed = new Set<Tile>();
    const radius = encounterTest ? 4 : 14;
    for (const [anchor, color, state] of [
      [playerStart, populationColor, leadership],
      [enemyStart, enemyColor, enemyLeadership],
    ] as const) {
      const walkable: Tile[] = [];
      for (let z = anchor.z - radius; z <= anchor.z + radius; z++)
        for (let x = anchor.x - radius; x <= anchor.x + radius; x++) {
          const tile = tileAt(x, z);
          if (
            tile &&
            Math.hypot(tile.x - anchor.x, tile.z - anchor.z) < radius &&
            (!encounterTest || !claimed.has(tile)) &&
            tile.height > 1 &&
            isWalkable(tile) &&
            neighbors(tile).length > 0
          )
            walkable.push(tile);
        }
      const count = Math.min(24, walkable.length);
      for (let i = 0; i < count; i++) {
        const index = Math.floor(random() * walkable.length);
        const tile = walkable[index];
        if (encounterTest) {
          claimed.add(tile);
          walkable.splice(index, 1);
        }
        const settler = createSettler(tile, INITIAL_CHARACTER_POWER, color);
        if (i === 0) state.appoint(settler);
      }
    }
    updateSettlementStats();
  }
  function findBirthTile(home: Tile): Tile | null {
    return birthLocation(home, surface, tileAt, isWalkable, neighbors, hasTree);
  }
  function updatePowerDisplay(): void {
    element('#power').textContent = powerMeter.value.toLocaleString();
    document.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((button) => {
      const spell = button.dataset.spell as Spell;
      const affordable = powerMeter.value >= SPELL_COSTS[spell];
      button.classList.toggle('affordable', affordable);
      button.classList.toggle('selected', selectedSpell === spell);
      button.setAttribute('aria-pressed', String(selectedSpell === spell));
      button.disabled = armageddon.active;
      button.setAttribute('aria-disabled', String(!affordable || button.disabled));
    });
  }
  function updateEnemyStatus(): void {
    const badge = document.querySelector<HTMLElement>('#enemy-status');
    if (!badge) return;
    badge.style.color = populationShirtColor(enemyColor);
    const living = settlers.filter(
      (settler) =>
        settler.population === enemyColor &&
        (settler.survival.phase === 'alive' || settler.survival.phase === 'drowning'),
    );
    badge.title = `${enemyColor} enemy: ${living.length} settlers · ${living.filter((settler) => settler.home).length} housed · ${living.filter((settler) => settler.power === 5).length} castles · ${enemyPowerMeter.value.toLocaleString()} power · ${enemyAI.edits} paid terrain edits (one / ${enemyAI.interval}s) · ${enemyAI.spent} spent · ${enemySpellcaster.casts} spell${enemySpellcaster.casts === 1 ? '' : 's'} cast (${enemySpellcaster.spent.toLocaleString()} power) · ${living.filter((actor) => actor.knight).length} knights (${enemyKnights.created} trained; ${enemyKnights.phase}) · ${difficulty} / ${profile.label} · E to view${encounterTest ? ' · Encounter test: combat enabled; terraforming AI disabled' : ''}`;
  }
  function updateSettlementStats(): void {
    const living = settlers.filter(
      (settler) =>
        settler.population === populationColor &&
        (settler.survival.phase === 'alive' || settler.survival.phase === 'drowning'),
    );
    const enemyLiving = settlers.filter(
      (settler) =>
        settler.population === enemyColor &&
        (settler.survival.phase === 'alive' || settler.survival.phase === 'drowning'),
    );
    const playerResidents = settlers.filter((settler) => settler.population === populationColor);
    const housed = living.filter((settler) => settler.home !== null).length;
    const drowning = living.filter((settler) => settler.survival.phase === 'drowning').length;
    const roaming = living.length - housed - drowning;
    const sick = living.filter((settler) => settler.sick).length;
    const populationMarkup = `${living.length} <small>settlers · <span id="enemy-status" class="enemy-count" style="color:${populationShirtColor(enemyColor)}">${enemyLiving.length} enemy</span></small>`;
    if (populationMarkup !== displayedPopulation) {
      element('#population').innerHTML = populationMarkup;
      displayedPopulation = populationMarkup;
    }
    const castles = living.filter((settler) => settler.power === 5).length;
    element('#population').title =
      `${roaming} roaming · ${housed} at home${drowning ? ` · ${drowning} drowning` : ''}${castles ? ` · ${castles} castle${castles > 1 ? 's' : ''}` : ''}${sick ? ` · ${sick} sick` : ''} · ${flock.length} sheep`;
    element('#population').title += leadership.leader
      ? ` · Leader HP ${leadership.leader.characterPower.toFixed(1)}`
      : leadership.droppedTile
        ? ' · Leader object dropped'
        : '';
    updateEnemyStatus();
    updateRallyButton();
    element('#power').title =
      `+${totalBuildingPower(playerResidents, 'normal')} power / ${powerMeter.interval}s${totalBuildingPower(playerResidents, 'rock') ? ` · +${totalBuildingPower(playerResidents, 'rock')} rock power / ${powerMeter.interval * 2}s` : ''} · Terrain costs 1 power per affected point and requires an owned character within 10 tiles`;
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
    enemyPowerMeter.reset();
    enemyAI.reset();
    enemySpellcaster.reset();
    enemyKnights.reset();
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
    const scenario = encounterTest ? createEncounterScenario(SIZE) : null;
    Object.assign(playerStart, scenario?.playerStart ?? playerStartAnchor(SIZE));
    Object.assign(enemyStart, scenario?.enemyStart ?? enemyStartAnchor(SIZE));
    cornerLevels.set(scenario?.levels ?? generateWorldHeights(SIZE, seed));
    const testButton = element<HTMLButtonElement>('#test-scenario');
    testButton.classList.toggle('active', encounterTest);
    testButton.setAttribute('aria-pressed', String(encounterTest));
    testButton.title = encounterTest
      ? 'Restart shared-island combat test'
      : 'Set up shared-island combat test (resets world)';
    surface = new TerrainSurface(SIZE, cornerLevels, STEP);
    initialSurface = new TerrainSurface(SIZE, cornerLevels.slice(), STEP);
    minimapTerrain.invalidate();
    lastMinimapPaint = 0;
    resetPlayerCamera();
    renderedBounds = cameraTerrainBounds();
    rebuild();
    spawnSettlers();
    updatePowerDisplay();
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
    const surfaceSelection = shiftHeld || selectedSpell !== null || leaderAnchor.placing;
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
    info.hidden = selectedSpell !== null || leaderAnchor.placing || tool !== 'inspect' || !hovered;
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
      const leaderHere = [leadership.leader, enemyLeadership.leader].find(
        (owner) => owner && characterTile(owner) === hovered,
      );
      const objectHere =
        leadership.droppedTile === hovered || enemyLeadership.droppedTile === hovered;
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
      info.innerHTML = `<strong>${kind}</strong>${cornerInfo}<br>Tile ${hovered.x}, ${hovered.z} · Corners ${surface.level(hovered.x, hovered.z)}, ${surface.level(hovered.x + 1, hovered.z)}, ${surface.level(hovered.x + 1, hovered.z + 1)}, ${surface.level(hovered.x, hovered.z + 1)}<br>${resident ? `${buildingInfo}<br>1 settler lives here.` : drowning ? 'Drowning — raise the land beneath them to rescue!' : visitors ? `${visitors} settler${visitors > 1 ? 's' : ''} here · ${[...new Set(walkers.map((walker) => walker.population))].join('/')} · HP ${walkerPower}${walkers.some((walker) => combat.opponent(walker)) ? ' · Fighting' : ''}${walkers.some((walker) => walker.sick) ? ' · Sick (-1 HP/s)' : ''}` : 'Select a corner to shape the land.'}${sheepHere ? `<br>${sheepHere} sheep grazing here` : ''}${leaderHere ? `<br>Leader · HP/power ${leaderHere?.characterPower.toFixed(1)}${leaderHere?.knight ? ' · Knight' : ''} · ${leaderHere?.population}` : objectHere ? '<br>White leader object · Walk here to pick it up' : ''}`;
    }
    const editSelection = shiftHeld ? hovered : hoveredCorner;
    const outOfReach =
      !selectedSpell &&
      !leaderAnchor.placing &&
      !armageddon.active &&
      editSelection &&
      !withinTerrainReach(editSelection, shiftHeld, settlers, populationColor, combatPosition);
    canvas.style.cursor = hovered
      ? outOfReach
        ? 'not-allowed'
        : tool === 'inspect' && !selectedSpell && !leaderAnchor.placing
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
      if (armageddon.active) return;
      if (leaderAnchor.placing) {
        if (event.button === 2) cancelSpell();
        else if (hovered) placeLeaderAnchor(hovered);
        return;
      }
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
      if (!withinTerrainReach(selection, shiftHeld, settlers, populationColor, combatPosition)) {
        toast('Out of reach. Select land within 10 tiles of one of your living characters.');
        return;
      }
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
    minimapTerrain.invalidate(surface.changedPoints);
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
    if (
      [...affected].some(
        (tile) =>
          tile.x >= renderedBounds.x &&
          tile.z >= renderedBounds.z &&
          tile.x < renderedBounds.x + renderedBounds.width &&
          tile.z < renderedBounds.z + renderedBounds.depth,
      )
    )
      rebuild();
    else rebuildBuildings();
    syncResidentMeshes(affected);
    updateSettlementStats();
    updatePowerDisplay();
    if (lastPointer) updateHover(lastPointer);
  }
  let shakeTimer: ReturnType<typeof setTimeout>;
  function cancelSpell(): void {
    leaderAnchor.cancelPlacement();
    updateAnchorButton();
    selectedSpell = null;
    updatePowerDisplay();
    selectTool(tool);
    if (lastPointer) updateHover(lastPointer);
  }
  function selectSpell(spell: Spell): void {
    if (armageddon.active) return;
    leaderAnchor.cancelPlacement();
    updateAnchorButton();
    if (selectedSpell === spell) {
      cancelSpell();
      return;
    }
    if (powerMeter.value < SPELL_COSTS[spell]) {
      toast(`${SPELL_NAMES[spell]} needs ${SPELL_COSTS[spell].toLocaleString()} power.`);
      return;
    }
    if (spell === 'flood' || spell === 'knight' || spell === 'armageddon') {
      cancelSpell();
      castSpell(spell);
      return;
    }
    selectedSpell = spell;
    updatePowerDisplay();
    selectTool(tool);
    if (lastPointer) updateHover(lastPointer);
  }
  function updateArmageddonLand(): void {
    if (armageddonLand(surface, [...armageddon.leaders.values()].map(combatPosition)))
      refreshTerrainAfterEdit();
  }
  function startArmageddon(): void {
    const current = new Map<PopulationColor, Settler | null>([
      [populationColor, leadership.leader],
      [enemyColor, enemyLeadership.leader],
    ]);
    const result = armageddon.start(settlers, current, () =>
      powerMeter.spend(SPELL_COSTS.armageddon),
    );
    if (result !== 'started') {
      toast(
        result === 'insufficient'
          ? 'Armageddon needs 6,000 power.'
          : result === 'missing-population'
            ? 'Both populations need a living character for Armageddon.'
            : 'Armageddon is already underway.',
      );
      return;
    }
    attackOrder.reset();
    leaderAnchor.reset();
    anchorMarker.visible = false;
    cancelSpell();
    combatEffects.clear();
    combat.reset();
    for (const [color, state] of [
      [populationColor, leadership],
      [enemyColor, enemyLeadership],
    ] as const) {
      state.reset();
      state.appoint(armageddon.leaders.get(color)!);
      state.rallying = true;
    }
    enemyKnights.cancel();
    evacuateSettlements(settlers, tileAt);
    reconcileWorldSettlements();
    navigationRevision++;
    rebuildBuildings();
    syncResidentMeshes();
    for (const actor of settlers) {
      actor.tile = characterTile(actor);
      actor.target = null;
      actor.progress = 0;
      actor.wait = 0;
      resetWalkingPose(actor);
    }
    updateArmageddonLand();
    updateAttackButton();
    updateAnchorButton();
    updateSettlementStats();
    updateLeadershipVisual();
    updatePowerDisplay();
    selectTool(tool);
    toast('Armageddon! Both populations merge into their leaders for the final battle.');
  }
  function finishArmageddon(): void {
    if (!armageddon.active || armageddon.finished) return;
    const winner = armageddon.resolve();
    if (winner === null) return;
    element('#game-result').hidden = false;
    element('#game-result-title').textContent =
      winner === 'draw' ? 'DRAW' : winner === populationColor ? 'VICTORY' : 'DEFEAT';
    element('#game-result-detail').textContent =
      winner === 'draw'
        ? 'Both leaders fell together.'
        : winner === populationColor
          ? 'Your leader won Armageddon.'
          : 'The enemy leader won Armageddon.';
    element<HTMLButtonElement>('#pause').disabled = true;
    element('#pause-overlay').hidden = true;
    selectTool(tool);
  }
  function castSpell(spell: Spell, target?: Tile, caster: PopulationColor = populationColor): void {
    if (armageddon.active) return;
    const playerCast = caster === populationColor;
    if (!playerCast && spell !== 'earthquake' && spell !== 'swamp' && spell !== 'volcano') return;
    const budget = playerCast ? powerMeter : enemyPowerMeter;
    if (spell === 'armageddon') {
      startArmageddon();
      return;
    }
    if (spell === 'pole') {
      if (!target) return;
      const result = leadership.relocate(target, () => powerMeter.spend(SPELL_COSTS.pole));
      if (result === 'moved') {
        // Restore shared pole materials before detaching it from a glowing combatant.
        combatEffects.clear();
        rallyDestination = null;
        cancelSpell();
        updateSettlementStats();
        updateLeadershipVisual();
        if (lastPointer) updateHover(lastPointer);
      }
      const messages = {
        moved: 'The leader pole moves. Its former holder stays in place.',
        missing: 'There is no leader pole to move.',
        unchanged: 'The pole is already at this location.',
        insufficient: 'Move leader pole needs 100 power.',
      };
      toast(messages[result]);
      return;
    }
    if (spell === 'knight') {
      const owner = leadership.leader;
      const result = convertLeaderToKnight(owner, () => powerMeter.spend(SPELL_COSTS.knight));
      const messages: Record<KnightConversion, string> = {
        converted: 'The leader becomes a knight. This transformation is permanent.',
        'no-leader': 'A character must pick up the leader pole first.',
        housed: 'The leader must leave their building before becoming a knight.',
        'already-knight': 'The leader is already a knight.',
        unavailable: 'Only a living leader on dry land can become a knight.',
        insufficient: 'Knight needs 1,000 power.',
      };
      if (result === 'converted' && owner) {
        equipKnight(owner);
        owner.tile = characterTile(owner);
        owner.target = null;
        owner.progress = 0;
        owner.wait = 0;
        updateSettlementStats();
        updatePowerDisplay();
        updateLeadershipVisual();
        if (lastPointer) updateHover(lastPointer);
      }
      toast(messages[result]);
      return;
    }
    if (spell !== 'flood' && !target) return;
    const cost = SPELL_COSTS[spell];
    if (budget.value < cost) {
      if (playerCast) toast(`${SPELL_NAMES[spell]} needs ${cost.toLocaleString()} power.`);
      return;
    }
    controls.update();
    camera.updateMatrixWorld();
    const plan = planTerrainSpell(surface, spell, target, tileAt, random);
    const { preview, marsh, changed } = plan;
    if (!changed) {
      if (!playerCast) return;
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
    if (!playerCast) {
      const friends = settlers.filter(
        (actor) =>
          actor.population === caster &&
          actor.characterPower > 0 &&
          (actor.survival.phase === 'alive' || actor.survival.phase === 'drowning'),
      );
      if (
        !safeForAllies(
          surface,
          plan,
          friends.map((actor) => ({
            point: combatPosition(actor),
            home: actor.home,
            castle: actor.power === 5,
          })),
        )
      )
        return;
    }
    if (!budget.spend(cost)) return;
    if (playerCast) {
      selectedSpell = null;
      selectTool(tool);
    }
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
      pole: 'The leader pole moves.',
      armageddon: 'Armageddon begins. Both populations rally for the final battle.',
      knight: 'The leader becomes a knight.',
      earthquake: 'The earth trembles.',
      volcano: 'A volcano rises above the land.',
      flood: 'The seas rise. All land sinks one level.',
      swamp: 'A sickly marsh spreads across the land.',
    };
    toast(
      playerCast ? messages[spell] : `Enemy casts ${SPELL_NAMES[spell]} against your population!`,
    );
    if (spell === 'earthquake') {
      clearTimeout(shakeTimer);
      document.body.classList.remove('earthquake-shake');
      void document.body.offsetWidth;
      document.body.classList.add('earthquake-shake');
      shakeTimer = setTimeout(() => document.body.classList.remove('earthquake-shake'), 1000);
    }
  }
  function enemyKnightCamp(tile: Tile): boolean {
    const commander = enemyKnights.commander;
    if (!commander) return false;
    const center = characterTile(commander);
    return Math.abs(tile.x - center.x) <= 2 && Math.abs(tile.z - center.z) <= 2;
  }
  function mobilizeEnemyCharacters(characters: readonly Settler[]): void {
    evacuateSettlements(characters, tileAt);
    reconcileWorldSettlements();
    navigationRevision++;
    rebuildBuildings();
    syncResidentMeshes();
    for (const actor of characters) {
      actor.tile = characterTile(actor);
      actor.target = null;
      actor.progress = 0;
      actor.wait = 0;
      resetWalkingPose(actor);
    }
    enemyBuilder = null;
    updateSettlementStats();
    updateLeadershipVisual();
  }
  function advanceEnemyKnights(seconds: number): void {
    if (seconds <= 0) return;
    if (
      !settlers.some(
        (actor) =>
          actor.population === populationColor &&
          actor.characterPower > 0 &&
          (actor.survival.phase === 'alive' || actor.survival.phase === 'drowning'),
      )
    ) {
      enemyKnights.cancel();
      return;
    }
    const action = enemyKnights.advance(
      seconds,
      settlers,
      enemyLeadership.leader,
      enemyColor,
      enemyPowerMeter,
      combatPosition,
      (actor) =>
        !actor.sick &&
        !combat.opponent(actor) &&
        (!!actor.home || isWalkable(characterTile(actor))),
    );
    if (!action) return;
    if (action.kind === 'gather') {
      mobilizeEnemyCharacters([action.leader, ...action.recruits]);
    } else if (action.kind === 'handoff') {
      mobilizeEnemyCharacters([action.successor]);
    } else if (
      convertLeaderToKnight(action.leader, () => enemyPowerMeter.spend(SPELL_COSTS.knight)) ===
      'converted'
    ) {
      equipKnight(action.leader);
      enemyKnights.converted();
      mobilizeEnemyCharacters([action.successor]);
      toast('The enemy has trained a strengthened knight. A raid is preparing.');
    }
  }
  function advanceEnemySpells(seconds: number): void {
    if (seconds <= 0) return;
    const living = settlers.filter(
      (actor) =>
        actor.characterPower > 0 &&
        (actor.survival.phase === 'alive' || actor.survival.phase === 'drowning'),
    );
    const players = living
      .filter((actor) => actor.population === populationColor)
      .map((actor) => ({
        ...combatPosition(actor),
        weight:
          (actor.home ? (actor.power === 5 ? 6 : 3) : 1) + (actor === leadership.leader ? 2 : 0),
      }));
    const allies = living.filter((actor) => actor.population === enemyColor).map(combatPosition);
    enemySpellcaster.advance(
      seconds,
      { value: Math.max(0, enemyPowerMeter.value - enemyKnights.reservedPower) },
      players,
      allies,
      (spell, point) => {
        const target = tileAt(Math.floor(point.x), Math.floor(point.z));
        if (!target) return false;
        const before = enemyPowerMeter.value;
        castSpell(spell, target, enemyColor);
        return enemyPowerMeter.value < before;
      },
      random,
    );
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
    element('#tool-hint').innerHTML = armageddon.finished
      ? '<strong>Armageddon complete</strong><span class="hint-detail">Choose New world to play again</span>'
      : armageddon.active
        ? '<strong>Armageddon</strong><span class="hint-detail">Both leaders march for the final battle</span>'
        : leaderAnchor.placing
          ? '<strong>Place leader anchor</strong><span class="hint-detail">Click a location · Esc or right-click to cancel</span>'
          : selectedSpell
            ? `<strong>Cast ${SPELL_NAMES[selectedSpell]}</strong><span class="hint-detail">Click a tile to cast · Esc or right-click to cancel</span>`
            : `<strong>${hints[next][0]}</strong><span class="hint-detail">${hints[next][1]}</span>`;
    element('#tile-info').hidden = true;
  }
  let paused = false;
  let speed = 1;
  let simulationTime = 0;
  function togglePause(): void {
    if (armageddon.finished) return;
    paused = !paused;
    element('#pause-overlay').hidden = !paused;
    const button = element<HTMLButtonElement>('#pause');
    button.innerHTML = icon(paused ? 'play' : 'pause');
    button.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    button.setAttribute('aria-pressed', String(paused));
    button.title = `${paused ? 'Resume' : 'Pause'} simulation (Space)`;
  }
  function bindSimulationControls(): void {
    minimapCanvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = minimapCanvas.getBoundingClientRect();
      const point = minimapWorldPoint(
        (event.clientX - bounds.left) / bounds.width,
        (event.clientY - bounds.top) / bounds.height,
        SIZE,
      );
      const target = new THREE.Vector3(
        point.x - SIZE / 2 + 0.5,
        controls.target.y,
        point.z - SIZE / 2 + 0.5,
      );
      camera.position.add(target.clone().sub(controls.target));
      controls.target.copy(target);
      controls.update();
      lastMinimapPaint = 0;
    });
    minimapCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
    element('#rally').addEventListener('click', toggleRally);
    element('#pause').addEventListener('click', togglePause);
    element('#attack-enemy').addEventListener('click', toggleAttackOrder);
    element('#leader-anchor').addEventListener('click', toggleLeaderAnchor);
    element('#leader-view').addEventListener('click', focusLeaderPole);
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => {
        speed = Number(button.dataset.speed);
        document
          .querySelectorAll('[data-speed]')
          .forEach((node) => node.classList.toggle('selected', node === button));
      });
    });
    element('#reset-view').addEventListener('click', resetPlayerCamera);
    element('#test-scenario').addEventListener('click', () => startWorld(true));
    element('#new-world').addEventListener('click', () => openNewGameMenu());
    element<HTMLSelectElement>('#ai-difficulty').addEventListener('change', (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value !== 'easy' && value !== 'normal' && value !== 'hard') return;
      element<HTMLSelectElement>('#ai-difficulty').value = difficulty;
      openNewGameMenu(value);
    });
  }
  function updatePreviewControls(): void {
    element('#new-game-preview').hidden = !attractView;
    if (!attractView) return;
    const isPaused = attractView.simulation.paused;
    const button = element<HTMLButtonElement>('#toggle-preview');
    button.textContent = isPaused ? 'Play preview' : 'Pause preview';
    button.setAttribute('aria-pressed', String(isPaused));
    element('#preview-status').textContent = isPaused
      ? 'AI vs AI · preview paused'
      : 'AI vs AI · live preview';
  }
  function startAttractMode(): void {
    if (gameStarted || attractView) return;
    attractView = createAttractView(
      renderer,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    document.body.classList.add('attract-mode');
    resize();
    updatePreviewControls();
  }
  function stopAttractMode(): void {
    if (!attractView) return;
    attractView.dispose();
    attractView = null;
    document.body.classList.remove('attract-mode');
    resize();
    updatePreviewControls();
  }
  function openNewGameMenu(proposedDifficulty: Difficulty = difficulty): void {
    if (startingGame || newGameMenu.open) return;
    element<HTMLSelectElement>('#menu-ai-difficulty').value = proposedDifficulty;
    element<HTMLSelectElement>('#menu-world-size').value = worldSize;
    element<HTMLButtonElement>('#cancel-new-game').hidden = !gameStarted;
    element('#new-game-error').hidden = true;
    updatePreviewControls();
    panKeys.clear();
    controls.enabled = false;
    newGameMenu.showModal();
  }
  function closeNewGameMenu(): void {
    if (!gameStarted || startingGame) return;
    newGameMenu.close();
    controls.enabled = true;
  }
  function applyNewGame(settings: NewGameSettings): void {
    difficulty = settings.difficulty;
    worldSize = settings.worldSize;
    lastPointer = null;
    hovered = null;
    hoveredCorner = null;
    SIZE = worldDimension(worldSize);
    cornerLevels = new Uint8Array((SIZE + 1) ** 2);
    minimapTerrain = createMinimapTerrain();
    profile = difficultyProfile(difficulty);
    enemyAI = new EnemyTerraformer(enemyStart, profile.terrainInterval);
    enemySpellcaster = new EnemySpellcaster(
      profile.spells.minimumDelay,
      profile.spells.maximumDelay,
      profile.spells,
    );
    enemyKnights = new EnemyKnightStrategy<Settler>(profile.knights);
    element<HTMLSelectElement>('#ai-difficulty').value = difficulty;
    startWorld(false);
  }
  function bindNewGameMenu(): void {
    newGameMenu.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeNewGameMenu();
    });
    element('#cancel-new-game').addEventListener('click', closeNewGameMenu);
    element('#toggle-preview').addEventListener('click', () => {
      if (!attractView) return;
      attractView.simulation.paused = !attractView.simulation.paused;
      updatePreviewControls();
    });
    element<HTMLFormElement>('#new-game-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (startingGame) return;
      const settings = newGameSettings(
        element<HTMLSelectElement>('#menu-ai-difficulty').value,
        element<HTMLSelectElement>('#menu-world-size').value,
      );
      if (!settings) return;
      const button = element<HTMLButtonElement>('#start-new-game');
      startingGame = true;
      if (attractView) attractView.simulation.paused = true;
      button.disabled = true;
      button.textContent = 'Creating world…';
      try {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        applyNewGame(settings);
        newGameMenu.close();
        controls.enabled = true;
      } catch (error) {
        console.error('Unable to start world', error);
        gameStarted = false;
        startAttractMode();
        element('#cancel-new-game').hidden = true;
        const message = element('#new-game-error');
        message.textContent =
          'Unable to create this world. Please try again or choose a smaller world.';
        message.hidden = false;
      } finally {
        startingGame = false;
        button.disabled = false;
        button.textContent = 'Start new game';
      }
    });
  }
  function startWorld(test: boolean): void {
    stopAttractMode();
    gameStarted = true;
    encounterTest = test;
    clearTimeout(shakeTimer);
    document.body.classList.remove('earthquake-shake');
    selectedSpell = null;
    selectTool(test ? 'inspect' : tool);
    seed = test ? 34 : seed + 17;
    simulationTime = 0;
    speed = 1;
    document
      .querySelectorAll<HTMLButtonElement>('[data-speed]')
      .forEach((button) => button.classList.toggle('selected', button.dataset.speed === '1'));
    generateWorld();
    if (paused) togglePause();
    selectTool(tool);
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
    toast(
      test
        ? 'Shared-island combat test: nearby enemies fight. Building and terraforming AI disabled.'
        : 'A new shore. A fresh beginning.',
    );
  }
  const panKeys = new Set<string>();
  const arrowKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const panRight = new THREE.Vector3();
  const panForward = new THREE.Vector3();
  const panOffset = new THREE.Vector3();
  function bindKeyboardControls(): void {
    window.addEventListener('keydown', (event) => {
      if (!gameStarted || newGameMenu.open) return;
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
      if (event.code === 'KeyL' && !event.ctrlKey && !event.metaKey) focusLeaderPole();
      if (event.code === 'KeyE') resetEnemyCamera();
      if (event.code === 'Home') {
        event.preventDefault();
        resetPlayerCamera();
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
    const currentSize = renderer.getSize(new THREE.Vector2());
    if (currentSize.x !== width || currentSize.y !== height) renderer.setSize(width, height, false);
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
    if (!gameStarted) {
      if (attractView && !document.hidden)
        attractView.render(elapsed, world.clientWidth, world.clientHeight);
      return;
    }
    if (newGameMenu.open) return;
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
    const dt = paused || armageddon.finished ? 0 : Math.min(elapsed, 0.05) * speed;
    simulationTime += dt;
    const enemyResidents = settlers.filter(
      (settler) =>
        settler.population === enemyColor &&
        (settler.survival.phase === 'alive' || settler.survival.phase === 'drowning'),
    );
    if (armageddon.active && !armageddon.finished && dt > 0) updateArmageddonLand();
    if (!encounterTest && !armageddon.active) {
      if (
        enemyAI.advance(
          dt,
          surface,
          {
            spend: (amount) =>
              enemyPowerMeter.value - amount >= enemyKnights.reservedPower &&
              enemyPowerMeter.spend(amount),
          },
          enemyResidents,
          tileAt,
          (point) => withinTerrainReach(point, false, enemyResidents, enemyColor, combatPosition),
        )?.status === 'changed'
      )
        refreshTerrainAfterEdit();
      advanceEnemyKnights(dt);
      updateEnemyBuilder();
      advanceEnemySpells(dt);
    }
    let settlementsChanged = false;
    let survivalChanged = !armageddon.active && triggerBuildingContacts(dt);
    combat.match(armageddon.active ? [...armageddon.leaders.values()] : settlers, combatPosition);
    updatePoleCollectors();
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
      if (combat.opponent(settler)) {
        settler.tile = characterTile(settler);
        settler.target = null;
        settler.progress = 0;
        continue;
      }
      const state = settler.population === populationColor ? leadership : enemyLeadership;
      const recoveryGoal = state.droppedTile;
      const recovering =
        !armageddon.active &&
        recoveryGoal !== null &&
        poleCollectors.get(settler.population) === settler;
      if (
        !encounterTest &&
        !armageddon.active &&
        !recovering &&
        !enemyKnights.holds(settler) &&
        !enemyKnights.follows(settler) &&
        !enemyKnightCamp(settler.tile) &&
        settler === enemyBuilder &&
        !settler.target &&
        settler.tile === enemyBuildingSite &&
        !hasNearbyOpponent(settler) &&
        trySettle(settler, surface)
      ) {
        settler.mesh.visible = false;
        settlementsChanged = true;
        continue;
      }
      const finalLeader = armageddon.active && armageddon.isLeader(settler);
      const rallyLeader =
        armageddon.active && !finalLeader ? armageddon.leaders.get(settler.population) : null;
      const enemyMusterFollower = !armageddon.active && enemyKnights.follows(settler);
      const enemyMusterLeader = !armageddon.active && enemyKnights.holds(settler);
      const gatheringFollower =
        enemyMusterFollower ||
        (!armageddon.active &&
          leadership.rallying &&
          settler.population === populationColor &&
          settler !== leadership.leader);
      const attacking = attackOrder.commands(settler, populationColor);
      const anchoredLeader =
        !attacking && leaderAnchor.target !== null && settler === leadership.leader;
      const enemy = armageddon.active
        ? finalLeader
          ? (armageddon.leaders.get(settler.population === 'red' ? 'blue' : 'red') ?? null)
          : null
        : attacking ||
            (settler.knight && !anchoredLeader && !gatheringFollower && !enemyMusterLeader)
          ? nearestEnemy(settler, settlers, characterTile)
          : null;
      if (!settler.target) {
        settler.wait -= dt;
        if (
          recovering ||
          gatheringFollower ||
          enemyMusterLeader ||
          armageddon.active ||
          enemy ||
          attacking ||
          anchoredLeader ||
          settler === enemyBuilder
        )
          settler.wait = 0;
        if (settler.wait > 0) continue;
        let options =
          recovering && recoveryGoal
            ? poleRecoveryOptions(settler, recoveryGoal)
            : armageddon.active
              ? rallyLeader
                ? pursuitOptions(settler, rallyLeader)
                : enemy
                  ? pursuitOptions(settler, enemy)
                  : []
              : enemyMusterLeader
                ? []
                : gatheringFollower
                  ? enemyMusterFollower && enemyLeadership.leader
                    ? pursuitOptions(settler, enemyLeadership.leader)
                    : followerOptions(settler)
                  : anchoredLeader
                    ? leaderAnchor.steps(
                        settler,
                        settler.tile,
                        neighbors,
                        isWalkable,
                        navigationRevision,
                      )
                    : enemy
                      ? pursuitOptions(settler, enemy)
                      : attacking
                        ? []
                        : settler === enemyBuilder
                          ? rallySteps(settler.tile, neighbors(settler.tile), enemyBuildDistance)
                          : neighbors(settler.tile);
        if (encounterTest && !armageddon.active) {
          const free = unoccupiedWalkSteps(
            settler,
            options,
            settlers.filter(
              (other) => other.survival.phase === 'alive' || other.survival.phase === 'drowning',
            ),
          );
          options = options.filter(
            (tile) => free.includes(tile) || (recovering && tile === recoveryGoal),
          );
        }
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
      settler.progress = Math.min(
        1,
        settler.progress + dt * 0.65 * armageddon.movementMultiplier(settler),
      );
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
        if (
          !encounterTest &&
          !armageddon.active &&
          !settler.knight &&
          !recovering &&
          !enemyKnights.holds(settler) &&
          !enemyKnights.follows(settler) &&
          !(settler.population === enemyColor && enemyKnightCamp(settler.tile)) &&
          !attackOrder.commands(settler, populationColor) &&
          !(leaderAnchor.target && settler === leadership.leader) &&
          !hasNearbyOpponent(settler) &&
          (!leadership.rallying || settler.population !== populationColor) &&
          (settler.population !== enemyColor ||
            (!enemyAI.blocksSettlement(settler.tile) &&
              (settler !== enemyBuilder || settler.tile === enemyBuildingSite))) &&
          trySettle(settler, surface)
        ) {
          settler.mesh.visible = false;
          settlementsChanged = true;
        }
      }
    }
    for (const defeated of combat.advance(dt)) {
      if (defeated.home) settlementsChanged = true;
      const wet =
        !defeated.home &&
        surface.sample(defeated.mesh.position.x + SIZE / 2, defeated.mesh.position.z + SIZE / 2) <=
          SEA;
      defeated.survival.phase = wet ? 'sinking' : 'dead';
      defeated.survival.elapsed = 0;
      defeated.target = null;
      renderSurvival(defeated);
      survivalChanged = true;
    }
    finishArmageddon();
    if (settlementsChanged) {
      navigationRevision++;
      reconcileWorldSettlements();
      rebuildBuildings();
      syncResidentMeshes();
      updateSettlementStats();
      if (lastPointer) updateHover(lastPointer);
    }
    updateCombatVisuals(dt);
    if (resolveLeadership()) survivalChanged = true;
    for (let i = settlers.length - 1; i >= 0; i--) {
      if (settlers[i].survival.phase !== 'dead') continue;
      people.remove(settlers[i].mesh);
      pursuitRoutes.delete(settlers[i]);
      disposeSettlerVisual(settlers[i]);
      settlers.splice(i, 1);
      survivalChanged = true;
    }
    combatHudElapsed += dt;
    if (survivalChanged || (combat.pairs.length > 0 && combatHudElapsed >= 0.15)) {
      combatHudElapsed = 0;
      updateSettlementStats();
      if (lastPointer) updateHover(lastPointer);
    }
    const births =
      encounterTest || armageddon.active
        ? []
        : growPopulation(
            settlers.filter((settler) => !combat.opponent(settler)),
            dt,
            findBirthTile,
            BIRTH_THRESHOLD,
            (resident) => !(leadership.rallying && resident === leadership.leader),
          );
    for (const birth of births)
      createSettler(birth.tile, birth.characterPower, birth.population ?? populationColor).wait = 0;
    if (births.length) {
      updateSettlementStats();
      if (lastPointer) updateHover(lastPointer);
    }
    swampTime.value = simulationTime;
    animateSheep(dt);
    spawnSheep(dt);
    animateWaterTextures(waterTextures, simulationTime);
    const playerResidents = settlers.filter((settler) => settler.population === populationColor);
    const blueResidents = settlers.filter((settler) => settler.population === enemyColor);
    powerMeter.advance(
      dt,
      totalBuildingPower(playerResidents, 'normal'),
      totalBuildingPower(playerResidents, 'rock'),
    );
    enemyPowerMeter.advance(
      dt,
      totalBuildingPower(blueResidents, 'normal'),
      totalBuildingPower(blueResidents, 'rock'),
    );
    updatePowerDisplay();
    updateAnchorMarker();
    updateLeadershipVisual();
    updateRallyButton();
    updateEnemyStatus();
    controls.update();
    const viewChanged = updateVisibleTerrain();
    updateMinimap();
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
  bindTerrainInput();
  bindSpellControls();
  bindSimulationControls();
  bindKeyboardControls();
  bindNewGameMenu();
  startAttractMode();
  openNewGameMenu();
  startRendering();
}

startGame();
