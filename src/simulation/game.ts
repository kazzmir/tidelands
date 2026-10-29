import type { AIProfile } from '../ai-profiles';
import { STARTING_POWER } from '../game-settings';
import { walkDistance } from './walk';
import { birthLocation } from '../birth-location';
import { EnemyTerraformer } from '../enemy-ai';
import { EnemySpellcaster } from '../enemy-spells';
import { EnemyKnightStrategy } from '../enemy-knights';
import { TerrainSurface, type GridPoint } from '../terrain-surface';
import { PowerMeter } from '../power';
import { Leadership, rallySteps, buildRallyField } from '../leadership';
import { SharedPursuit } from '../attack-order';
import { Armageddon, armageddonLand } from '../armageddon';
import { CombatSystem, combatClosingOffset } from '../combat';
import { convertLeaderToKnight, nearestEnemy, inCombatRange } from '../knights';
import { enemyBuildingContacts, buildingDefenderPoint, touchesBuilding } from '../building-contact';
import { growPopulation, type PopulationColor } from '../population';
import {
  reconcileSettlements,
  evacuateSettlements,
  trySettle,
  totalBuildingPower,
  type Resident,
  type SettlementTile,
} from '../settlement';
import { createSurvival, advanceSurvival, type Survival } from '../survival';
import { advanceSickness } from '../sickness';
import { withinTerrainReach } from '../terrain-reach';
import { planTerrainSpell, safeForAllies } from '../spell-plan';
import { SPELL_COSTS, clearSubmergedSwamps } from '../spells';
import { clearSubmergedRock, markVolcanicRock } from '../rock';
import { nearestPoleCollector } from '../pole-recovery';
import { generateWorldHeights, playerStartAnchor, enemyStartAnchor } from '../world-generation';

export type Scenario = 'plains' | 'tidal' | 'islands' | 'highlands' | 'generated';
export interface MatchOptions {
  seed: number;
  red: AIProfile;
  blue: AIProfile;
  scenario: Scenario;
  size: number;
  seconds: number;
  step: number;
  finaleSeconds?: number;
  startingPower?: number;
}
export interface TeamMetrics {
  population: number;
  hp: number;
  houses: number;
  currency: number;
  earned: number;
  spellCasts: number;
  spellSpent: number;
  knights: number;
  trained: number;
  terrainEdits: number;
  terrainSpent: number;
  finaleSpent: number;
}
export interface MatchResult {
  seed: number;
  scenario: Scenario;
  red: string;
  blue: string;
  winner: PopulationColor | 'draw';
  reason: 'elimination' | 'mutual-elimination' | 'time-limit' | 'armageddon';
  finale: boolean;
  leaderHP: { red: number; blue: number };
  elapsed: number;
  redMetrics: TeamMetrics;
  blueMetrics: TeamMetrics;
}
interface Tile extends SettlementTile {
  index: number;
}
interface Person extends Resident<Tile> {
  id: number;
  population: PopulationColor;
  knight: boolean;
  survival: Survival;
  sick: boolean;
  x: number;
  z: number;
  target: Tile | null;
  progress: number;
  wait: number;
}
interface Side {
  color: PopulationColor;
  profile: AIProfile;
  money: PowerMeter;
  leader: Leadership<Tile, Person>;
  terrain: EnemyTerraformer;
  spells: EnemySpellcaster;
  knights: EnemyKnightStrategy<Person>;
  random: () => number;
  earned: number;
  finaleSpent: number;
  site: Tile | null;
  builder: Person | null;
  buildRevision: number;
  buildDistance: Map<Tile, number>;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Rendering-free fixed-step game. Uses production rule modules and AI controllers, not combat proxies. */
export class SimulationGame {
  readonly surface: TerrainSurface;
  readonly tiles: Tile[];
  readonly sides: readonly Side[];
  people: Person[] = [];
  elapsed = 0;
  private nextId = 1;
  private revision = 0;
  private readonly combat = new CombatSystem<Person>();
  private readonly finale = new Armageddon<Person>();
  private readonly routes = new SharedPursuit<Tile>();
  private readonly swamps = new Set<Tile>();
  private readonly rocks = new Set<Tile>();

