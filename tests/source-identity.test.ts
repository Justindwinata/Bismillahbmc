import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceIdentity} from '../scripts/source-identity.js';
it('worker build identity is stable for code/dependencies/policy and excludes environment and local credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sentinel-source-'));try{for(const dir of ['apps','packages','scripts','ops/migrations','config','.tmp','apps/node_modules','apps/.next-secret'])await mkdir(join(root,dir),{recursive:true});await writeFile(join(root,'apps/worker.ts'),'export const x=1');await writeFile(join(root,'config/policy.example.yaml'),'risk: zero');await writeFile(join(root,'pnpm-lock.yaml'),'lockfile: fixture');const initial=await sourceIdentity(root);await writeFile(join(root,'.env'),'FIXTURE_NOT_A_REAL_SECRET');await writeFile(join(root,'.tmp/local-auth.json'),'fixture changed');await writeFile(join(root,'apps/node_modules/secret.ts'),'fixture ignored');await writeFile(join(root,'apps/.next-secret/cache.ts'),'fixture ignored');expect(await sourceIdentity(root)).toBe(initial);await writeFile(join(root,'apps/worker.ts'),'export const x=2');const code=await sourceIdentity(root);expect(code).not.toBe(initial);await writeFile(join(root,'config/policy.example.yaml'),'risk: changed');expect(await sourceIdentity(root)).not.toBe(code);
 }finally{await rm(root,{recursive:true,force:true});}
});
