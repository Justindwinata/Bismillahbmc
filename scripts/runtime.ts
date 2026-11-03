import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { bootstrapEnv,bootstrapPolicy } from '../packages/domain/src/index.js';
import { Pool } from '../packages/storage/src/index.js';
export function validateBootstrap() {
  bootstrapEnv.parse(process.env);
  return bootstrapPolicy.parse(parse(readFileSync(new URL('../config/policy.example.yaml',import.meta.url),'utf8')));
}
export function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  return new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:3000,query_timeout:5000});
}