  constructor(readonly options: MatchOptions) {
    if (
      !Number.isSafeInteger(options.startingPower ?? STARTING_POWER) ||
      (options.startingPower ?? STARTING_POWER) < 0 ||
      !Number.isSafeInteger(options.seed) ||
      options.seed < 0 ||
      options.seed > 0xffffffff ||
      !Number.isInteger(options.size) ||
      options.size < 40 ||
      options.size > 500 ||
      !Number.isFinite(options.step) ||
      options.step <= 0 ||
      options.step > 1 ||
      !Number.isFinite(options.seconds) ||
      options.seconds <= 0 ||
      options.seconds > 7200 ||
      !Number.isFinite(options.finaleSeconds ?? 0) ||
      (options.finaleSeconds ?? 0) < 0 ||
      (options.finaleSeconds ?? 0) > 1800
    )
      throw new Error('Invalid simulation options');
    if (!['plains', 'tidal', 'islands', 'highlands', 'generated'].includes(options.scenario))
      throw new Error('Unknown scenario');
    if (options.scenario === 'generated' && options.size < 160)
      throw new Error('Generated archipelago requires size >= 160 (500 recommended)');
    const n = options.size,
      random = seededRandom(options.seed);
    const anchors =
      options.scenario === 'generated'
        ? [playerStartAnchor(n), enemyStartAnchor(n)]
        : [
            { x: Math.floor(n * 0.25), z: Math.floor(n * 0.5) },
            { x: Math.floor(n * 0.75), z: Math.floor(n * 0.5) },
          ];
    this.surface = new TerrainSurface(
      n,
      options.scenario === 'generated'
        ? generateWorldHeights(n, options.seed)
        : new Uint8Array((n + 1) ** 2),
      0.65,
    );
    if (options.scenario !== 'generated') {
      for (let z = 4; z <= n - 4; z++)
        for (let x = 4; x <= n - 4; x++) {
          const gap = Math.abs(x - n / 2);
          let h = 4;
          if (options.scenario === 'islands' && gap <= 5) h = 0;
          if (options.scenario === 'tidal' && gap <= 3) h = Math.abs(z - n / 2) <= 1 ? 1 : 0;
          this.surface.levels[z * (n + 1) + x] = h;
        }
      this.surface.enforceSlopeLimit();
      // Symmetric highland perturbations exercise nonflat foundations without giving either side better land.
      if (options.scenario === 'highlands')
        for (let i = 0; i < 10; i++) {
          const x = 6 + Math.floor(random() * (n / 2 - 12)),
            z = 6 + Math.floor(random() * (n - 12));
          this.surface.editCorner(x, z, 2);
          this.surface.editCorner(n - x, z, 2);
        }
    }
    this.tiles = Array.from({ length: n * n }, (_, index) => ({
      index,
      x: index % n,
      z: Math.floor(index / n),
      house: false,
      tree: random() < 0.03,
    }));
    this.sides = ([options.red, options.blue] as const).map((profile, i) => ({
      color: i === 0 ? 'red' : 'blue',
      profile,
      money: new PowerMeter(5, options.startingPower ?? STARTING_POWER),
      leader: new Leadership<Tile, Person>(),
      terrain: new EnemyTerraformer(anchors[i], profile.terrainInterval),
      spells: new EnemySpellcaster(
        profile.spells.minimumDelay,
        profile.spells.maximumDelay,
        profile.spells,
      ),
      knights: new EnemyKnightStrategy<Person>(profile.knights),
      random: seededRandom(options.seed ^ (i === 0 ? 0x915f : 0xa733)),
      earned: 0,
      finaleSpent: 0,
      site: null,
      builder: null,
      buildRevision: -1,
      buildDistance: new Map<Tile, number>(),
    }));
    for (let i = 0; i < 2; i++) {
      const anchor = anchors[i];
      const cells = this.tiles.filter(
        (tile) =>
          Math.hypot(tile.x - anchor.x, tile.z - anchor.z) < 14 &&
          this.surface.elevation(tile.x, tile.z) > 1 &&
          this.walkable(tile) &&
          this.neighbors(tile).length > 0,
      );
      if (cells.length < 24) throw new Error('Scenario cannot supply 24 starting characters');
      for (let j = 0; j < 24; j++) {
        const tile = cells[Math.floor(this.sides[i].random() * cells.length)];
        this.spawn(tile, 10, this.sides[i].color);
      }
      this.sides[i].leader.appoint(this.people.find((c) => c.population === this.sides[i].color)!);
    }
  }
  private lookup = (x: number, z: number): Tile | undefined =>
    x >= 0 && z >= 0 && x < this.options.size && z < this.options.size
      ? this.tiles[z * this.options.size + x]
      : undefined;
  private point = (c: Person): GridPoint =>
    c.home ? { x: c.home.x + 0.5, z: c.home.z + 0.5 } : { x: c.x, z: c.z };
  private tileOf = (c: Person): Tile =>
    this.lookup(Math.floor(this.point(c).x), Math.floor(this.point(c).z)) ?? c.tile;
  private alive = (c: Person): boolean =>
    c.characterPower > 0 && (c.survival.phase === 'alive' || c.survival.phase === 'drowning');
  private walkable = (t: Tile): boolean =>
    !t.house && !t.reserved && !t.tree && this.surface.sample(t.x + 0.5, t.z + 0.5) > 0.08;
  private neighbors = (t: Tile): Tile[] =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].flatMap(([dx, dz]) => {
      const next = this.lookup(t.x + dx, t.z + dz);
      return next &&
        this.walkable(next) &&
        Math.abs(
          this.surface.sample(next.x + 0.5, next.z + 0.5) -
            this.surface.sample(t.x + 0.5, t.z + 0.5),
        ) <=
          0.65 + 1e-6 &&
        this.surface.sample(t.x + 0.5 + dx / 2, t.z + 0.5 + dz / 2) > 0.08
        ? [next]
        : [];
    });
  private spawn(tile: Tile, hp: number, population: PopulationColor): void {
    this.people.push({
      id: this.nextId++,
      population,
      knight: false,
      survival: createSurvival(),
      sick: false,
      tile,
      home: null,
      power: 0,
      homeLevel: null,
      characterPower: hp,
      x: tile.x + 0.5,
      z: tile.z + 0.5,
      target: null,
      progress: 0,
      wait: 0,
    });
  }
  private reconcile(): void {
    reconcileSettlements(this.people, this.tiles, this.surface, this.lookup);
    this.revision++;
  }
  private mobilize(people: readonly Person[]): void {
    for (const c of people) {
      const point = this.point(c);
      c.x = point.x;
      c.z = point.z;
    }
    evacuateSettlements(people, this.lookup);
    this.reconcile();
    for (const c of people) {
      c.tile = this.tileOf(c);
      c.target = null;
      c.progress = 0;
      c.wait = 0;
    }
  }
  private camp(side: Side, tile: Tile): boolean {
    const leader = side.knights.commander;
    if (!leader) return false;
    const point = this.tileOf(leader);
    return Math.abs(tile.x - point.x) <= 2 && Math.abs(tile.z - point.z) <= 2;
  }
  private encounter(c: Person, side: Side): void {
    if (c.home || c.survival.phase !== 'alive' || c.characterPower <= 0) return;
    const owner = side.leader.leader;
    if (owner && owner.survival.phase !== 'alive') return;
    if (
      owner &&
      side.knights.commander === owner &&
      side.knights.isSuccessor(c) &&
      !c.target &&
      Math.hypot(c.x - owner.x, c.z - owner.z) <= 0.8 &&
      side.leader.transfer(owner, c)
    ) {
      side.knights.complete(c);
      owner.tile = this.tileOf(owner);
      owner.target = null;
      owner.wait = 0;
      owner.progress = 0;
      c.tile = this.tileOf(c);
      c.progress = 0;
      c.wait = 0;
      return;
    }
    if (
      side.leader.encounter(
        c,
        this.tileOf(c),
        owner ? this.tileOf(owner) : null,
        side.leader.rallying || side.knights.donates(c),
        this.finale.active,
      ) === 'absorbed'
    )
      c.survival.phase = 'dead';
  }
  private pursue(c: Person, target: Person | Tile): Tile[] {
    const other = 'characterPower' in target ? target : null;
    const goal = other ? this.tileOf(other) : (target as Tile);
    const starts: Tile[] = [];
    if (this.walkable(goal)) starts.push(goal);
    else {
      const range = other?.home && other.power === 5 ? 2 : 1;
      for (let z = goal.z - range; z <= goal.z + range; z++)
        for (let x = goal.x - range; x <= goal.x + range; x++) {
          const t = this.lookup(x, z);
          if (
            t &&
            this.walkable(t) &&
            (other?.home
              ? touchesBuilding({ x: x + 0.5, z: z + 0.5 }, other.home, other.power)
              : inCombatRange(t, goal, range))
          )
            starts.push(t);
        }
    }
    return rallySteps(
      c.tile,
      this.neighbors(c.tile),
      this.routes.field(c.tile, goal, starts, this.neighbors, this.revision),
    );
  }
  private ai(side: Side, seconds: number): void {
    const own = this.people.filter((c) => c.population === side.color && this.alive(c));
    const reachActors = own.map((c) => ({
      population: c.population,
      characterPower: c.characterPower,
      survival: c.survival,
      point: this.point(c),
    }));
    const reachCache = new Map<number, boolean>();
    const canEdit = (p: GridPoint): boolean => {
      const key = p.z * (this.options.size + 1) + p.x;
      let allowed = reachCache.get(key);
      if (allowed === undefined) {
        allowed = withinTerrainReach(p, false, reachActors, side.color, (c) => c.point);
        reachCache.set(key, allowed);
      }
      return allowed;
    };
    if (
      side.terrain.advance(
        seconds,
        this.surface,
        {
          spend: (cost) =>
            side.money.value - cost >= side.knights.reservedPower && side.money.spend(cost),
        },
        own,
        this.lookup,
        canEdit,
      )?.status === 'changed'
    )
      this.reconcile();
    const action = side.knights.advance(
      seconds,
      this.people,
      side.leader.leader,
      side.color,
      side.money,
      this.point,
      (c) => !c.sick && !this.combat.opponent(c) && (!!c.home || this.walkable(this.tileOf(c))),
    );
    if (action?.kind === 'gather') this.mobilize([action.leader, ...action.recruits]);
    else if (action?.kind === 'handoff') this.mobilize([action.successor]);
    else if (
      action?.kind === 'convert' &&
      convertLeaderToKnight(action.leader, () => side.money.spend(SPELL_COSTS.knight)) ===
        'converted'
    ) {
      side.knights.converted();
      this.mobilize([action.successor]);
    }
    const site = side.terrain.nextBuildSite(this.surface, this.lookup);
    if (site !== side.site || side.buildRevision !== this.revision) {
      side.site = site;
      side.buildRevision = this.revision;
      side.buildDistance = site ? buildRallyField([site], this.neighbors) : new Map<Tile, number>();
    }
    const eligible = (c: Person): boolean =>
      !c.home &&
      !c.knight &&
      !side.knights.holds(c) &&
      !side.knights.follows(c) &&
      c.survival.phase === 'alive' &&
      side.buildDistance.has(this.tileOf(c));
    if (!site) side.builder = null;
    else if (!side.builder || !eligible(side.builder))
      side.builder =
        own
          .filter(eligible)
          .sort(
            (a, b) =>
              (side.buildDistance.get(this.tileOf(a)) ?? Infinity) -
              (side.buildDistance.get(this.tileOf(b)) ?? Infinity),
          )[0] ?? null;
    const opponents = this.people.filter((c) => c.population !== side.color && this.alive(c));
    side.spells.advance(
      seconds,
      { value: Math.max(0, side.money.value - side.knights.reservedPower) },
      opponents.map((c) => ({
        ...this.point(c),
        weight:
          (c.home ? (c.power === 5 ? 6 : 3) : 1) +
          (this.sides.find((s) => s.color === c.population)?.leader.leader === c ? 2 : 0),
      })),
      own.map(this.point),
      (spell, point) => {
        const target = this.lookup(Math.floor(point.x), Math.floor(point.z));
        if (!target) return false;
        const plan = planTerrainSpell(this.surface, spell, target, this.lookup, side.random);
        if (
          !plan.changed ||
          !safeForAllies(
            this.surface,
            plan,
            own
              .filter(this.alive)
              .map((c) => ({ point: this.point(c), home: c.home, castle: c.power === 5 })),
          ) ||
          !side.money.spend(SPELL_COSTS[spell])
        )
          return false;
        for (const tile of plan.marsh) {
          tile.swamp = true;
          this.swamps.add(tile);
        }
        this.surface.levels.set(plan.preview.levels);
        this.surface.changedPoints.length = 0;
        this.surface.changedPoints.push(...plan.preview.changedPoints);
        if (spell === 'volcano')
          markVolcanicRock(this.surface, this.lookup, this.rocks, this.swamps);
        clearSubmergedSwamps(this.surface, this.swamps);
        clearSubmergedRock(this.surface, this.rocks);
        this.reconcile();
        return true;
      },
      side.random,
    );
  }
  step(seconds = this.options.step): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1)
      throw new Error('Step must be in (0, 1]');
    if (this.finale.active) {
      this.stepFinale(seconds);
      return;
    }
    const order =
      Math.floor(this.elapsed / this.options.step) % 2 === 0
        ? this.sides
        : [...this.sides].reverse();
    for (const side of order) this.ai(side, seconds);
    let dirty = false;
    for (const contact of enemyBuildingContacts(
      this.people,
      this.point,
      (c) => !this.combat.opponent(c),
    )) {
      this.mobilize([contact.defender]);
      const p = buildingDefenderPoint(contact.home, this.point(contact.attacker));
      contact.defender.x = p.x;
      contact.defender.z = p.z;
      contact.defender.tile = this.tileOf(contact.defender);
      this.combat.engage(contact.attacker, contact.defender);
    }
    this.combat.match(this.people, this.point);
    const collectors = new Map(
      this.sides.map((side) => [
        side.color,
        side.leader.droppedTile
          ? nearestPoleCollector(
              { x: side.leader.droppedTile.x + 0.5, z: side.leader.droppedTile.z + 0.5 },
              side.color,
              this.people,
              this.point,
              (actor) =>
                !actor.knight &&
                !this.combat.opponent(actor) &&
                side.leader.canRecover(actor, this.tileOf(actor)),
            )
          : null,
      ]),
    );
    const buckets = new Map<string, Person[]>();
    for (const person of this.people)
      if (!person.home && person.survival.phase === 'alive' && person.characterPower > 0) {
        const key = `${Math.floor(person.x / 3)},${Math.floor(person.z / 3)}`,
          bucket = buckets.get(key) ?? [];
        bucket.push(person);
        buckets.set(key, bucket);
      }
    const nearbyOpponent = (c: Person): boolean => {
      const x = Math.floor(c.x / 3),
        z = Math.floor(c.z / 3);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          if (
            buckets
              .get(`${x + dx},${z + dz}`)
              ?.some(
                (other) =>
                  other.population !== c.population &&
                  !other.home &&
                  other.survival.phase === 'alive' &&
                  other.characterPower > 0 &&
                  (other.x - c.x) ** 2 + (other.z - c.z) ** 2 <= 1.6 ** 2,
              )
          )
            return true;
      return false;
    };
    for (const c of this.people) {
      if (!this.alive(c)) continue;
      const side = this.sides.find((s) => s.color === c.population)!;
      if (advanceSickness(c, seconds, Boolean(this.tileOf(c).swamp))) {
        c.survival.phase = 'dead';
        dirty ||= !!c.home;
        continue;
      }
      if (c.home) continue;
      this.encounter(c, side);
      if (c.characterPower <= 0) continue;
      advanceSurvival(c.survival, seconds, this.surface.sample(c.x, c.z) <= 0.08);
      if (c.survival.phase !== 'alive') continue;
      const foe = this.combat.opponent(c);
      if (foe) {
        const offset = combatClosingOffset(this.point(c), this.point(foe), seconds);
        const t = this.lookup(Math.floor(c.x + offset.x), Math.floor(c.z + offset.z));
        if (t && this.walkable(t)) {
          c.x += offset.x;
          c.z += offset.z;
        }
        c.tile = this.tileOf(c);
        c.target = null;
        continue;
      }
      const dropped = side.leader.droppedTile;
      const collector = collectors.get(side.color);
      if (
        c === side.builder &&
        !c.target &&
        c.tile === side.site &&
        !this.camp(side, c.tile) &&
        !nearbyOpponent(c) &&
        c !== collector &&
        trySettle(c, this.surface)
      ) {
        dirty = true;
        continue;
      }
      const following = side.knights.follows(c),
        wasSuccessor = side.knights.isSuccessor(c);
      const enemy =
        c.knight && !side.knights.holds(c) && !following
          ? nearestEnemy(c, this.people, this.tileOf)
          : null;
      const commanded =
        following || !!enemy || side.knights.holds(c) || c === side.builder || c === collector;
      if (!c.target && !commanded) {
        c.wait -= seconds;
        if (c.wait > 0) continue;
      }
      walkDistance(
        c,
        seconds * 0.65,
        () => {
          const options =
            dropped && c === collector
              ? this.pursue(c, dropped)
              : side.knights.holds(c)
                ? []
                : following && side.leader.leader
                  ? this.pursue(c, side.leader.leader)
                  : enemy
                    ? this.pursue(c, enemy)
                    : c === side.builder && side.site
                      ? this.pursue(c, side.site)
                      : this.neighbors(c.tile);
          return options.length ? options[Math.floor(side.random() * options.length)] : null;
        },
        (arrived) => {
          if (arrived) c.wait = side.random() < 0.2 ? side.random() * 3 : 0;
          this.encounter(c, side);
          advanceSickness(c, 0, Boolean(this.tileOf(c).swamp));
          if (c.characterPower <= 0 || (wasSuccessor && !side.knights.isSuccessor(c))) return false;
          if (
            arrived &&
            !c.knight &&
            !side.knights.follows(c) &&
            !side.knights.holds(c) &&
            !this.camp(side, c.tile) &&
            c !== collector &&
            !side.terrain.blocksSettlement(c.tile) &&
            (c !== side.builder || c.tile === side.site) &&
            !nearbyOpponent(c) &&
            trySettle(c, this.surface)
          ) {
            dirty = true;
            return false;
          }
          return commanded || c.wait <= 0;
        },
      );
    }
    for (const dead of this.combat.advance(seconds)) {
      dead.survival.phase = 'dead';
      dead.characterPower = 0;
      dirty ||= !!dead.home;
    }
    for (const side of this.sides) {
      const owner = side.leader.leader;
      if (owner && !this.alive(owner)) side.leader.drop(owner, this.tileOf(owner));
    }
    if (this.people.some((c) => !this.alive(c) && c.home)) {
      evacuateSettlements(
        this.people.filter((c) => !this.alive(c)),
        this.lookup,
      );
      dirty = true;
    }
    this.people = this.people.filter(this.alive);
    if (dirty) this.reconcile();
    const births = growPopulation(
      this.people.filter((c) => !this.combat.opponent(c)),
      seconds,
      (home) =>
        birthLocation(home, this.surface, this.lookup, this.walkable, this.neighbors, (tile) =>
          Boolean(tile.tree),
        ),
    );
    for (const birth of births) this.spawn(birth.tile, birth.characterPower, birth.population!);
    for (const side of this.sides) {
      const own = this.people.filter((c) => c.population === side.color),
        before = side.money.value;
      side.money.advance(
        seconds,
        totalBuildingPower(own, 'normal'),
        totalBuildingPower(own, 'rock'),
      );
      side.earned += side.money.value - before;
      if (
        !Number.isSafeInteger(side.money.value) ||
        side.money.value < 0 ||
        side.money.value !==
          (this.options.startingPower ?? STARTING_POWER) +
            side.earned -
            side.terrain.spent -
            side.spells.spent -
            side.knights.created * SPELL_COSTS.knight -
            side.finaleSpent
      )
        throw new Error('Invalid economy / unaccounted currency');
    }
    if (
      this.people.some(
        (c) =>
          !Number.isFinite(c.characterPower) ||
          c.characterPower < 0 ||
          !Number.isFinite(c.x) ||
          !Number.isFinite(c.z),
      )
    )
      throw new Error('Invalid character state');
    this.elapsed += seconds;
  }
  /** Optional benchmark referee: a real, paid Armageddon, not a material-score win. */
  startFinale(): boolean {
    if (this.finale.active) return false;
    const candidates = this.options.seed % 2 ? [...this.sides].reverse() : this.sides;
    const payer = candidates.find((side) => side.money.value >= SPELL_COSTS.armageddon);
    if (!payer) return false;
    if (
      this.finale.start(
        this.people,
        new Map(this.sides.map((side) => [side.color, side.leader.leader])),
        () => payer.money.spend(SPELL_COSTS.armageddon),
      ) !== 'started'
    )
      return false;
    payer.finaleSpent += SPELL_COSTS.armageddon;
    this.combat.reset();
    for (const side of this.sides) {
      side.knights.cancel();
      side.leader.leader = this.finale.leaders.get(side.color)!;
      side.leader.droppedTile = null;
      side.leader.rallying = true;
    }
    this.mobilize(this.people);
    return true;
  }
  private stepFinale(seconds: number): void {
    if (this.finale.finished) return;
    if (armageddonLand(this.surface, [...this.finale.leaders.values()].map(this.point)))
      this.reconcile();
    this.combat.match([...this.finale.leaders.values()], this.point);
    for (const c of this.people) {
      const side = this.sides.find((s) => s.color === c.population)!;
      if (advanceSickness(c, seconds, Boolean(this.tileOf(c).swamp))) {
        c.survival.phase = 'dead';
        continue;
      }
      advanceSurvival(c.survival, seconds, this.surface.sample(c.x, c.z) <= 0.08);
      if (c.survival.phase !== 'alive') continue;
      this.encounter(c, side);
      if (c.characterPower <= 0) continue;
      const foe = this.combat.opponent(c);
      if (foe) {
        const offset = combatClosingOffset(this.point(c), this.point(foe), seconds);
        const tile = this.lookup(Math.floor(c.x + offset.x), Math.floor(c.z + offset.z));
        if (tile && this.walkable(tile)) {
          c.x += offset.x;
          c.z += offset.z;
        }
        c.tile = this.tileOf(c);
        c.target = null;
        continue;
      }
      const target = this.finale.isLeader(c)
        ? this.finale.leaders.get(c.population === 'red' ? 'blue' : 'red')
        : this.finale.leaders.get(c.population);
      if (!target || target.characterPower <= 0) continue;
      walkDistance(
        c,
        seconds * 0.65 * this.finale.movementMultiplier(c),
        () => {
          const options = this.pursue(c, target);
          return options.length ? options[Math.floor(side.random() * options.length)] : null;
        },
        () => {
          this.encounter(c, side);
          advanceSickness(c, 0, Boolean(this.tileOf(c).swamp));
          return c.characterPower > 0;
        },
      );
    }
    for (const dead of this.combat.advance(seconds)) {
      dead.characterPower = 0;
      dead.survival.phase = 'dead';
    }
    this.people = this.people.filter(this.alive);
    this.elapsed += seconds;
    this.finale.resolve();
  }
  metrics(color: PopulationColor): TeamMetrics {
    const side = this.sides.find((s) => s.color === color)!;
    const own = this.people.filter((c) => c.population === color && this.alive(c));
    return {
      population: own.length,
      hp: own.reduce((n, c) => n + c.characterPower, 0),
      houses: own.filter((c) => c.home).length,
      currency: side.money.value,
      earned: side.earned,
      spellCasts: side.spells.casts,
      spellSpent: side.spells.spent,
      knights: own.filter((c) => c.knight).length,
      trained: side.knights.created,
      terrainEdits: side.terrain.edits,
      terrainSpent: side.terrain.spent,
      finaleSpent: side.finaleSpent,
    };
  }
  run(): MatchResult {
    let red = this.metrics('red'),
      blue = this.metrics('blue');
    while (this.elapsed < this.options.seconds && red.population && blue.population) {
      this.step(Math.min(this.options.step, this.options.seconds - this.elapsed));
      red = this.metrics('red');
      blue = this.metrics('blue');
    }
    if (
      red.population &&
      blue.population &&
      (this.options.finaleSeconds ?? 0) > 0 &&
      this.startFinale()
    ) {
      const deadline = this.options.seconds + this.options.finaleSeconds!;
      while (this.elapsed < deadline && !this.finale.finished)
        this.step(Math.min(this.options.step, deadline - this.elapsed));
      red = this.metrics('red');
      blue = this.metrics('blue');
    }
    return {
      seed: this.options.seed,
      scenario: this.options.scenario,
      red: this.options.red.id,
      blue: this.options.blue.id,
      winner:
        this.finale.winner ??
        (!red.population && !blue.population
          ? 'draw'
          : !red.population
            ? 'blue'
            : !blue.population
              ? 'red'
              : 'draw'),
      reason: this.finale.finished
        ? 'armageddon'
        : !red.population && !blue.population
          ? 'mutual-elimination'
          : !red.population || !blue.population
            ? 'elimination'
            : 'time-limit',
      finale: this.finale.active,
      leaderHP: {
        red: this.finale.leaders.get('red')?.characterPower ?? 0,
        blue: this.finale.leaders.get('blue')?.characterPower ?? 0,
      },
      elapsed: this.elapsed,
      redMetrics: red,
      blueMetrics: blue,
    };
  }
}
