import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

for (const workflow of ['cloud-check.yml', 'game-sweep.yml']) {
  const path = fileURLToPath(new URL(`../../.github/workflows/${workflow}`, import.meta.url));
  const source = await readFile(path, 'utf8');
  const pnpmSetup = source.indexOf('uses: pnpm/action-setup@v4');
  const nodeSetup = source.indexOf('uses: actions/setup-node@v4');

  assert.notEqual(pnpmSetup, -1, `${workflow} must install pnpm`);
  assert.notEqual(nodeSetup, -1, `${workflow} must set up Node.js`);
  assert.ok(pnpmSetup < nodeSetup, `${workflow} must install pnpm before setup-node configures the pnpm cache`);
}

console.log('Workflow setup order is valid: pnpm is available before setup-node configures its cache.');
