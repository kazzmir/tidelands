import { build } from 'vite';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function startGame() {
  try {
    const result = await build({
      configFile: false,
      logLevel: 'error',
      build: {
        write: false,
        minify: false,
        target: 'node22',
        lib: { entry: resolve('tools/ai-entry.mjs'), formats: ['es'], fileName: 'runner' },
        rolldownOptions: { external: [/^node:/] },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const chunk = outputs
      .flatMap((result) => result.output)
      .find((output) => output.type === 'chunk' && output.isEntry);
    if (!chunk) throw new Error('AI runner build did not produce an entry');
    const digest = createHash('sha256').update(chunk.code).digest('hex');
    const folder = resolve('.cache/ai-tournament');
    await mkdir(folder, { recursive: true });
    const file = resolve(folder, `runner-${digest.slice(0, 16)}.mjs`);
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, chunk.code);
    await rename(temporary, file);
    process.env.TIDELANDS_SIM_DIGEST = digest;
    await import(pathToFileURL(file).href);
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  }
}
startGame();
