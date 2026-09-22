import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const input = process.argv[2];
const command = process.platform === 'win32' ? 'npm.cmd exec -- vitest run src/lookup/dictionary-coverage.audit.test.ts' : 'npm exec -- vitest run src/lookup/dictionary-coverage.audit.test.ts';
const env = { ...process.env, RUN_DICTIONARY_AUDIT: '1', ...(input ? { DICTIONARY_AUDIT_INPUT: resolve(input) } : {}) };
const run = spawnSync(command, { cwd: process.cwd(), env, encoding: 'utf8', shell: true });
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? run.error?.message ?? '');
process.exitCode = run.status ?? 1;
