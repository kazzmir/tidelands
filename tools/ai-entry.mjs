import { isMainThread, parentPort, workerData, Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { aiProfiles, profileById } from '../src/ai-profiles.ts';
import {
  scheduleTournament,
  playJob,
  tournamentReport,
  markdownReport,
} from '../src/simulation/tournament.ts';

async function load(path) {
  const data = await readFile(path);
  return JSON.parse((path.endsWith('.gz') ? gunzipSync(data) : data).toString());
}
async function save(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const text = JSON.stringify(value, null, 2) + '\n';
  await writeFile(path + '.tmp', path.endsWith('.gz') ? gzipSync(text) : text);
  await rename(path + '.tmp', path);
}
function args(argv) {
  const values = {};
  const allowed = new Set([
    'games',
    'seed',
    'size',
    'seconds',
    'finale',
    'step',
    'workers',
    'scenarios',
    'profiles',
    'out',
    'resume',
    'replay',
    'match',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (argv[i] === '--help') {
      values.help = true;
      continue;
    }
    if (argv[i] === '--allow-version-change') {
      values.allowVersionChange = true;
      continue;
    }
    if (
      !argv[i].startsWith('--') ||
      !allowed.has(key) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--')
    )
      throw new Error(`Invalid argument: ${argv[i]}`);
    if (key in values) throw new Error(`Duplicate --${key}`);
    values[key] = argv[++i];
  }
  return values;
}
async function startGame() {
  if (!isMainThread) {
    try {
      for (const job of workerData.jobs) parentPort.postMessage({ result: playJob(job) });
    } catch (error) {
      parentPort.postMessage({ error: String(error.stack ?? error) });
      process.exitCode = 1;
    }
    return;
  }
  try {
    const options = args(process.argv.slice(2));
    if (options.help) {
      console.log(
        'AI tournaments: --games 1000 --seed 73129 --size 64 --seconds 360 --finale 180 --step 1 --workers 4 --scenarios plains,tidal,islands,highlands --out reports/tournament.json[.gz]\nResume: --resume reports/tournament.json.checkpoint.json --workers 4\nReplay: --replay reports/tournament.json[.gz] --match 42\nGames must be a multiple of 20 for the five default profiles. --size 500 --scenarios generated runs the actual archipelago (much slower). --profiles balanced,sorcerer restricts a comparison to two policies (games then multiple of 2).',
      );
      return;
    }
    const digest = process.env.TIDELANDS_SIM_DIGEST ?? 'unknown';
    if (options.replay) {
      const report = await load(options.replay);
      if (report.protocol !== 1) throw new Error('Unsupported report protocol');
      if (report.engineDigest !== digest && !options.allowVersionChange)
        throw new Error(
          'Engine/profile code differs from this report. Use the original revision or explicitly --allow-version-change.',
        );
      const id = Number(options.match ?? 0),
        job = scheduleTournament(report.settings).find((job) => job.id === id),
        expected = report.matches.find((match) => match.id === id);
      if (!job || !expected) throw new Error('Match ID not present in report');
      const actual = playJob(job);
      if (report.engineDigest === digest) assert.deepEqual(actual, expected);
      console.log(
        JSON.stringify(
          { verified: JSON.stringify(actual) === JSON.stringify(expected), match: actual },
          null,
          2,
        ),
      );
      return;
    }
    const checkpoint = options.resume ? await load(options.resume) : null;
    if (checkpoint && (checkpoint.protocol !== 1 || checkpoint.engineDigest !== digest))
      throw new Error('Checkpoint engine/profile code does not match this revision');
    const settings = checkpoint?.settings ?? {
      games: Number(options.games ?? 1000),
      seed: Number(options.seed ?? 73129),
      size: Number(options.size ?? 64),
      seconds: Number(options.seconds ?? 360),
      finaleSeconds: Number(options.finale ?? 180),
      step: Number(options.step ?? 1),
      scenarios: (options.scenarios ?? 'plains,tidal,islands,highlands').split(','),
      profiles: options.profiles ? options.profiles.split(',').map(profileById) : aiProfiles(),
    };
    const jobs = scheduleTournament(settings),
      results = checkpoint?.matches ?? [],
      completed = new Set(results.map((result) => result.id));
    if (completed.size !== results.length) throw new Error('Duplicate checkpoint match IDs');
    for (const result of results) {
      const job = jobs[result.id];
      if (
        !job ||
        job.options.seed !== result.seed ||
        job.options.red.id !== result.red ||
        job.options.blue.id !== result.blue ||
        job.options.scenario !== result.scenario ||
        job.fold !== result.fold
      )
        throw new Error('Checkpoint does not match schedule');
    }
    const pending = jobs.filter((job) => !completed.has(job.id)),
      out = options.out ?? checkpoint?.out ?? 'reports/ai-tournament.json';
    const workerCount = Number(options.workers ?? Math.min(4, availableParallelism()));
    if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > 64)
      throw new Error('--workers must be an integer from 1 to 64');
    const workers = [],
      started = Date.now();
    let writes = Promise.resolve();
    const checkpointPath = out + '.checkpoint.json';
    const persist = () =>
      save(checkpointPath, {
        protocol: 1,
        engineDigest: digest,
        settings,
        out,
        matches: results.slice().sort((a, b) => a.id - b.id),
      });
    const interrupt = () => {
      process.exitCode = 130;
      for (const worker of workers) worker.terminate();
    };
    process.once('SIGINT', interrupt);
    console.log(
      `${settings.games} games, ${pending.length} pending, ${workerCount} workers; horizon ${settings.seconds}s + finale ${settings.finaleSeconds ?? 0}s, step ${settings.step}s`,
    );
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(workerCount, pending.length) },
          (_, index) =>
            new Promise((resolve, reject) => {
              const worker = new Worker(new URL(import.meta.url), {
                workerData: { jobs: pending.filter((_, i) => i % workerCount === index) },
              });
              workers.push(worker);
              worker.on('message', (message) => {
                if (message.error) {
                  reject(new Error(message.error));
                  return;
                }
                if (message.result) {
                  results.push(message.result);
                  if (results.length % 20 === 0 || results.length === jobs.length)
                    console.log(
                      `${results.length}/${jobs.length} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
                    );
                  if (results.length % 50 === 0) writes = writes.then(persist);
                }
              });
              worker.once('error', reject);
              worker.once('exit', (code) =>
                code === 0
                  ? resolve()
                  : reject(
                      new Error(
                        `Worker exited ${code}; completed matches saved to ${checkpointPath}`,
                      ),
                    ),
              );
            }),
        ),
      );
    } finally {
      for (const worker of workers) await worker.terminate();
      process.removeListener('SIGINT', interrupt);
      await writes;
      await persist();
    }
    const report = tournamentReport(settings, results, digest);
    report.runtime = {
      node: process.version,
      workers: workerCount,
      wallSeconds: (Date.now() - started) / 1000,
    };
    await save(out, report);
    const base = out.replace(/\.json(?:\.gz)?$/, '');
    await writeFile(base + '.md', markdownReport(report));
    await writeFile(
      base + '.csv',
      [
        'id,seed,scenario,fold,red,blue,winner,reason,elapsed,finale',
        ...report.matches.map((m) =>
          [
            m.id,
            m.seed,
            m.scenario,
            m.fold,
            m.red,
            m.blue,
            m.winner,
            m.reason,
            m.elapsed,
            m.finale,
          ].join(','),
        ),
      ].join('\n') + '\n',
    );
    console.table(
      report.training.map((row) => ({
        profile: row.profile,
        games: row.games,
        wins: row.wins,
        draws: row.draws,
        score: row.score.toFixed(3),
      })),
    );
    console.log(
      `Saved ${out}, ${base}.md and ${base}.csv. Recommendations:`,
      report.recommendations,
    );
    for (const note of report.notes) if (note.startsWith('Insufficient')) console.warn(note);
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = process.exitCode || 1;
  }
}
startGame();
