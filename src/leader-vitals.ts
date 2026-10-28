import type { CombatCharacter } from './knights';
import type { CombatPair } from './combat';

export interface LeaderVitals {
  hp: number;
  power: number;
  maximum: number;
}

/** Character HP/power, never the player's currency or the resident's building level. */
export function leaderVitals<C extends CombatCharacter>(
  owner: C | null,
  pairs: readonly Pick<CombatPair<C>, 'a' | 'b' | 'powerA' | 'powerB'>[],
): LeaderVitals | null {
  if (
    !owner ||
    !Number.isFinite(owner.characterPower) ||
    owner.characterPower <= 0 ||
    owner.survival.phase === 'dead' ||
    owner.survival.phase === 'sinking'
  )
    return null;
  const alive = (character: C): boolean =>
    character.characterPower > 0 && character.survival.phase === 'alive';
  const fight = pairs.find(
    (pair) => (pair.a === owner || pair.b === owner) && alive(pair.a) && alive(pair.b),
  );
  const power = fight ? (fight.a === owner ? fight.powerA : fight.powerB) : owner.characterPower;
  return {
    hp: owner.characterPower,
    power: Number.isFinite(power) ? Math.max(0, power) : 0,
    maximum: 10_000,
  };
}

export function createLeaderVitalsView(root: HTMLElement, world: HTMLElement, spells: HTMLElement) {
  const hpBar = root.querySelector<HTMLProgressElement>('#leader-hp')!;
  const powerBar = root.querySelector<HTMLProgressElement>('#leader-power')!;
  const hpValue = root.querySelector<HTMLOutputElement>('#leader-hp-value')!;
  const powerValue = root.querySelector<HTMLOutputElement>('#leader-power-value')!;
  const numbers = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  let previous = '';
  let queued = false;
  let layoutFrame = 0;

  function fitSpells(): void {
    if (queued) return;
    queued = true;
    layoutFrame = requestAnimationFrame(() => {
      queued = false;
      const last = spells.querySelector<HTMLButtonElement>('.spell:last-of-type');
      if (!last) return;
      const style = getComputedStyle(spells);
      const bottom =
        spells.getBoundingClientRect().bottom -
        parseFloat(style.paddingBottom) -
        parseFloat(style.borderBottomWidth);
      const scrollable = last.getBoundingClientRect().bottom + spells.scrollTop > bottom + 1;
      if (spells.classList.contains('scrollable') === scrollable) return;
      spells.classList.toggle('scrollable', scrollable);
      for (const button of spells.querySelectorAll<HTMLButtonElement>('.spell')) {
        if (scrollable) button.title = button.getAttribute('aria-label') ?? 'Spell';
        else button.removeAttribute('title');
      }
    });
  }
  const observer = new ResizeObserver(fitSpells);
  observer.observe(world);
  observer.observe(spells);

  return {
    update(stats: LeaderVitals | null): void {
      const visible = stats !== null;
      if (root.hidden === visible) {
        root.hidden = !visible;
        fitSpells();
      }
      world.classList.toggle('has-leader', visible);
      if (!stats) {
        previous = '';
        return;
      }
      const key = `${stats.hp}/${stats.power}/${stats.maximum}`;
      if (key === previous) return;
      previous = key;
      for (const [bar, output, value, label] of [
        [hpBar, hpValue, stats.hp, 'HP'],
        [powerBar, powerValue, stats.power, 'power'],
      ] as const) {
        bar.max = stats.maximum;
        bar.value = Math.min(stats.maximum, value);
        bar.setAttribute(
          'aria-valuetext',
          `${numbers.format(value)} ${label}; bar maximum ${numbers.format(stats.maximum)}`,
        );
        output.value = numbers.format(value);
        output.title = `${numbers.format(value)} / ${numbers.format(stats.maximum)}`;
      }
    },
    dispose(): void {
      observer.disconnect();
      if (queued) cancelAnimationFrame(layoutFrame);
      queued = false;
    },
  };
}
