import * as THREE from 'three';

export interface FightingVisual {
  mesh: THREE.Group;
  legs: readonly THREE.Object3D[];
  phase: number;
}

/** Per-fighter materials and a soft additive aura: shared team materials stay untouched. */
export function createCombatEffects() {
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const index = (y * 32 + x) * 4;
      const radius = Math.hypot((x - 15.5) / 16, (y - 15.5) / 16);
      pixels.set([255, 255, 255, Math.round(255 * Math.max(0, 1 - radius) ** 2)], index);
    }
  const texture = new THREE.DataTexture(pixels, 32, 32);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const boltGeometry = new THREE.CylinderGeometry(0.028, 0.028, 1, 5);
  const sparkGeometry = new THREE.OctahedronGeometry(0.045);
  const boltMaterial = new THREE.MeshBasicMaterial({
    color: '#ffe52b',
    toneMapped: false,
    depthWrite: false,
    depthTest: false,
  });
  const lightning = new Map<
    FightingVisual,
    {
      enemy: FightingVisual;
      group: THREE.Group;
      segments: THREE.Mesh[];
      spark: THREE.Mesh;
    }
  >();
  function clearLightning(actor: FightingVisual): void {
    const bolt = lightning.get(actor);
    if (!bolt) return;
    bolt.group.removeFromParent();
    lightning.delete(actor);
  }
  const active = new Map<
    FightingVisual,
    {
      originals: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
      clones: Map<THREE.Material, THREE.MeshStandardMaterial>;
      aura: THREE.Sprite;
      lean: number;
    }
  >();

  function clear(actor: FightingVisual): void {
    for (const [owner, bolt] of lightning)
      if (owner === actor || bolt.enemy === actor) clearLightning(owner);
    const state = active.get(actor);
    if (!state) return;
    for (const [mesh, material] of state.originals) mesh.material = material;
    for (const material of state.clones.values()) material.dispose();
    actor.mesh.remove(state.aura);
    state.aura.material.dispose();
    actor.mesh.rotation.z = state.lean;
    actor.legs.forEach((limb) => limb.rotation.set(0, 0, 0));
    actor.mesh.userData.fighting = false;
    active.delete(actor);
  }

  function enable(actor: FightingVisual) {
    const previous = active.get(actor);
    const originals =
      previous?.originals ?? new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const clones = previous?.clones ?? new Map<THREE.Material, THREE.MeshStandardMaterial>();
    function glowing(material: THREE.Material): THREE.Material {
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      let clone = clones.get(material);
      if (!clone) {
        clone = material.clone();
        clone.emissive.set('#ff2010');
        clones.set(material, clone);
      }
      return clone;
    }
    actor.mesh.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || originals.has(object)) return;
      originals.set(object, object.material);
      object.material = Array.isArray(object.material)
        ? object.material.map(glowing)
        : glowing(object.material);
    });
    if (previous) return previous;
    const aura = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        color: '#ff3018',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    aura.name = 'combat-red-aura';
    aura.position.y = 0.28;
    aura.scale.set(0.9, 1, 1);
    actor.mesh.add(aura);
    actor.mesh.userData.fighting = true;
    const state = { originals, clones, aura, lean: actor.mesh.rotation.z };
    active.set(actor, state);
    return state;
  }

  function updateLightning(a: FightingVisual, b: FightingVisual, time: number): void {
    let bolt = lightning.get(a);
    if (bolt && bolt.enemy !== b) {
      clearLightning(a);
      bolt = undefined;
    }
    if (!bolt) {
      const group = new THREE.Group();
      group.name = 'combat-yellow-lightning';
      group.renderOrder = 10;
      const segments = Array.from({ length: 5 }, () => new THREE.Mesh(boltGeometry, boltMaterial));
      const spark = new THREE.Mesh(sparkGeometry, boltMaterial);
      group.add(...segments, spark);
      (a.mesh.parent ?? a.mesh).add(group);
      bolt = { enemy: b, group, segments, spark };
      lightning.set(a, bolt);
    }
    const parent = bolt.group.parent!;
    const from = parent.worldToLocal(a.mesh.localToWorld(new THREE.Vector3(0, 0.45, 0)));
    const to = parent.worldToLocal(b.mesh.localToWorld(new THREE.Vector3(0, 0.45, 0)));
    const side = new THREE.Vector3(-(to.z - from.z), 0, to.x - from.x).normalize();
    const cycle = (((time * 3) % 2) + 2) % 2;
    const head = cycle <= 1 ? cycle : 2 - cycle;
    const tail = THREE.MathUtils.clamp(head + (cycle <= 1 ? -0.6 : 0.6), 0, 1);
    const points = Array.from({ length: 6 }, (_, index) => {
      const travel = THREE.MathUtils.lerp(tail, head, index / 5);
      const point = new THREE.Vector3().lerpVectors(from, to, travel);
      point.y += Math.sin(travel * Math.PI) * 0.22;
      if (index > 0 && index < 5) point.addScaledVector(side, (index % 2 ? 1 : -1) * 0.065);
      return point;
    });
    const up = new THREE.Vector3(0, 1, 0);
    bolt.segments.forEach((segment, index) => {
      const direction = new THREE.Vector3().subVectors(points[index + 1], points[index]);
      segment.position
        .copy(points[index])
        .add(points[index + 1])
        .multiplyScalar(0.5);
      segment.scale.y = direction.length();
      segment.quaternion.setFromUnitVectors(up, direction.normalize());
      segment.visible = segment.scale.y > 0.001;
    });
    bolt.spark.position.copy(points[5]);
    bolt.spark.scale.setScalar(0.85 + Math.sin(time * 24) * 0.15);
    bolt.group.userData.travel = head;
  }

  return {
    update<C extends FightingVisual>(pairs: readonly { a: C; b: C }[], time: number): void {
      const fighting = new Set<FightingVisual>();
      for (const { a, b } of pairs) {
        fighting.add(a);
        fighting.add(b);
      }
      for (const actor of active.keys()) if (!fighting.has(actor)) clear(actor);
      for (const { a, b } of pairs)
        for (const [actor, enemy] of [
          [a, b],
          [b, a],
        ] as const) {
          const state = enable(actor);
          const dx = enemy.mesh.position.x - actor.mesh.position.x;
          const dz = enemy.mesh.position.z - actor.mesh.position.z;
          actor.mesh.rotation.y =
            Math.hypot(dx, dz) > 0.001
              ? Math.atan2(dx, dz)
              : actor === a
                ? Math.PI / 2
                : -Math.PI / 2;
          const phase = time * 12 + actor.phase;
          actor.mesh.rotation.z = state.lean + Math.sin(phase * 0.7) * 0.045;
          actor.legs.forEach((limb, index) => {
            const swing = phase + Math.floor(index / 2) * Math.PI;
            limb.rotation.x =
              index % 2 === 0 ? Math.sin(swing) * 0.12 : -1 + Math.sin(swing) * 0.65;
            limb.rotation.z = index % 2 === 0 ? 0 : index === 1 ? -0.18 : 0.18;
          });
          for (const material of state.clones.values())
            material.emissiveIntensity = 0.65 + Math.sin(phase) * 0.15;
          state.aura.material.opacity = 0.32 + Math.sin(phase) * 0.08;
        }
      const owners = new Set<FightingVisual>();
      for (const { a, b } of pairs) {
        owners.add(a);
        updateLightning(a, b, time);
      }
      for (const owner of lightning.keys()) if (!owners.has(owner)) clearLightning(owner);
    },
    clear(): void {
      for (const actor of active.keys()) clear(actor);
    },
    dispose(): void {
      for (const actor of active.keys()) clear(actor);
      texture.dispose();
      boltGeometry.dispose();
      sparkGeometry.dispose();
      boltMaterial.dispose();
    },
  };
}
