import * as THREE from 'three';
import { AttractSimulation } from './attract-simulation';
import { createWaterTextures, animateWaterTextures } from './water-texture';
import { createGameModels, buildingPoleHeight, type CharacterModel } from './game-models';

export interface AttractView {
  readonly simulation: AttractSimulation;
  render(seconds: number, width: number, height: number): void;
  dispose(): void;
}

/** The real headless match, presented with exactly the same model factory as normal play. */
export function createAttractView(
  renderer: THREE.WebGLRenderer,
  reducedMotion = false,
): AttractView {
  const simulation = new AttractSimulation(reducedMotion),
    models = createGameModels();
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
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, far: 180 });
  sun.shadow.bias = -0.001;
  scene.add(sun);
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  function geometry<T extends THREE.BufferGeometry>(value: T): T {
    geometries.add(value);
    return value;
  }
  function material<T extends THREE.Material>(value: T): T {
    materials.add(value);
    return value;
  }
  const box = geometry(new THREE.BoxGeometry(1, 1, 1)),
    pine = geometry(new THREE.ConeGeometry(1, 1, 7));
  const wood = material(new THREE.MeshStandardMaterial({ color: '#826c49', roughness: 0.9 })),
    leaves = material(new THREE.MeshStandardMaterial({ color: '#3f7756', roughness: 1 }));
  const trunks = new THREE.InstancedMesh(box, wood, 512),
    crowns = new THREE.InstancedMesh(pine, leaves, 512);
  for (const mesh of [trunks, crowns]) {
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const teams = [new THREE.Group(), new THREE.Group()],
    buildings = new THREE.Group();
  teams[0].name = 'attract-red-settlers';
  teams[1].name = 'attract-blue-settlers';
  buildings.name = 'attract-homes';
  scene.add(...teams, buildings);
  const characters = new Map<number, CharacterModel>(),
    homes = new Map<number, { mesh: THREE.Group; key: string }>();
  const poles = [models.leader(), models.leader()];
  scene.add(...poles);
  const terrain = new THREE.Mesh(
    geometry(new THREE.BufferGeometry()),
    material(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    ),
  );
  terrain.name = 'attract-terrain';
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
  water.name = 'attract-water';
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
    color = new THREE.Color(),
    targetPosition = new THREE.Vector3();
  let round = 0,
    terrainTag = '',
    treeElapsed = 1,
    visualTime = 0,
    disposed = false,
    previousPaused = false,
    previousWidth = 0,
    previousHeight = 0;
  function resetModels(): void {
    for (const pole of poles) {
      scene.add(pole);
      pole.visible = false;
    }
    for (const actor of characters.values()) models.disposeInstance(actor.mesh);
    for (const home of homes.values()) models.disposeInstance(home.mesh);
    characters.clear();
    homes.clear();
  }
  function rebuildTerrain(): void {
    const game = simulation.game,
      points = game.surface.positions(),
      colors = new Float32Array(points.length);
    for (let i = 0; i < points.length; i += 3) {
      const tile = game.tiles[Math.floor(i / 18)],
        height = points[i + 1] / game.surface.step,
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
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(x, y + 0.35 * scale, z);
      dummy.scale.set(0.14 * scale, 0.7 * scale, 0.14 * scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(count, dummy.matrix);
      dummy.position.set(x, y + 1.05 * scale, z);
      dummy.scale.set(0.57 * scale, 1.5 * scale, 0.57 * scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(count, dummy.matrix);
      count++;
    }
    trunks.count = crowns.count = count;
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  }
  function updatePeople(dt: number): void {
    const game = simulation.game,
      half = game.options.size / 2,
      seen = new Set<number>(),
      occupied = new Set<number>(),
      alpha = 1 - Math.exp(-18 * dt);
    for (const person of game.people) {
      if (
        person.characterPower <= 0 ||
        person.survival.phase === 'dead' ||
        person.survival.phase === 'sinking'
      )
        continue;
      seen.add(person.id);
      if (person.home) {
        occupied.add(person.id);
        const home = person.home,
          key = `${home.index}:${person.power}:${game.surface.level(home.x, home.z)}`;
        let current = homes.get(person.id);
        if (current?.key !== key) {
          if (current) models.disposeInstance(current.mesh);
          const n =
            Math.sin(home.x * 127.1 + home.z * 311.7 + game.options.seed * 13.3) * 43758.5453;
          const mesh =
            person.power === 5
              ? models.castle(home, person.population, game.surface)
              : models.house(
                  home,
                  person.power,
                  person.population,
                  game.surface,
                  (Math.floor((n - Math.floor(n)) * 4) * Math.PI) / 2,
                );
          current = { key, mesh };
          homes.set(person.id, current);
          buildings.add(mesh);
        }
      }
      let actor = characters.get(person.id);
      if (!actor && !person.home && characters.size < 512) {
        actor = models.character(person.population);
        actor.mesh.position.set(
          person.x - half,
          game.surface.sample(person.x, person.z),
          person.z - half,
        );
        characters.set(person.id, actor);
        teams[person.population === 'red' ? 0 : 1].add(actor.mesh);
      }
      if (!actor) continue;
      actor.mesh.visible = !person.home;
      if (person.home) continue;
      if (person.knight) models.equipKnight(actor, person.population);
      targetPosition.set(
        person.x - half,
        Math.max(0.08, game.surface.sample(person.x, person.z)),
        person.z - half,
      );
      actor.mesh.position.lerp(targetPosition, alpha);
      if (person.target)
        actor.mesh.rotation.y = Math.atan2(
          person.target.x - person.tile.x,
          person.target.z - person.tile.z,
        );
      for (let i = 0; i < actor.legs.length; i++)
        actor.legs[i].rotation.x = person.target
          ? Math.sin(visualTime * 9 + person.id) * (i < 2 ? 0.45 : -0.45)
          : 0;
      actor.head.material.color.set(person.sick ? '#a3b86b' : '#e3bb8b');
    }
    for (const [id, actor] of characters)
      if (!seen.has(id)) {
        models.disposeInstance(actor.mesh);
        characters.delete(id);
      }
    for (const [id, home] of homes)
      if (!occupied.has(id)) {
        models.disposeInstance(home.mesh);
        homes.delete(id);
      }
    for (let side = 0; side < 2; side++) {
      const state = game.sides[side].leader,
        owner = state.leader,
        pole = poles[side];
      pole.visible = false;
      if (owner && owner.characterPower > 0) {
        if (owner.home) {
          scene.add(pole);
          pole.position.set(
            owner.home.x + 0.5 - half,
            game.surface.sample(owner.home.x + 0.5, owner.home.z + 0.5) +
              buildingPoleHeight(owner.power),
            owner.home.z + 0.5 - half,
          );
          pole.visible = true;
        } else {
          const actor = characters.get(owner.id);
          if (actor) {
            actor.mesh.add(pole);
            pole.position.set(owner.knight ? 0 : 0.17, 0, owner.knight ? -0.13 : 0.02);
            pole.visible = true;
          }
        }
      } else if (state.droppedTile) {
        const tile = state.droppedTile;
        scene.add(pole);
        pole.position.set(
          tile.x + 0.5 - half,
          Math.max(0.08, game.surface.sample(tile.x + 0.5, tile.z + 0.5)) + 0.02,
          tile.z + 0.5 - half,
        );
        pole.visible = true;
      }
    }
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
      resetModels();
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
    resetModels();
    models.dispose();
    simulation.dispose();
    trunks.dispose();
    crowns.dispose();
    for (const shape of geometries) shape.dispose();
    for (const paint of materials) paint.dispose();
    textures.map.dispose();
    textures.normalMap.dispose();
    sun.shadow.dispose();
    scene.clear();
    renderer.renderLists.dispose();
  }
  return { simulation, render, dispose };
}
