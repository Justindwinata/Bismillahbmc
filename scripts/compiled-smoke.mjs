import console from 'node:console';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { Pool,Store,migrate } from '../dist/packages/storage/src/index.js';
import { createApi } from '../dist/apps/api/src/server.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('DISPOSABLE_TEST_DATABASE_REQUIRED');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
const token=randomBytes(32).toString('hex');
const api=createApi(new Store(pool),token);
try {
  await migrate(pool);
  const url=await api.listen({host:'127.0.0.1',port:0});
  const response=await globalThis.fetch(url+'/api/v1/system',{headers:{authorization:`Bearer ${token}`}});
  if (response.status !== 200) throw new Error('COMPILED_API_FAILED');
  const body=await response.json();
  if (body.signerEnabled !== false || body.release !== 'NOT_LIVE_VERIFIED') throw new Error('UNSAFE_BOOTSTRAP');
  console.log(JSON.stringify({compiledApi:'OK',mode:body.mode,signerEnabled:body.signerEnabled,release:body.release}));
} finally {await api.close();await pool.end();}
