import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { cpSync } from 'node:fs';
const result = spawnSync('pnpm',['exec','tsc','-p','tsconfig.build.json'],{stdio:'inherit',shell:process.platform === 'win32'});
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync('config','dist/config',{recursive:true});
cpSync('ops/migrations','dist/ops/migrations',{recursive:true});

cpSync('pnpm-lock.yaml','dist/pnpm-lock.yaml');
