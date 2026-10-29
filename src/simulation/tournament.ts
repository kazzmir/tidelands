import { SimulationGame, type MatchOptions, type MatchResult, type Scenario } from './game';
import type { AIProfile } from '../ai-profiles';

export interface TournamentSettings {
  games: number;
  seed: number;
  size: number;
  seconds: number;
  step: number;
  finaleSeconds?: number;
  scenarios: Scenario[];
  profiles: readonly AIProfile[];
}
export interface MatchJob {
  id: number;
  fold: 'training' | 'holdout';
  options: MatchOptions;
}
export interface MatchRecord extends MatchResult {
  id: number;
  fold: 'training' | 'holdout';
}
export interface Standing {
  profile: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  timeouts: number;
  score: number;
  interval95: [number, number];
  meanHP: number;
  meanEarned: number;
  meanTrained: number;
}
export interface TournamentReport {
  runtime?: { node: string; workers: number; wallSeconds: number };
  protocol: 1;
  createdAt: string;
  engineDigest: string;
  settings: TournamentSettings;
  matches: MatchRecord[];
  training: Standing[];
  holdout: Standing[];
  recommendations: { easy: string; normal: string; hard: string };
  notes: string[];
}

export function scheduleTournament(settings: TournamentSettings): MatchJob[] {
  const { games, seed, profiles, scenarios } = settings;
  const perRound = profiles.length * (profiles.length - 1);
  if (
    profiles.length < 2 ||
    new Set(profiles.map((p) => p.id)).size !== profiles.length ||
    profiles.some((profile) => !/^[a-z][a-z0-9-]*$/.test(profile.id)) ||
    !scenarios.length ||
    scenarios.some((s) => !['plains', 'tidal', 'islands', 'highlands', 'generated'].includes(s)) ||
    !Number.isSafeInteger(games) ||
    games < perRound ||
    games > 100000 ||
    games % perRound ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new Error(
      `Games must be a positive multiple of ${perRound}, with unique profiles, valid seeds and scenarios (maximum 100000 games)`,
    );
  for (const profile of profiles)
    if (profile.terrainInterval < 4)
      throw new Error('AI terrain intervals must preserve the four-second minimum');
  // Validate all simulation options before starting workers.
  if (
    !Number.isInteger(settings.size) ||
    settings.size < 40 ||
    settings.size > 500 ||
    !Number.isFinite(settings.seconds) ||
    settings.seconds <= 0 ||
    settings.seconds > 7200 ||
    !Number.isFinite(settings.step) ||
    settings.step <= 0 ||
    settings.step > 1 ||
    (scenarios.includes('generated') && settings.size < 160) ||
    !Number.isFinite(settings.finaleSeconds ?? 0) ||
    (settings.finaleSeconds ?? 0) < 0 ||
    (settings.finaleSeconds ?? 0) > 1800
  )
    throw new Error('Invalid world size, horizon or simulation step');
  const rounds = games / perRound,
    trainingRounds = rounds >= 5 ? Math.floor(rounds * 0.8) : rounds;
  const jobs: MatchJob[] = [];
  for (let round = 0; round < rounds; round++)
    for (let a = 0; a < profiles.length; a++)
      for (let b = a + 1; b < profiles.length; b++)
        for (let swap = 0; swap < 2; swap++) {
          jobs.push({
            id: jobs.length,
            fold: round < trainingRounds ? 'training' : 'holdout',
            options: {
              seed: (seed + round) >>> 0,
              scenario: scenarios[round % scenarios.length],
              size: settings.size,
              seconds: settings.seconds,
              step: settings.step,
              finaleSeconds: settings.finaleSeconds ?? 0,
              red: profiles[swap ? b : a],
              blue: profiles[swap ? a : b],
            },
          });
        }
  return jobs;
}
export function playJob(job: MatchJob): MatchRecord {
  return { ...new SimulationGame(job.options).run(), id: job.id, fold: job.fold };
}
export function standings(
  matches: readonly MatchRecord[],
  profiles: readonly AIProfile[],
): Standing[] {
  return profiles
    .map((profile) => {
      const games = matches
        .filter((m) => m.red === profile.id || m.blue === profile.id)
        .slice()
        .sort((a, b) => a.id - b.id);
      let wins = 0,
        draws = 0,
        timeouts = 0,
        hp = 0,
        earned = 0,
        trained = 0;
      const clusters = new Map<number, number[]>();
      for (const match of games) {
        const color = match.red === profile.id ? 'red' : 'blue',
          won = match.winner === color,
          draw = match.winner === 'draw';
        if (won) wins++;
        if (draw) draws++;
        if (match.reason === 'time-limit') timeouts++;
        const score = won ? 1 : draw ? 0.5 : 0,
          cluster = clusters.get(match.seed) ?? [];
        cluster.push(score);
        clusters.set(match.seed, cluster);
        const metrics = color === 'red' ? match.redMetrics : match.blueMetrics;
        hp += metrics.hp;
        earned += metrics.earned;
        trained += metrics.trained;
      }
      const score = games.length ? (wins + draws * 0.5) / games.length : 0;
      const means = [...clusters.values()].map(
        (values) => values.reduce((a, b) => a + b, 0) / values.length,
      );
      // Cluster by map seed: swapped sides and opponents on the same terrain are not independent trials.
      const variance =
        means.length > 1
          ? means.reduce((sum, x) => sum + (x - score) ** 2, 0) / (means.length - 1)
          : 0;
      const error = means.length > 1 ? 1.96 * Math.sqrt(variance / means.length) : 1;
      return {
        profile: profile.id,
        games: games.length,
        wins,
        draws,
        losses: games.length - wins - draws,
        timeouts,
        score,
        interval95: [Math.max(0, score - error), Math.min(1, score + error)] as [number, number],
        meanHP: games.length ? hp / games.length : 0,
        meanEarned: games.length ? earned / games.length : 0,
        meanTrained: games.length ? trained / games.length : 0,
      };
    })
    .sort((a, b) => b.score - a.score || a.profile.localeCompare(b.profile));
}
export function tournamentReport(
  settings: TournamentSettings,
  matches: MatchRecord[],
  engineDigest: string,
): TournamentReport {
  const jobs = scheduleTournament(settings);
  if (matches.length !== jobs.length || new Set(matches.map((m) => m.id)).size !== jobs.length)
    throw new Error('Incomplete or duplicated tournament results');
  for (const match of matches) {
    const job = jobs[match.id];
    if (
      !job ||
      job.fold !== match.fold ||
      job.options.seed !== match.seed ||
      job.options.scenario !== match.scenario ||
      job.options.red.id !== match.red ||
      job.options.blue.id !== match.blue
    )
      throw new Error('Result does not match scheduled seed, side or profile');
    if (
      !['red', 'blue', 'draw'].includes(match.winner) ||
      !['elimination', 'mutual-elimination', 'time-limit', 'armageddon'].includes(match.reason) ||
      !Number.isFinite(match.elapsed) ||
      match.elapsed < 0 ||
      match.elapsed > settings.seconds + (settings.finaleSeconds ?? 0) + 1e-6
    )
      throw new Error('Invalid match outcome');
    for (const metrics of [match.redMetrics, match.blueMetrics]) {
      if (
        Object.values(metrics).some((value) => !Number.isFinite(value) || value < 0) ||
        Object.entries(metrics).some(
          ([key, value]) => key !== 'hp' && !Number.isSafeInteger(value),
        ) ||
        metrics.currency !==
          10000 +
            metrics.earned -
            metrics.spellSpent -
            metrics.terrainSpent -
            metrics.trained * 1000 -
            metrics.finaleSpent
      )
        throw new Error('Invalid match metrics or economy');
    }
    if (
      typeof match.finale !== 'boolean' ||
      !match.leaderHP ||
      Object.values(match.leaderHP).some((hp) => !Number.isFinite(hp) || hp < 0) ||
      match.redMetrics.finaleSpent + match.blueMetrics.finaleSpent !== (match.finale ? 6000 : 0) ||
      (match.finale && (!(settings.finaleSeconds ?? 0) || match.elapsed < settings.seconds))
    )
      throw new Error('Invalid finale accounting');
    if (match.reason === 'armageddon') {
      const red = match.leaderHP.red > 0,
        blue = match.leaderHP.blue > 0;
      const winner = red ? (blue ? 'invalid' : 'red') : blue ? 'blue' : 'draw';
      if (!match.finale || match.elapsed < settings.seconds || match.winner !== winner)
        throw new Error('Invalid Armageddon outcome');
      continue;
    }
    const red = match.redMetrics.population,
      blue = match.blueMetrics.population;
    const winner = red ? (blue ? 'draw' : 'red') : blue ? 'blue' : 'draw';
    const reason =
      red && blue ? 'time-limit' : !red && !blue ? 'mutual-elimination' : 'elimination';
    if (
      match.winner !== winner ||
      match.reason !== reason ||
      (reason === 'time-limit' &&
        Math.abs(
          match.elapsed - settings.seconds - (match.finale ? (settings.finaleSeconds ?? 0) : 0),
        ) > 1e-6)
    )
      throw new Error('Outcome is inconsistent with surviving populations');
  }
  const training = standings(
      matches.filter((m) => m.fold === 'training'),
      settings.profiles,
    ),
    holdout = standings(
      matches.filter((m) => m.fold === 'holdout'),
      settings.profiles,
    );
  return {
    protocol: 1,
    createdAt: new Date().toISOString(),
    engineDigest,
    settings,
    matches: matches.slice().sort((a, b) => a.id - b.id),
    training,
    holdout,
    recommendations: {
      easy: training[training.length - 1].profile,
      normal: training[Math.floor(training.length / 2)].profile,
      hard: training[0].profile,
    },
    notes: [
      'Ranking uses actual elimination or Armageddon leader deaths: win=1, draw=0.5. Time limits are draws, never material-score victories.',
      'Optional referee finale starts paid Armageddon at the regular horizon if either side can pay 6000. Payer priority alternates by seed; the other side is forced to rally, exactly as in the game. Disable with --finale 0 for natural-elimination-only matches.',
      'Each pair plays both sides of the same seeded world. Confidence intervals are approximate 95% seed-cluster intervals, not proof of superiority.',
      'Recommendations use training seeds only; holdout seeds are reported separately and are not used to select profiles.',
      'Shared production terrain, economy, growth, combat, spell, and AI modules run without rendering. Fixed-step movement/contact timing and compact controlled maps differ from the interactive 500x500 game; benchmark strength is not a guarantee against humans.',
      'No resource, HP, damage, birth-rate, or price bonuses. All profiles start with 24 characters and 10000 power per side.',
      ...(settings.games / (settings.profiles.length * (settings.profiles.length - 1)) < 5 ||
      training[0].score === training[training.length - 1].score
        ? [
            'Insufficient independent seeds or no score separation: recommendations are not evidence of different strength. Run more/longer games.',
          ]
        : []),
    ],
  };
}
export function markdownReport(report: TournamentReport): string {
  function table(rows: Standing[]): string {
    return [
      '| Profile | Games | W / D / L | Score | Approx. 95% CI | Timeouts | Mean knights trained |',
      '|---|---:|---:|---:|---:|---:|---:|',
      ...rows.map(
        (r) =>
          `| ${r.profile} | ${r.games} | ${r.wins} / ${r.draws} / ${r.losses} | ${(100 * r.score).toFixed(1)}% | ${r.interval95.map((x) => (100 * x).toFixed(1)).join('–')}% | ${r.timeouts} | ${r.meanTrained.toFixed(2)} |`,
      ),
    ].join('\n');
  }
  return `# Tidelands AI tournament\n\n${report.settings.games} games · seeds starting ${report.settings.seed} · ${report.settings.size}×${report.settings.size} · ${report.settings.seconds}s regular phase + up to ${report.settings.finaleSeconds ?? 0}s paid finale · ${report.settings.step}s steps\n\nScenarios: ${report.settings.scenarios.join(', ')}\n\n## Training\n\n${table(report.training)}\n\n## Unseen holdout seeds\n\n${table(report.holdout)}\n\nTraining recommendations: Easy **${report.recommendations.easy}**, Normal **${report.recommendations.normal}**, Hard **${report.recommendations.hard}**. These are recommendations, not an automatic change to the game.\n\n${report.notes.map((note) => '- ' + note).join('\n')}\n\nEngine digest: \`${report.engineDigest}\`\n`;
}
