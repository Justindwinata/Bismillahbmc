import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {requiredSoftwareGates,type GateProof} from './qualification.js';
const digest=z.string().regex(/^[a-f0-9]{64}$/),manifest=z.strictObject({version:z.literal(1),testedSourceIdentity:digest.optional(),proofs:z.array(z.strictObject({id:z.enum(requiredSoftwareGates),status:z.enum(['PARTIAL','BLOCKED_CODE','BLOCKED_PROVIDER','BLOCKED_OWNER','BLOCKED_ENVIRONMENT','BLOCKED_TIME','NOT_RUN','FAIL']),testedScopes:z.array(z.string().min(1).max(500)).max(30),missingScopes:z.array(z.string().min(1).max(500)).min(1).max(30),sources:z.record(z.string(),digest),artifacts:z.array(z.strictObject({path:z.string(),sha256:digest})).min(1).max(10)})).max(20)});
class EvidenceError extends Error{}
const sha=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
/** Only partial/blocked evidence can be loaded here. This manifest cannot grant a release PASS or financial authority. */
export async function loadReleaseEvidence(root=process.cwd()):Promise<{testedSourceIdentity:string|null;proofs:GateProof[];issues:{gate:string;reason:string}[]}>{
 const base=await realpath(root),issues:{gate:string;reason:string}[]=[],proofs:GateProof[]=[];
 const safeRead=async(path:string,kind:'source'|'artifact'|'manifest')=>{
  if(path.includes('..')||path.includes('\\')||!(/^[A-Za-z0-9_./-]+$/).test(path))throw new EvidenceError('EVIDENCE_PATH_DENIED');
  if(kind==='source'&&!/^(packages|apps|scripts|ops\/migrations)\/.*\.(ts|tsx|sql|py)$/.test(path))throw new EvidenceError('SOURCE_PATH_DENIED');
  if(kind!=='source'&&(!path.startsWith('evidence/')||!path.endsWith('.json')))throw new EvidenceError('EVIDENCE_PATH_DENIED');
  const full=await realpath(resolve(base,path));if(!full.startsWith(base+sep))throw new EvidenceError('EVIDENCE_PATH_DENIED');if((await stat(full)).size>2*1024*1024)throw new EvidenceError('EVIDENCE_SIZE_CAP');return readFile(full);
 };
 let data:z.infer<typeof manifest>;try{data=manifest.parse(JSON.parse((await safeRead('evidence/software-gates.json','manifest')).toString()));if(new Set(data.proofs.map(p=>p.id)).size!==data.proofs.length||data.proofs.some(p=>p.id==='SAFE_LOCKED_DEFAULTS'))throw new Error('INVALID_GATE_SET');}catch{return {testedSourceIdentity:null,proofs:[],issues:[{gate:'MANIFEST',reason:'EVIDENCE_UNAVAILABLE_OR_INVALID'}]};}
 for(const item of data.proofs){try{
  if(Object.keys(item.sources).length<1||Object.keys(item.sources).length>100)throw new EvidenceError('SOURCE_PROOF_REQUIRED');
  for(const [path,expected]of Object.entries(item.sources))if(sha(await safeRead(path,'source'))!==expected)throw new EvidenceError('SOURCE_CHANGED_SINCE_TEST');
  for(const artifact of item.artifacts){const bytes=await safeRead(artifact.path,'artifact');if(sha(bytes)!==artifact.sha256)throw new EvidenceError('EVIDENCE_HASH_MISMATCH');const raw:unknown=JSON.parse(bytes.toString());const records=z.array(z.object({command:z.union([z.string().min(1),z.array(z.string()).min(1)]),exitCode:z.number().int()})).min(1).parse(Array.isArray(raw)?raw:[raw]);if(records.some(r=>r.exitCode!==0))throw new EvidenceError('EXECUTED_COMMAND_FAILED');if(data.testedSourceIdentity){const attest=z.array(z.object({beforeSourceIdentity:digest,afterSourceIdentity:digest})).safeParse(Array.isArray(raw)?raw:[raw]);if(!attest.success||attest.data.some(r=>r.beforeSourceIdentity!==data.testedSourceIdentity||r.afterSourceIdentity!==data.testedSourceIdentity))throw new EvidenceError('SOURCE_IDENTITY_ATTESTATION_MISMATCH');}}
  proofs.push({id:item.id,status:item.status,evidence:item.artifacts.map(a=>a.path).join('; '),testedScopes:item.testedScopes,missingScopes:item.missingScopes});
 }catch(error){const reason=error instanceof EvidenceError?error.message:'EVIDENCE_UNAVAILABLE_OR_INVALID';issues.push({gate:item.id,reason});proofs.push({id:item.id,status:reason==='EXECUTED_COMMAND_FAILED'?'FAIL':'NOT_RUN',evidence:reason,testedScopes:item.testedScopes,missingScopes:['Current source/evidence verification required',...item.missingScopes]});}}
 return {testedSourceIdentity:issues.some(i=>i.reason==='SOURCE_IDENTITY_ATTESTATION_MISMATCH')?null:data.testedSourceIdentity??null,proofs,issues};
}
