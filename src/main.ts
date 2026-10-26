import './style.css';
import { TerrainSurface } from './terrain-surface';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

type Tool = 'raise' | 'lower' | 'inspect';
interface Tile { x: number; z: number; height: number; tree: boolean; house: boolean }
interface Settler { mesh: THREE.Group; tile: Tile; target: Tile | null; progress: number; wait: number; phase: number; legs: THREE.Mesh[] }

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing element: ${selector}`);
  return result;
}
const icons: Record<string, string> = {
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
  mountain: '<path d="m2 19 7-13 5 8 3-5 5 10ZM6 12l3 2 3-2"/>',
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
document.querySelectorAll<HTMLElement>('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon ?? ''); });

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
controls.maxZoom = 3;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
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
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
sun.shadow.normalBias = 0.06;
sun.shadow.bias = -0.0005;
sun.shadow.radius = 3;
scene.add(sun);

const SIZE = 38;
const STEP = 0.42;
const SEA = 0.08;
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
const terrain = new THREE.Group();
const scenery = new THREE.Group();
const people = new THREE.Group();
scene.add(terrain, scenery, people);
const sandColor = new THREE.Color('#d6c391');
const grassColors = ['#9eb778', '#8eae6f', '#82a564', '#769d5b', '#6c9357', '#71965d', '#819f6d'].map(c => new THREE.Color(c));
const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
let ground: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
let surface: TerrainSurface;
const tempColor = new THREE.Color();
const treeTrunk = new THREE.MeshStandardMaterial({ color: '#796e48', roughness: 1 });
const foliage = ['#3f7556', '#4e8057', '#64874f', '#5a8051'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.075, 0.6, 5);
const leafGeometry = new THREE.ConeGeometry(0.44, 1.2, 5);
const rockGeometry = new THREE.IcosahedronGeometry(0.24, 0);
const rockMaterial = new THREE.MeshStandardMaterial({ color: '#a6af94', roughness: 1 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: '#f0dfb7', roughness: 1 });
const roofMaterials = ['#ad6548', '#bd7950', '#8b6650'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
const darkMaterial = new THREE.MeshStandardMaterial({ color: '#645c42', roughness: 1 });
const pathMaterial = new THREE.MeshStandardMaterial({ color: '#b5ac79', roughness: 1 });
const houseGeometry = new THREE.BoxGeometry(0.62, 0.48, 0.58);
// A triangular prism roof, its ridge runs along the z axis.
const roofShape = new THREE.Shape();
roofShape.moveTo(-0.4, 0); roofShape.lineTo(0, 0.37); roofShape.lineTo(0.4, 0); roofShape.closePath();
const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: 0.78, bevelEnabled: false });
roofGeometry.translate(0, 0, -0.39);
const doorGeometry = new THREE.BoxGeometry(0.13, 0.25, 0.02);
const chimneyGeometry = new THREE.BoxGeometry(0.1, 0.32, 0.12);
const pathGeometry = new THREE.PlaneGeometry(0.42, 0.92);
function tileAt(x: number, z: number): Tile | undefined {
  if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return undefined;
  return tiles[z * SIZE + x];
}
function position(tile: Tile): THREE.Vector3 {
  return new THREE.Vector3(tile.x - SIZE / 2 + 0.5, tile.height * STEP, tile.z - SIZE / 2 + 0.5);
}
function neighbors(tile: Tile): Tile[] {
  const result: Tile[] = [];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const next = tileAt(tile.x + dx, tile.z + dz);
    if (next && next.height > 0 && Math.abs(next.height - tile.height) <= 1 && !next.tree && !next.house) result.push(next);
  }
  return result;
}
function addTree(tile: Tile): void {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeometry, treeTrunk);
  trunk.position.y = 0.27;
  const material = foliage[Math.floor(random() * foliage.length)];
  const crown = new THREE.Mesh(leafGeometry, material);
  crown.position.y = 0.95;
  const crown2 = new THREE.Mesh(leafGeometry, material);
  crown2.scale.setScalar(0.77); crown2.position.y = 1.42;
  group.add(trunk, crown, crown2);
  group.position.copy(position(tile));
  group.position.x += (random() - 0.5) * 0.28;
  group.position.z += (random() - 0.5) * 0.28;
  group.position.y = surface.sample(group.position.x + SIZE / 2, group.position.z + SIZE / 2);
  group.rotation.y = random() * Math.PI;
  group.scale.setScalar(0.65 + random() * 0.35);
  group.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
  scenery.add(group);
}
function addHouse(tile: Tile): void {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(houseGeometry, wallMaterial);
  walls.position.y = 0.24;
  const roof = new THREE.Mesh(roofGeometry, roofMaterials[Math.floor(random() * roofMaterials.length)]);
  roof.position.y = 0.46;
  const door = new THREE.Mesh(doorGeometry, darkMaterial);
  door.position.set(0.08, 0.125, 0.3);
  const chimney = new THREE.Mesh(chimneyGeometry, wallMaterial);
  chimney.position.set(-0.2, 0.72, -0.15);
  group.add(walls, roof, door, chimney);
  group.position.copy(position(tile));
  const footprint = [-0.4, 0.4].flatMap(dx => [-0.4, 0.4].map(dz => surface.sample(tile.x + 0.5 + dx, tile.z + 0.5 + dz)));
  const floor = Math.max(tile.height * STEP, ...footprint) + 0.01;
  const foundationDepth = floor - Math.min(...footprint) + 0.04;
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(0.64, foundationDepth, 0.6), wallMaterial);
  foundation.userData.ownedGeometry = true;
  foundation.position.y = -foundationDepth / 2;
  group.add(foundation);
  group.position.y = floor;
  group.rotation.y = Math.floor(hash(tile.x, tile.z) * 4) * Math.PI / 2;
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  scenery.add(group);
}
function rebuild(): void {
  if (ground) { terrain.remove(ground); ground.geometry.dispose(); }
  scenery.traverse(object => {
    if (object.userData.ownedGeometry && object instanceof THREE.Mesh) object.geometry.dispose();
  });
  scenery.clear();
  surface = new TerrainSurface(SIZE, tiles, STEP);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions(), 3));
  const colors = new Float32Array(tiles.length * 12 * 3);
  ground = new THREE.Mesh(geometry, groundMaterial);
  ground.castShadow = true;
  ground.receiveShadow = true;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    tempColor.copy(tile.height <= 1 ? sandColor : grassColors[Math.min(tile.height - 2, grassColors.length - 1)]);
    tempColor.multiplyScalar(0.95 + hash(tile.x, tile.z) * 0.1);
    for (let vertex = 0; vertex < 12; vertex++) tempColor.toArray(colors, (i * 12 + vertex) * 3);
    if (tile.height > 1) {
      if (tile.house) addHouse(tile);
      else if (tile.tree) addTree(tile);
      else if (hash(tile.x + 60, tile.z) > 0.967) {
        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        rock.position.copy(position(tile)); rock.position.y += 0.09;
        rock.scale.set(1, 0.7, 0.9); rock.rotation.y = hash(tile.x, tile.z) * 6;
        rock.castShadow = true;
        scenery.add(rock);
      } else if (tile.height === 2 && hash(tile.x + 90, tile.z) > 0.75) {
        const path = new THREE.Mesh(pathGeometry, pathMaterial);
        path.geometry = pathGeometry.clone();
        path.userData.ownedGeometry = true;
        path.rotation.x = -Math.PI / 2; path.position.copy(position(tile));
        const vertices = path.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          const y = surface.sample(tile.x + 0.5 + vertices.getX(i), tile.z + 0.5 - vertices.getY(i));
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
  element('#land-count').innerHTML = `${tiles.filter(t => t.height > 0).length} <small>tiles</small>`;
}

const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: '#659e95', roughness: 1, metalness: 0 }));
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
const waveMaterial = new THREE.LineBasicMaterial({ color: '#e3eed6', transparent: true, opacity: 0.25, depthWrite: false });
const waves = new THREE.LineSegments(waveGeometry, waveMaterial);
scene.add(waves);

const settlers: Settler[] = [];
const skinMaterial = new THREE.MeshStandardMaterial({ color: '#e3bb8b', roughness: 1 });
const hairMaterial = new THREE.MeshStandardMaterial({ color: '#685139', roughness: 1 });
const trouserMaterial = new THREE.MeshStandardMaterial({ color: '#54665a', roughness: 1 });
const shirtMaterials = ['#e8dfb5', '#c56c4b', '#d3a958', '#608a92', '#e2d7b8'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
const bodyGeometry = new THREE.BoxGeometry(0.17, 0.21, 0.12);
const headGeometry = new THREE.BoxGeometry(0.135, 0.14, 0.13);
const hairGeometry = new THREE.BoxGeometry(0.145, 0.055, 0.14);
const limbGeometry = new THREE.BoxGeometry(0.055, 0.16, 0.065);
function spawnSettlers(): void {
  people.clear(); settlers.length = 0;
  const walkable = tiles.filter(t => t.height > 1 && !t.tree && !t.house && neighbors(t).length > 0);
  for (let i = 0; i < Math.min(24, walkable.length); i++) {
    const tile = walkable[Math.floor(random() * walkable.length)];
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, shirtMaterials[i % shirtMaterials.length]); body.position.y = 0.25;
    const head = new THREE.Mesh(headGeometry, skinMaterial); head.position.y = 0.425;
    const hair = new THREE.Mesh(hairGeometry, hairMaterial); hair.position.set(0, 0.49, -0.01);
    const legs: THREE.Mesh[] = [];
    for (const sign of [-1, 1]) {
      const leg = new THREE.Mesh(limbGeometry, trouserMaterial); leg.position.set(sign * 0.05, 0.085, 0);
      const arm = new THREE.Mesh(limbGeometry, skinMaterial); arm.position.set(sign * 0.115, 0.25, 0);
      legs.push(leg, arm); mesh.add(leg, arm);
    }
    mesh.add(body, head, hair);
    mesh.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    mesh.position.copy(position(tile)); mesh.scale.setScalar(1.15);
    people.add(mesh);
    settlers.push({ mesh, tile, target: null, progress: 0, wait: random() * 3, phase: random() * 6, legs });
  }
  element('#population').innerHTML = `${settlers.length} <small>settlers</small>`;
}
function generateWorld(): void {
  randomState = seed;
  tiles.length = 0;
  const offset = seed === 34 ? 0 : hash(seed, seed) * 10;
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x - SIZE / 2; const pz = z - SIZE / 2;
      const ripple = Math.sin(px * 0.55 + offset) * 0.85 + Math.sin(pz * 0.65 + px * 0.25) * 0.65;
      const main = 1 - Math.sqrt(((px + 1.5) / 13.5) ** 2 + ((pz + 1) / 10.5) ** 2);
      const hill = 2.8 * Math.exp(-((px + 4) ** 2 + (pz + 3) ** 2) / 35);
      const small = 1 - Math.sqrt(((px - 11) / 4.7) ** 2 + ((pz - 8) / 5) ** 2);
      let height = Math.max(0, Math.floor(main * 5 + ripple + hill));
      height = Math.max(height, Math.max(0, Math.floor(small * 4 + 0.5)));
      const tree = height > 2 && hash(x, z) > 0.67;
      const house = height >= 2 && height <= 4 && hash(x + 40, z) > 0.955 && !tree;
      tiles.push({ x, z, height, tree, house });
    }
  }
  rebuild(); spawnSettlers();
}
generateWorld();

// Highlight the exact grid cell under the pointer, including submerged cells.
const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-0.49, 0, -0.49), new THREE.Vector3(0.49, 0, -0.49),
  new THREE.Vector3(0.49, 0, 0.49), new THREE.Vector3(-0.49, 0, 0.49), new THREE.Vector3(-0.49, 0, -0.49),
]);
const outlineMaterial = new THREE.LineBasicMaterial({ color: '#fff8d7', depthTest: false });
const outline = new THREE.Line(outlineGeometry, outlineMaterial);
outline.renderOrder = 10; outline.visible = false;
scene.add(outline);
// Tint every triangle of the hovered land tile, preserving the terrain underneath.
const hoverGeometry = new THREE.BufferGeometry();
hoverGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3));
const hoverMaterial = new THREE.MeshStandardMaterial({
  color: '#8c1e28', emissive: '#b32432', emissiveIntensity: 0.65, roughness: 1,
  transparent: true, opacity: 0, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const hoverGlow = new THREE.Mesh(hoverGeometry, hoverMaterial);
hoverGlow.visible = false;
hoverGlow.renderOrder = 5;
scene.add(hoverGlow);
let glowingTile: Tile | null = null;
let hoverStrength = 0;
let hoverTarget = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered: Tile | null = null;
let tool: Tool = 'raise';
let pointerDown = { x: 0, y: 0 };
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string): void {
  const node = element('#toast'); node.textContent = message; node.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 2800);
}
function updateHover(event: PointerEvent): void {
  const bounds = canvas.getBoundingClientRect();
  pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects([ground, water])[0];
  hovered = hit?.object === ground && hit.faceIndex != null
    ? tiles[Math.floor(hit.faceIndex / 4)]
    : hit ? tileAt(Math.floor(hit.point.x + SIZE / 2), Math.floor(hit.point.z + SIZE / 2)) ?? null : null;
  outline.visible = hovered !== null;
  const landTile = hovered && hovered.height > 0 ? hovered : null;
  hoverTarget = landTile ? 1 : 0;
  if (landTile && landTile !== glowingTile) {
    glowingTile = landTile;
    hoverStrength = 0;
    hoverMaterial.opacity = 0;
  }
  if (landTile) hoverGlow.visible = true;
  if (hovered && landTile) {
    const tileIndex = hovered.z * SIZE + hovered.x;
    const source = ground.geometry.getAttribute('position');
    const target = hoverGeometry.getAttribute('position');
    for (let i = 0; i < target.count; i++) {
      const vertex = tileIndex * 12 + i;
      target.setXYZ(i, source.getX(vertex), source.getY(vertex), source.getZ(vertex));
    }
    target.needsUpdate = true;
    hoverGeometry.computeVertexNormals();
    hoverGeometry.computeBoundingSphere();
  }
  if (hovered) {
    outline.position.set(hovered.x - SIZE / 2 + 0.5, 0, hovered.z - SIZE / 2 + 0.5);
    const vertices = outlineGeometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = outline.position.x + vertices.getX(i);
      const z = outline.position.z + vertices.getZ(i);
      vertices.setY(i, Math.max(SEA, surface.sample(x + SIZE / 2, z + SIZE / 2)) + 0.025);
    }
    vertices.needsUpdate = true;
    outlineGeometry.computeBoundingSphere();
    outlineMaterial.color.set(tool === 'lower' ? '#e8ad85' : '#fff6cc');
  }
  const info = element('#tile-info');
  info.hidden = tool !== 'inspect' || !hovered;
  if (hovered && tool === 'inspect') {
    const kind = hovered.height === 0 ? 'Open water' : hovered.house ? 'A settler’s cottage' : hovered.tree ? 'Woodland' : hovered.height === 1 ? 'Sandy shore' : 'Grassy highlands';
    const visitors = settlers.filter(s => s.tile === hovered).length;
    info.innerHTML = `<strong>${kind}</strong>Elevation ${hovered.height} · Tile ${hovered.x}, ${hovered.z}<br>${visitors ? `${visitors} settler${visitors > 1 ? 's' : ''} here` : hovered.height === 0 ? 'Raise this tile to create land.' : 'A little room for life.'}`;
  }
  canvas.style.cursor = hovered ? (tool === 'inspect' ? 'help' : 'crosshair') : 'grab';
}
canvas.addEventListener('pointermove', updateHover);
canvas.addEventListener('pointerleave', () => {
  outline.visible = false; hoverTarget = 0; hovered = null;
  element('#tile-info').hidden = true;
});
canvas.addEventListener('pointerdown', event => { pointerDown = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('pointerup', event => {
  if ((event.button !== 0 && event.button !== 2) || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) return;
  updateHover(event);
  if (!hovered) return;
  // Mouse buttons directly choose elevation; touch keeps the selected toolbar tool.
  const action = event.pointerType === 'touch' ? tool : event.button === 2 ? 'lower' : 'raise';
  if (action === 'inspect') return;
  selectTool(action);
  if (action === 'raise' && hovered.height >= 8) { toast('This is as close to the sky as we can go.'); return; }
  if (action === 'lower' && hovered.height === 0) { toast('Already at sea level. Try raising a new shore.'); return; }
  hovered.height += action === 'raise' ? 1 : -1;
  hovered.tree = false; hovered.house = false;
  rebuild();
  // Redirect anyone whose path was interrupted. Never leave a settler underwater.
  for (const settler of settlers) {
    if (settler.tile === hovered || settler.target === hovered) {
      settler.target = null; settler.progress = 0;
      if (settler.tile.height === 0) {
        const dry = tiles.filter(t => t.height > 0 && !t.tree && !t.house);
        dry.sort((a, b) => (a.x - settler.tile.x) ** 2 + (a.z - settler.tile.z) ** 2 - (b.x - settler.tile.x) ** 2 - (b.z - settler.tile.z) ** 2);
        if (dry[0]) settler.tile = dry[0];
      }
      settler.mesh.position.copy(position(settler.tile));
      settler.mesh.visible = settler.tile.height > 0;
    }
    // Editing a neighbor also changes shared corners, even while paused.
    settler.mesh.position.y = surface.sample(settler.mesh.position.x + SIZE / 2, settler.mesh.position.z + SIZE / 2);
  }
  updateHover(event);
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
function selectTool(next: Tool): void {
  tool = next;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
    const active = button.dataset.tool === next;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  const hints: Record<Tool, [string, string]> = {
    raise: ['Raise land', 'Left-click to raise · Right-click to lower'],
    lower: ['Lower land', 'Left-click to raise · Right-click to lower'],
    inspect: ['Explore your world', 'Hover a tile to discover what lives there'],
  };
  element('#tool-hint').innerHTML = `<strong>${hints[next][0]}</strong><span class="hint-detail">${hints[next][1]}</span>`;
  element('#tile-info').hidden = true;
}
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
  button.addEventListener('click', () => selectTool(button.dataset.tool as Tool));
});
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
element('#pause').addEventListener('click', togglePause);
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => {
  button.addEventListener('click', () => {
    speed = Number(button.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach(node => node.classList.toggle('selected', node === button));
  });
});
element('#reset-view').addEventListener('click', resetCamera);
element('#new-world').addEventListener('click', () => {
  seed += 17; simulationTime = 0; generateWorld(); resetCamera();
  hovered = null; glowingTile = null; hoverStrength = 0; hoverTarget = 0;
  hoverMaterial.opacity = 0; outline.visible = false; hoverGlow.visible = false;
  element('#tile-info').hidden = true;
  toast('A new shore. A fresh beginning.');
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement && event.code === 'Space') return;
  if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  if (event.key === '1') selectTool('raise');
  if (event.key === '2') selectTool('lower');
  if (event.key === '3') selectTool('inspect');
});

function resize(): void {
  const width = world.clientWidth; const height = world.clientHeight;
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const viewHeight = aspect < 1 ? 47 : 36;
  camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(world);
resize();
const clock = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const elapsed = clock.getDelta();
  // Real-time easing keeps feedback responsive even when the simulation is paused.
  hoverStrength = THREE.MathUtils.lerp(hoverStrength, hoverTarget, 1 - Math.exp(-8 * Math.min(elapsed, 0.1)));
  hoverMaterial.opacity = hoverStrength * 0.68;
  if (hoverTarget === 0 && hoverStrength < 0.005) {
    hoverGlow.visible = false;
    glowingTile = null;
  }
  const dt = paused ? 0 : Math.min(elapsed, 0.05) * speed;
  simulationTime += dt;
  for (const settler of settlers) {
    if (!dt) continue;
    if (!settler.target) {
      settler.wait -= dt;
      if (settler.wait > 0) continue;
      const options = neighbors(settler.tile);
      if (!options.length) { settler.wait = 1; continue; }
      settler.target = options[Math.floor(random() * options.length)];
      settler.progress = 0;
      settler.mesh.rotation.y = Math.atan2(settler.target.x - settler.tile.x, settler.target.z - settler.tile.z);
    }
    settler.progress = Math.min(1, settler.progress + dt * 0.65);
    const from = position(settler.tile); const to = position(settler.target);
    settler.mesh.position.lerpVectors(from, to, settler.progress);
    settler.mesh.position.y = surface.sample(settler.mesh.position.x + SIZE / 2, settler.mesh.position.z + SIZE / 2)
      + Math.abs(Math.sin(settler.progress * Math.PI * 4)) * 0.035;
    for (let i = 0; i < settler.legs.length; i++) {
      settler.legs[i].rotation.x = Math.sin(simulationTime * 9 + settler.phase) * (i < 2 ? 0.45 : -0.45);
    }
    if (settler.progress >= 1) {
      settler.tile = settler.target; settler.target = null;
      settler.wait = random() < 0.2 ? random() * 3 : 0;
      settler.legs.forEach(leg => { leg.rotation.x = 0; });
    }
  }
  waves.position.x = Math.sin(simulationTime * 0.15) * 0.4;
  waves.position.z = Math.cos(simulationTime * 0.1) * 0.3;
  waveMaterial.opacity = 0.2 + Math.sin(simulationTime * 0.7) * 0.045;
  const day = Math.floor(simulationTime / 120) + 1;
  const timeOfDay = simulationTime % 120 < 40 ? 'morning' : simulationTime % 120 < 85 ? 'afternoon' : 'evening';
  element('#day').innerHTML = `Day ${day} <small>· ${timeOfDay}</small>`;
  controls.update();
  const direction = camera.position.clone().sub(controls.target);
  element<HTMLElement>('.compass svg').style.transform = `rotate(${-Math.atan2(direction.x, direction.z) * 180 / Math.PI}deg)`;
  renderer.render(scene, camera);
}
animate();
requestAnimationFrame(() => element('#loading').classList.add('done'));
