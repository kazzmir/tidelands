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
    },
    clear(): void {
      for (const actor of active.keys()) clear(actor);
    },
    dispose(): void {
      for (const actor of active.keys()) clear(actor);
      texture.dispose();
    },
  };
}
