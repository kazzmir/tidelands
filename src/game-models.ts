import * as THREE from 'three';
import { populationShirtColor, type PopulationColor } from './population';
import type { HousePower } from './settlement';
import type { GridPoint, TerrainSurface } from './terrain-surface';
import { createSilverArmorMaterial, equipKnightArmor } from './knight-armor';

export interface CharacterModel {
  mesh: THREE.Group;
  head: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  legs: THREE.Mesh[];
}

/** The single model factory used by both normal play and the startup simulation. */
export function createGameModels() {
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
  const wallMaterial = material(new THREE.MeshStandardMaterial({ color: '#f0dfb7', roughness: 1 }));
  const roofMaterials = ['#ad6548', '#bd7950', '#8b6650'].map((color) =>
    material(new THREE.MeshStandardMaterial({ color, roughness: 1 })),
  );
  const darkMaterial = material(new THREE.MeshStandardMaterial({ color: '#645c42', roughness: 1 }));
  const populationMaterials: Record<PopulationColor, THREE.MeshStandardMaterial> = {
    red: material(
      new THREE.MeshStandardMaterial({ color: populationShirtColor('red'), roughness: 1 }),
    ),
    blue: material(
      new THREE.MeshStandardMaterial({ color: populationShirtColor('blue'), roughness: 1 }),
    ),
  };
  const houseGeometry = geometry(new THREE.BoxGeometry(0.62, 0.48, 0.58));
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.4, 0);
  roofShape.lineTo(0, 0.37);
  roofShape.lineTo(0.4, 0);
  roofShape.closePath();
  const roofGeometry = geometry(
    new THREE.ExtrudeGeometry(roofShape, { depth: 0.78, bevelEnabled: false }),
  );
  roofGeometry.translate(0, 0, -0.39);
  const doorGeometry = geometry(new THREE.BoxGeometry(0.13, 0.25, 0.02)),
    chimneyGeometry = geometry(new THREE.BoxGeometry(0.1, 0.32, 0.12));
  const flagPoleGeometry = geometry(new THREE.BoxGeometry(0.035, 0.75, 0.035)),
    flagClothGeometry = geometry(new THREE.BoxGeometry(0.4, 0.23, 0.025));
  const castleBlockGeometry = geometry(new THREE.BoxGeometry(1, 1, 1)),
    castleRoofGeometry = geometry(new THREE.ConeGeometry(1, 1, 4));
  const castleStone = material(new THREE.MeshStandardMaterial({ color: '#b6b9a4', roughness: 1 })),
    castleTrim = material(new THREE.MeshStandardMaterial({ color: '#8c9889', roughness: 1 })),
    castleRoof = material(new THREE.MeshStandardMaterial({ color: '#855443', roughness: 1 }));
  const skinMaterial = material(new THREE.MeshStandardMaterial({ color: '#e3bb8b', roughness: 1 })),
    hairMaterial = material(new THREE.MeshStandardMaterial({ color: '#685139', roughness: 1 })),
    trouserMaterial = material(new THREE.MeshStandardMaterial({ color: '#54665a', roughness: 1 }));
  const bodyGeometry = geometry(new THREE.BoxGeometry(0.17, 0.21, 0.12)),
    headGeometry = geometry(new THREE.BoxGeometry(0.135, 0.14, 0.13)),
    hairGeometry = geometry(new THREE.BoxGeometry(0.145, 0.055, 0.14)),
    limbGeometry = geometry(new THREE.BoxGeometry(0.055, 0.16, 0.065));
  const armorMaterial = material(createSilverArmorMaterial());
  const staffGeometry = geometry(new THREE.CylinderGeometry(0.015, 0.02, 0.8, 6)),
    leaderGeometry = geometry(new THREE.OctahedronGeometry(0.24));
  const staffMaterial = material(
      new THREE.MeshStandardMaterial({ color: '#776b49', roughness: 1 }),
    ),
    leaderMaterial = material(
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffffff',
        emissiveIntensity: 0.2,
        roughness: 0.7,
      }),
    );
  function createPopulationFlag(population: PopulationColor): THREE.Group {
    const flag = new THREE.Group(),
      pole = new THREE.Mesh(flagPoleGeometry, darkMaterial),
      cloth = new THREE.Mesh(flagClothGeometry, populationMaterials[population]);
    pole.position.y = 0.375;
    cloth.position.set(0.2, 0.61, 0);
    pole.castShadow = cloth.castShadow = true;
    flag.add(pole, cloth);
    return flag;
  }
  function place(group: THREE.Group, point: GridPoint, surface: TerrainSurface): void {
    group.position.set(
      point.x - surface.size / 2 + 0.5,
      surface.sample(point.x + 0.5, point.z + 0.5),
      point.z - surface.size / 2 + 0.5,
    );
  }
  function house(
    tile: GridPoint,
    power: HousePower,
    population: PopulationColor,
    surface: TerrainSurface,
    rotation: number,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = 'normal-house';
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
    place(group, tile, surface);
    const footprint = [-0.4, 0.4].flatMap((dx) =>
      [-0.4, 0.4].map((dz) => surface.sample(tile.x + 0.5 + dx, tile.z + 0.5 + dz)),
    );
    const floor = Math.max(surface.elevation(tile.x, tile.z) * surface.step, ...footprint) + 0.01,
      foundationDepth = floor - Math.min(...footprint) + 0.04;
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, foundationDepth, 0.6),
      wallMaterial,
    );
    foundation.userData.ownedGeometry = true;
    foundation.position.y = -foundationDepth / 2;
    group.add(foundation);
    group.position.y = floor;
    group.scale.setScalar(0.8 + power * 0.08);
    group.rotation.y = rotation;
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return group;
  }
  function castle(
    home: GridPoint,
    population: PopulationColor,
    surface: TerrainSurface,
  ): THREE.Group {
    const castle = new THREE.Group();
    castle.name = 'normal-castle';
    function block(
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
      paint = castleStone,
    ): void {
      const mesh = new THREE.Mesh(castleBlockGeometry, paint);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.castShadow = mesh.receiveShadow = true;
      castle.add(mesh);
    }
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
        for (const dx of [-0.14, 0.14])
          for (const dz of [-0.14, 0.14])
            block(side * 1.24 + dx, 1.34, other * 1.24 + dz, 0.15, 0.2, 0.15);
      }
    }
    const flag = createPopulationFlag(population);
    flag.position.y = 1.855;
    castle.add(flag);
    place(castle, home, surface);
    return castle;
  }
  function character(population: PopulationColor): CharacterModel {
    const mesh = new THREE.Group();
    mesh.name = 'normal-character';
    const shirtMaterial = populationMaterials[population];
    const body = new THREE.Mesh(bodyGeometry, shirtMaterial);
    body.position.y = 0.25;
    const head = new THREE.Mesh(headGeometry, skinMaterial.clone());
    head.position.y = 0.425;
    head.userData.ownedMaterial = true;
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
    mesh.scale.setScalar(1.15);
    return { mesh, head, legs };
  }
  function equipKnight(
    settler: Pick<CharacterModel, 'mesh' | 'legs'>,
    population: PopulationColor,
  ): void {
    if (settler.mesh.getObjectByName('knight-team-flag')) return;
    function part(
      parent: THREE.Object3D,
      shape: THREE.BufferGeometry,
      paint: THREE.Material,
      x: number,
      y: number,
      z: number,
    ): THREE.Mesh {
      const mesh = new THREE.Mesh(shape, paint);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.ownedGeometry = true;
      parent.add(mesh);
      return mesh;
    }
    equipKnightArmor(settler.mesh, settler.legs, armorMaterial, darkMaterial);
    const teamFlag = createPopulationFlag(population);
    teamFlag.name = 'knight-team-flag';
    teamFlag.position.set(-0.27, 0.23, -0.08);
    teamFlag.rotation.y = Math.PI;
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
    part(shield, new THREE.CircleGeometry(0.125, 6), populationMaterials[population], 0, 0, 0.032);
    settler.legs[1].add(shield);
  }
  function leader(): THREE.Group {
    const group = new THREE.Group(),
      staff = new THREE.Mesh(staffGeometry, staffMaterial),
      whiteObject = new THREE.Mesh(leaderGeometry, leaderMaterial);
    staff.position.y = 0.42;
    whiteObject.position.y = 0.98;
    staff.castShadow = whiteObject.castShadow = true;
    group.add(staff, whiteObject);
    group.visible = false;
    return group;
  }
  function disposeInstance(root: THREE.Object3D): void {
    if (root.userData.modelDisposed) return;
    root.userData.modelDisposed = true;
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.userData.ownedGeometry) object.geometry.dispose();
        if (object.userData.ownedMaterial) {
          for (const paint of Array.isArray(object.material) ? object.material : [object.material])
            paint.dispose();
        }
      }
    });
    root.removeFromParent();
  }
  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const shape of geometries) shape.dispose();
    for (const paint of materials) paint.dispose();
    geometries.clear();
    materials.clear();
  }
  return { house, castle, character, equipKnight, leader, disposeInstance, dispose };
}
