import * as THREE from 'three';
import { AttractSimulation } from './attract-simulation';
import { createWaterTextures, animateWaterTextures } from './water-texture';

export interface AttractView {
  readonly simulation: AttractSimulation;
  render(seconds: number, width: number, height: number): void;
  dispose(): void;
}

/** Lightweight instanced presentation of the real headless game, sharing the existing WebGL renderer. */
export function createAttractView(
  renderer: THREE.WebGLRenderer,
  reducedMotion = false,
): AttractView {
  const simulation = new AttractSimulation(reducedMotion);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8bb9aa');
  scene.fog = new THREE.Fog('#8bb9aa', 100, 230);
  const camera = new THREE.OrthographicCamera(-40, 40, 28, -28, 0.1, 300);
  camera.position.set(65, 70, 65);
  camera.lookAt(0, 1.5, 0);
  scene.add(new THREE.HemisphereLight('#fff6d7', '#567b65', 2.1));
  const sun = new THREE.DirectionalLight('#fff7dc', 3.1);
  sun.position.set(-30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.far = 180;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    instances: THREE.InstancedMesh[] = [];
  function geometry<T extends THREE.BufferGeometry>(value: T): T {
    geometries.add(value);
    return value;
  }
  function material<T extends THREE.Material>(value: T): T {
    materials.add(value);
    return value;
  }
  const box = geometry(new THREE.BoxGeometry(1, 1, 1)),
    sphere = geometry(new THREE.SphereGeometry(1, 8, 6)),
    cone = geometry(new THREE.ConeGeometry(1, 1, 4)),
    pine = geometry(new THREE.ConeGeometry(1, 1, 7));
  const skin = material(new THREE.MeshStandardMaterial({ color: '#e6b98b', roughness: 0.8 }));
  const dark = material(new THREE.MeshStandardMaterial({ color: '#39483f', roughness: 0.9 }));
  const red = material(new THREE.MeshStandardMaterial({ color: '#d33136', roughness: 0.8 }));
  const blue = material(new THREE.MeshStandardMaterial({ color: '#2d64d6', roughness: 0.8 }));
  const armor = material(
    new THREE.MeshStandardMaterial({ color: '#dce5e4', roughness: 0.19, metalness: 0.8 }),
  );
  const cream = material(new THREE.MeshStandardMaterial({ color: '#f3e5be', roughness: 0.9 }));
  const white = material(new THREE.MeshStandardMaterial({ color: '#fffdeb', roughness: 0.5 }));
  const wood = material(new THREE.MeshStandardMaterial({ color: '#826c49', roughness: 0.9 }));
  const leaves = material(new THREE.MeshStandardMaterial({ color: '#3f7756', roughness: 1 }));
  function instanced(
    shape: THREE.BufferGeometry,
    paint: THREE.Material,
    count = 512,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(shape, paint, count);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    instances.push(mesh);
    scene.add(mesh);
    return mesh;
  }
  const shirts = [instanced(box, red), instanced(box, blue)],
    heads = instanced(sphere, skin),
    legs = instanced(box, dark, 1024),
    silver = instanced(box, armor),
    helmets = instanced(sphere, armor);
  const flags = [instanced(box, red, 1024), instanced(box, blue, 1024)],
    posts = instanced(box, wood, 1024),
    poles = instanced(sphere, white, 8);
  const walls = instanced(box, cream),
    roofs = [instanced(cone, red), instanced(cone, blue)],
    towers = instanced(box, cream, 2048);
  const trunks = instanced(box, wood, 512),
    crowns = instanced(pine, leaves, 512);
  const terrainMaterial = material(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  );
  const terrain = new THREE.Mesh(geometry(new THREE.BufferGeometry()), terrainMaterial);
  terrain.receiveShadow = true;
  scene.add(terrain);
  const textures = createWaterTextures(192, renderer.capabilities.getMaxAnisotropy(), 128);
  const water = new THREE.Mesh(
    geometry(new THREE.PlaneGeometry(192, 192)),
    material(
      new THREE.MeshStandardMaterial({
        map: textures.map,
        normalMap: textures.normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 0.8,
        metalness: 0.05,
      }),
    ),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.08;
  water.receiveShadow = true;
  scene.add(water);
  const palette = [
    '#bca171',
    '#d4b573',
    '#9bbd4b',
    '#629d3e',
    '#347c40',
    '#205e46',
    '#53675a',
    '#8c9080',
    '#a9b3aa',
    '#d0d9cc',
    '#edf0df',
    '#f4f5e8',
    '#fafbf2',
    '#fffdf6',
    '#ffffff',
  ].map((value) => new THREE.Color(value));
  const rock = new THREE.Color('#6b7278'),
    swamp = new THREE.Color('#647d3e'),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  terrain.name = 'attract-terrain';
  water.name = 'attract-water';
  shirts[0].name = 'attract-red-settlers';
  shirts[1].name = 'attract-blue-settlers';
  walls.name = 'attract-homes';
  silver.name = 'attract-knights';
  const targetPosition = new THREE.Vector3();
  const positions = new Map<number, THREE.Vector3>();
  let round = 0,
    terrainTag = '',
    treeElapsed = 1,
    visualTime = 0,
    disposed = false;
  let previousPaused = false,
    previousWidth = 0,
    previousHeight = 0;
  function put(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation = 0,
  ): void {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  function rebuildTerrain(): void {
    const game = simulation.game,
      surface = game.surface,
      points = surface.positions(),
      colors = new Float32Array(points.length);
    for (let i = 0; i < points.length; i += 3) {
      const tile = game.tiles[Math.floor(i / 18)],
        height = points[i + 1] / surface.step,
        low = Math.max(0, Math.min(14, Math.floor(height))),
        high = Math.min(14, low + 1);
      color.copy(palette[low]).lerp(palette[high], height - low);
      if (tile.rock) color.lerp(rock, 0.8);
      else if (tile.swamp) color.lerp(swamp, 0.8);
      color.toArray(colors, i);
    }
    geometries.delete(terrain.geometry);
    terrain.geometry.dispose();
    terrain.geometry = geometry(new THREE.BufferGeometry());
    terrain.geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
    terrain.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrain.geometry.computeVertexNormals();
  }
  function rebuildTrees(): void {
    let count = 0;
    const game = simulation.game,
      half = game.options.size / 2;
    for (const tile of game.tiles) {
      if (
        !tile.tree ||
        tile.house ||
        tile.reserved ||
        game.surface.sample(tile.x + 0.5, tile.z + 0.5) <= 0.08 ||
        count >= 512
      )
        continue;
      const x = tile.x + 0.5 - half,
        z = tile.z + 0.5 - half,
        y = game.surface.sample(tile.x + 0.5, tile.z + 0.5),
        scale = 0.8 + ((tile.index * 17) % 13) / 20;
      put(trunks, count, x, y + 0.35 * scale, z, 0.14 * scale, 0.7 * scale, 0.14 * scale);
      put(crowns, count, x, y + 1.05 * scale, z, 0.57 * scale, 1.5 * scale, 0.57 * scale);
      count++;
    }
    trunks.count = crowns.count = count;
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
  }
  function updatePeople(dt: number): void {
    const game = simulation.game,
      half = game.options.size / 2,
      seen = new Set<number>(),
      shirtCount = [0, 0],
      flagCount = [0, 0],
      roofCount = [0, 0];
    let headCount = 0,
      legCount = 0,
      armorCount = 0,
      houseCount = 0,
      towerCount = 0,
      postCount = 0,
      poleCount = 0;
    const alpha = 1 - Math.exp(-18 * dt);
    for (const person of game.people) {
      if (
        person.characterPower <= 0 ||
        person.survival.phase === 'dead' ||
        person.survival.phase === 'sinking'
      )
        continue;
      const side = person.population === 'red' ? 0 : 1,
        leader = game.sides[side].leader.leader === person;
      const worldX = person.home ? person.home.x + 0.5 : person.x,
        worldZ = person.home ? person.home.z + 0.5 : person.z;
      const y = game.surface.sample(worldX, worldZ),
        x = worldX - half,
        z = worldZ - half;
      if (person.home) {
        if (houseCount >= 512) continue;
        const castle = person.power === 5,
          width = castle ? 2.7 : 0.8,
          height = castle ? 0.8 : 0.55;
        put(walls, houseCount++, x, y + height / 2, z, width, height, width);
        put(
          roofs[side],
          roofCount[side]++,
          x,
          y + height + 0.2,
          z,
          width * 0.8,
          0.5,
          width * 0.8,
          Math.PI / 4,
        );
        if (castle)
          for (const dx of [-1.05, 1.05])
            for (const dz of [-1.05, 1.05])
              put(towers, towerCount++, x + dx, y + 0.58, z + dz, 0.45, 1.16, 0.45);
        put(posts, postCount++, x + 0.18, y + height + 0.65, z, 0.035, 0.7, 0.035);
        put(flags[side], flagCount[side]++, x + 0.35, y + height + 0.82, z, 0.32, 0.22, 0.035);
        if (leader && poleCount < 8)
          put(poles, poleCount++, x, y + height + 1.05, z, 0.16, 0.16, 0.16);
        continue;
      }
      if (headCount + armorCount >= 512) continue;
      seen.add(person.id);
      let position = positions.get(person.id);
      if (!position) {
        position = new THREE.Vector3(x, y, z);
        positions.set(person.id, position);
      } else position.lerp(targetPosition.set(x, y, z), alpha);
      const scale = person.knight ? 1.7 : 1.3,
        px = position.x,
        py = Math.max(0.08, position.y),
        pz = position.z;
      const rotation = person.target
        ? Math.atan2(person.target.x - person.tile.x, person.target.z - person.tile.z)
        : 0;
      const swing = person.target ? Math.sin(visualTime * 8 + person.id) * 0.09 : 0;
      put(
        legs,
        legCount++,
        px - 0.1 * scale,
        py + 0.15 * scale,
        pz + swing,
        0.12 * scale,
        0.3 * scale,
        0.13 * scale,
        rotation,
      );
      put(
        legs,
        legCount++,
        px + 0.1 * scale,
        py + 0.15 * scale,
        pz - swing,
        0.12 * scale,
        0.3 * scale,
        0.13 * scale,
        rotation,
      );
      if (person.knight) {
        put(
          silver,
          armorCount,
          px,
          py + 0.44 * scale,
          pz,
          0.38 * scale,
          0.35 * scale,
          0.24 * scale,
          rotation,
        );
        put(
          helmets,
          armorCount++,
          px,
          py + 0.73 * scale,
          pz,
          0.18 * scale,
          0.19 * scale,
          0.17 * scale,
        );
        put(
          flags[side],
          flagCount[side]++,
          px - 0.25,
          py + 0.65 * scale,
          pz,
          0.21,
          0.25,
          0.045,
          rotation,
        );
      } else {
        put(
          shirts[side],
          shirtCount[side]++,
          px,
          py + 0.44 * scale,
          pz,
          0.32 * scale,
          0.32 * scale,
          0.22 * scale,
          rotation,
        );
        put(
          heads,
          headCount++,
          px,
          py + 0.71 * scale,
          pz,
          0.15 * scale,
          0.17 * scale,
          0.15 * scale,
        );
      }
      if (leader && poleCount < 8) {
        put(posts, postCount++, px + 0.26, py + 0.65 * scale, pz, 0.035, 1.1 * scale, 0.035);
        put(poles, poleCount++, px + 0.26, py + 1.22 * scale, pz, 0.16, 0.16, 0.16);
      }
    }
    for (const id of positions.keys()) if (!seen.has(id)) positions.delete(id);
    for (let side = 0; side < 2; side++) {
      shirts[side].count = shirtCount[side];
      flags[side].count = flagCount[side];
      roofs[side].count = roofCount[side];
    }
    heads.count = headCount;
    legs.count = legCount;
    silver.count = helmets.count = armorCount;
    walls.count = houseCount;
    towers.count = towerCount;
    posts.count = postCount;
    poles.count = poleCount;
    for (const mesh of instances)
      if (mesh !== trunks && mesh !== crowns) mesh.instanceMatrix.needsUpdate = true;
  }
  function render(seconds: number, width: number, height: number): void {
    if (disposed) return;
    if (simulation.paused && previousPaused && width === previousWidth && height === previousHeight)
      return;
    previousPaused = simulation.paused;
    previousWidth = width;
    previousHeight = height;
    const dt = simulation.paused ? 0 : Math.max(0, Math.min(seconds, 0.05));
    simulation.advance(seconds);
    visualTime += dt;
    if (round !== simulation.round) {
      round = simulation.round;
      terrainTag = '';
      positions.clear();
      treeElapsed = 1;
    }
    const tag = simulation.game.sides
      .map((side) => `${side.terrain.edits}:${side.spells.casts}`)
      .join('/');
    if (tag !== terrainTag) {
      terrainTag = tag;
      rebuildTerrain();
      treeElapsed = 1;
    }
    treeElapsed += dt;
    if (treeElapsed >= 0.5) {
      treeElapsed = 0;
      rebuildTrees();
    }
    updatePeople(dt);
    animateWaterTextures(textures, simulation.game.elapsed);
    const aspect = Math.max(0.1, width / Math.max(1, height)),
      viewHeight = aspect < 1 ? 72 : 56;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    simulation.dispose();
    positions.clear();
    for (const mesh of instances) mesh.dispose();
    for (const value of geometries) value.dispose();
    for (const value of materials) value.dispose();
    textures.map.dispose();
    textures.normalMap.dispose();
    sun.shadow.dispose();
    scene.clear();
    renderer.renderLists.dispose();
  }
  return { simulation, render, dispose };
}
