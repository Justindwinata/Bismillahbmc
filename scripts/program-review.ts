// Offline technical-review administration. No discovery, signing, order or funding operation.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { databasePool,validateBootstrap } from './runtime.js';
import { migrate } from '../packages/storage/src/index.js';
import { ProgramReviewStore,programReview } from '../packages/storage/src/program-reviews.js';
validateBootstrap();const pool=databasePool();
try{await migrate(pool);const store=new ProgramReviewStore(pool),[command,arg,evidencePath]=process.argv.slice(2);
 if(command==='record'&&arg&&evidencePath){const manifest=programReview.parse(JSON.parse(await readFile(arg,'utf8')));const evidence=await readFile(evidencePath);if(!evidence.length||evidence.length>2_000_000)throw new Error('REVIEW_EVIDENCE_SIZE');if(createHash('sha256').update(evidence).digest('hex')!==manifest.evidenceHash)throw new Error('REVIEW_EVIDENCE_HASH_MISMATCH');const id=await store.approve(manifest);console.log(JSON.stringify({id,status:'TECHNICAL_REVIEW_RECORDED',scope:'PAPER_SHADOW_ONLY',signerEnabled:false}));}
 else if(command==='revoke'&&arg&&evidencePath){console.log(JSON.stringify({id:arg,revoked:await store.revoke(arg,evidencePath),signerEnabled:false}));}
 else throw new Error('USAGE: program-review.ts record <review.json> <review-evidence-file> | revoke <review-id> <reason>');
}finally{await pool.end();}
