// EMBERWING — Canyon Courier. Entry program for the make.fun best flight game
// bounty (best-flight-game-20261126-0057), Node 22, standard library only.
//
// The game itself is plain static files under game/ (index.html plus its own
// scripts and the vendored three.min.js), and the screenshots are real renders
// of it. This program hands the entry in: it copies game/ and screenshots/
// from beside this file into the output directory and writes dossier.json,
// the summary the judge reads, using the vendored make.fun library.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: run it twice and the output bytes match.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countEntries(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    total += 1;
    if (statSync(path).isDirectory()) total += countEntries(path);
  }
  return total;
}

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(outDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), shotsDir, { recursive: true });
}

// The caps match the scorer's gate: no more than 4 screenshots and none over
// 256 KiB; game/ at most 993 files and directories and 48 MiB in all, no path
// over 1000 bytes. Everything (game/, screenshots/, dossier.json) shares the
// platform's own 1000-entry / 64 MiB output cap, so the game leaves room.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(
  `emberwing: wrote ${countEntries(join(outDir, 'game'))} game entries and ` +
    `${readdirSync(shotsDir).length} screenshots to ${outDir}`,
);
