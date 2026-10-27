import * as THREE from 'three';

export interface WaterTextures {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
}

/** Integer-frequency waves and warps repeat smoothly in both directions, including derivatives. */
export function waterWaveHeight(u: number, v: number): number {
  const tau = Math.PI * 2;
  const phase = 4 * v + 0.2 * Math.sin(tau * u) + 0.09 * Math.sin(tau * (2 * u + v));
  const crest = Math.pow(0.5 + 0.5 * Math.sin(tau * phase), 12);
  const segments = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(tau * (3 * u + v)));
  const ripples = Math.pow(0.5 + 0.5 * Math.sin(tau * (3 * u + 7 * v)), 20);
  return crest * segments * 0.8 + ripples * 0.2;
}

/** One continuous ocean surface samples this repeating texture every eight world tiles. */
export function createWaterTextures(
  worldWidth: number,
  anisotropy: number,
  size = 256,
): WaterTextures {
  const color = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size,
        v = (y + 0.5) / size;
      const height = waterWaveHeight(u, v);
      const index = (y * size + x) * 4;
      color[index] = Math.round(94 + height * 77);
      color[index + 1] = Math.round(153 + height * 59);
      color[index + 2] = Math.round(150 + height * 54);
      color[index + 3] = 255;
      const dx = (waterWaveHeight(u + 1 / size, v) - waterWaveHeight(u - 1 / size, v)) * 2;
      const dy = (waterWaveHeight(u, v + 1 / size) - waterWaveHeight(u, v - 1 / size)) * 2;
      const length = Math.hypot(dx, dy, 1);
      normal[index] = Math.round((0.5 - (dx / length) * 0.5) * 255);
      normal[index + 1] = Math.round((0.5 - (dy / length) * 0.5) * 255);
      normal[index + 2] = Math.round((0.5 + (1 / length) * 0.5) * 255);
      normal[index + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(color, size, size);
  const normalMap = new THREE.DataTexture(normal, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(worldWidth / 8, worldWidth / 8);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(8, Math.max(1, anisotropy));
    texture.needsUpdate = true;
  }
  return { map, normalMap };
}

/** Scroll color and normals together without moving/rebuilding geometry or uploading new pixels. */
export function animateWaterTextures(textures: WaterTextures, seconds: number): void {
  textures.map.offset.set((seconds * 0.012) % 1, (seconds * 0.005) % 1);
  textures.normalMap.offset.copy(textures.map.offset);
}
