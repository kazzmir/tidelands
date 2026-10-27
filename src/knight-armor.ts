import * as THREE from 'three';

export function createSilverArmorMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#d7dde5', metalness: 0.75, roughness: 0.3 });
}

/** Plate armor follows each animated limb; its silver shell covers the original clothes/skin. */
export function equipKnightArmor(
  character: THREE.Group,
  limbs: readonly THREE.Mesh[],
  silver: THREE.Material,
  dark: THREE.Material,
): void {
  if (character.getObjectByName('knight-cuirass')) return;
  character.scale.multiplyScalar(2);

  function plate(
    parent: THREE.Object3D,
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material = silver,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = `knight-${name}`;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.ownedGeometry = true;
    parent.add(mesh);
  }

  plate(character, 'cuirass', [0.21, 0.235, 0.16], [0, 0.25, 0]);
  plate(character, 'tassets', [0.195, 0.09, 0.15], [0, 0.13, 0]);
  plate(character, 'gorget', [0.16, 0.05, 0.145], [0, 0.35, 0]);
  plate(character, 'helmet', [0.18, 0.185, 0.175], [0, 0.435, 0]);
  plate(character, 'visor', [0.13, 0.023, 0.012], [0, 0.452, 0.094], dark);

  for (const [side, offset] of [
    ['left', 0],
    ['right', 2],
  ] as const) {
    const leg = limbs[offset];
    const arm = limbs[offset + 1];
    plate(leg, `greave-${side}`, [0.08, 0.18, 0.095], [0, 0, 0]);
    plate(leg, `knee-${side}`, [0.09, 0.055, 0.115], [0, 0.02, 0.015]);
    plate(leg, `boot-${side}`, [0.095, 0.06, 0.15], [0, -0.055, 0.025]);
    plate(arm, `vambrace-${side}`, [0.085, 0.18, 0.095], [0, 0, 0]);
    plate(arm, `pauldron-${side}`, [0.11, 0.1, 0.12], [0, 0.07, 0]);
    plate(arm, `gauntlet-${side}`, [0.09, 0.075, 0.11], [0, -0.07, 0.0075]);
  }
}
