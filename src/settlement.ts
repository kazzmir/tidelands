import type { GridPoint, TerrainSurface } from './terrain-surface';

export type HousePower = 0 | 1 | 2 | 3 | 4 | 5;
export interface SettlementTile { x: number; z: number; tree: boolean; house: boolean; reserved?: boolean }
export interface Resident<T extends SettlementTile> { tile: T; home: T | null; power: HousePower; homeLevel: number | null; characterPower: number }

export function totalBuildingPower<T extends SettlementTile>(residents: readonly Resident<T>[]): number {
  return residents.reduce((sum, resident) => sum + (resident.home ? resident.power : 0), 0);
}

/** A home needs horizontal, dry ground, not merely a coplanar hillside. */
export function isHabitable(surface: TerrainSurface, tile: GridPoint): boolean {
  if (tile.x < 0 || tile.z < 0 || tile.x >= surface.size || tile.z >= surface.size) return false;
  const height = surface.level(tile.x, tile.z);
  return height > 0 && surface.tileCorners(tile.x, tile.z).every(point => surface.level(point.x, point.z) === height);
}

/** Only edge-connected flat tiles inside the centered 3×3 neighborhood count. */
export function homeSupport(surface: TerrainSurface, home: GridPoint): { count: number; power: HousePower; tiles: GridPoint[] } {
  if (!isHabitable(surface, home)) return { count: 0, power: 0, tiles: [] };
  const height = surface.level(home.x, home.z);
  const queue: GridPoint[] = [{ x: home.x, z: home.z }];
  const visited = new Set([`${home.x},${home.z}`]);
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const next = { x: point.x + dx, z: point.z + dz };
      const key = `${next.x},${next.z}`;
      if (visited.has(key) || Math.abs(next.x - home.x) > 1 || Math.abs(next.z - home.z) > 1) continue;
      visited.add(key);
      if (isHabitable(surface, next) && surface.level(next.x, next.z) === height) queue.push(next);
    }
  }
  const count = queue.length;
  const power: HousePower = count === 9 ? 5 : count === 8 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
  return { count, power, tiles: queue };
}

/** Deduplicate farming overlays shared by overlapping home influence areas. */
export function fertileLand<T extends SettlementTile>(residents: readonly Resident<T>[], surface: TerrainSurface): GridPoint[] {
  const result = new Map<string, GridPoint>();
  for (const resident of residents) {
    if (!resident.home) continue;
    const height = surface.level(resident.home.x, resident.home.z);
    for (let z = resident.home.z - 1; z <= resident.home.z + 1; z++) {
      for (let x = resident.home.x - 1; x <= resident.home.x + 1; x++) {
        const point = { x, z };
        if (isHabitable(surface, point) && surface.level(x, z) === height) result.set(`${x},${z}`, point);
      }
    }
  }
  return [...result.values()];
}

export function trySettle<T extends SettlementTile>(resident: Resident<T>, surface: TerrainSurface): boolean {
  const tile = resident.tile;
  if (resident.home || tile.house || tile.reserved || tile.tree || !isHabitable(surface, tile)) return false;
  tile.house = true;
  resident.home = tile;
  resident.power = 1;
  resident.homeLevel = surface.level(tile.x, tile.z);
  return true;
}

function release<T extends SettlementTile>(resident: Resident<T>): void {
  if (!resident.home) return;
  resident.tile = resident.home;
  resident.home.house = false;
  resident.home = null;
  resident.power = 0;
  resident.homeLevel = null;
}

/** A castle's center is its anchor: changing its height releases the resident too. */
export function releaseInvalidHomes<T extends SettlementTile>(residents: readonly Resident<T>[], surface: TerrainSurface): void {
  for (const resident of residents) {
    if (!resident.home) continue;
    if (!isHabitable(surface, resident.home)
      || (resident.power === 5 && surface.level(resident.home.x, resident.home.z) !== resident.homeLevel)) release(resident);
  }
}

/** Recompute powers, reserve castle footprints, and evict homes swallowed by castles. */
export function reconcileSettlements<T extends SettlementTile>(residents: readonly Resident<T>[], tiles: readonly T[], surface: TerrainSurface): boolean {
  const before = residents.map(resident => ({ home: resident.home, power: resident.power }));
  releaseInvalidHomes(residents, surface);
  const tileMap = new Map(tiles.map(tile => [`${tile.x},${tile.z}`, tile]));
  for (const tile of tiles) tile.reserved = false;
  // Existing castles get first claim, then resident order breaks ties deterministically.
  const candidates = residents.filter(resident => resident.home).sort((a, b) => Number(b.power === 5) - Number(a.power === 5));
  for (const resident of candidates) {
    const home = resident.home;
    if (!home) continue; // An earlier castle may have displaced this resident.
    const support = homeSupport(surface, home);
    const footprint = support.tiles.map(point => tileMap.get(`${point.x},${point.z}`));
    if (support.power === 5 && footprint.every(tile => tile && !tile.reserved)) {
      resident.power = 5;
      for (const tile of footprint) {
        if (!tile) continue;
        tile.reserved = true;
        tile.tree = false;
      }
      for (const other of residents) {
        if (other !== resident && other.home && footprint.includes(other.home)) release(other);
      }
    } else {
      // A neighboring castle can reserve part of an otherwise suitable neighborhood.
      resident.power = support.power === 5 ? 4 : support.power;
    }
    resident.homeLevel = surface.level(home.x, home.z);
  }
  // Cultivation clears trees permanently, just like a castle footprint.
  for (const point of fertileLand(residents, surface)) {
    const tile = tileMap.get(`${point.x},${point.z}`);
    if (tile) tile.tree = false;
  }
  return residents.some((resident, i) => resident.home !== before[i].home || resident.power !== before[i].power);
}
