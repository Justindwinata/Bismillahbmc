/** Non-financial local process supervisor. Does not resume HALT, sign, submit, provision secrets or modify policy. */
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {validateBootstrap,databasePool} from './runtime.js';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {migrate} from '../packages/storage/src/index.js';
import {sourceIdentity} from './source-identity.js';
validateBootstrap();if(process.platform==='win32')throw new Error('POSIX_SUPERVISOR_REQUIRED');
const root=fileURLToPath(new URL('../',import.meta.url)),profile=process.env.LOCAL_RUNTIME_NAME??'';
if(profile&&!/^[a-z][a-z0-9-]{0,40}$/.test(profile))throw new Error('INVALID_SUPERVISOR_PROFILE');
const prefix=root+'.tmp/supervisor'+(profile?'-'+profile:''),stop=new AbortController();let child:ChildProcess|undefined,restarts=0,lastExit:number|null=null,nonce='',publish=false;
await mkdir(root+'.tmp',{recursive:true,mode:0o700});
const dbUrl=new URL(process.env.DATABASE_URL??'');const databaseIdentity=createHash('sha256').update(JSON.stringify([dbUrl.protocol,dbUrl.hostname,dbUrl.port,dbUrl.username,dbUrl.pathname])).digest('hex');
const identity=await sourceIdentity();
const state=async(status:string,reason:string|null=null)=>{const record={status,reason,root,databaseIdentity,childNonce:nonce,readiness:'NOT_EVALUATED_BY_SUPERVISOR',pid:process.pid,childPid:child?.pid??null,restarts,restartCounterScope:'CURRENT_SUPERVISOR_PROCESS',lastExit,sourceIdentity:identity,recordedAt:new Date().toISOString(),financialAuthorization:'NONE',mainnetSigning:false};await writeFile(prefix+'.'+process.pid+'.status.json',JSON.stringify(record)+'\n',{mode:0o600});if(!publish)return;await writeFile(prefix+'.status.partial',JSON.stringify(record)+'\n',{mode:0o600});await rename(prefix+'.status.partial',prefix+'.status.json');};
function signalGroup(signal:NodeJS.Signals){if(!child?.pid)return;try{if(process.platform==='win32')child.kill(signal);else process.kill(-child.pid,signal);}catch{/* own group already gone */}}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{stop.abort();signalGroup('SIGTERM');});
const pool=databasePool();let session:PoolClient|undefined,healthy=false,owned=false;const lockKey=createHash('sha256').update(root+'|'+profile+'|'+(process.env.LOCAL_WEB_PORT??'3000')+'|'+(process.env.API_PORT??'4000')).digest().readInt32BE();
try{while(!stop.signal.aborted){
 try{
  if(session&&!healthy){session.release(true);session=undefined;}
  if(!session){session=await pool.connect();healthy=true;const current=session;session.on('error',()=>{if(session===current){healthy=false;publish=false;signalGroup('SIGTERM');}});const lock=(await session.query('SELECT pg_try_advisory_lock(7011005,$1) AS owned',[lockKey])).rows[0];if(!lock.owned){console.error('SUPERVISOR_PROFILE_ALREADY_RUNNING');process.exitCode=1;stop.abort();break;}owned=true;
   let old:Record<string,unknown>|null=null;try{old=JSON.parse(await readFile(prefix+'.status.json','utf8'));}catch{/* no prior status */}
   // Advisory locks are scoped to one database: a same-profile stack in another DB must never be reaped.
   if(old&&old.databaseIdentity!==databaseIdentity&&Number.isSafeInteger(old.pid)&&Number(old.pid)>1){let active=false;try{active=execFileSync('ps',['-p',String(old.pid),'-o','args='],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).includes('scripts/supervisor.ts');}catch{/* old supervisor gone */}if(active){console.error('SUPERVISOR_PROFILE_DATABASE_CONFLICT');process.exitCode=1;stop.abort();break;}}
   try{if(old?.root===root&&Number.isSafeInteger(old.childPid)&&Number(old.childPid)>1&&typeof old.childNonce==='string'&&/^[a-f0-9-]{36}$/.test(old.childNonce)){
    const args=execFileSync('ps',['-p',String(old.childPid),'-o','args='],{encoding:'utf8',stdio:['ignore','pipe','ignore']});if(args.includes('scripts/dev-local.ts')&&args.includes('--sentinel-supervisor-child='+old.childNonce)){
     if(old.databaseIdentity!==databaseIdentity){console.error('SUPERVISOR_LEGACY_OR_FOREIGN_STACK_NOT_REAPED');process.exitCode=1;stop.abort();break;}
     process.kill(-Number(old.childPid),'SIGTERM');await delay(1000);try{process.kill(-Number(old.childPid),'SIGKILL');}catch{/* prior group exited */}
    }
   }}catch{/* absent/dead/unverifiable previous process is never killed */}
   publish=true;
   await migrate(pool);
  }
  const s=(await session.query('SELECT mode,signer_enabled FROM system_state WHERE singleton')).rows[0];if(!s||s.signer_enabled!==false)throw new Error('LOCKED_STATE_REQUIRED');
 }catch{if(session){session.release(true);session=undefined;healthy=false;}publish=false;await state('WAITING_DATABASE','READ_ONLY_DATABASE_UNAVAILABLE');try{await delay(5000,undefined,{signal:stop.signal});}catch{/* graceful stop */}continue;}
 if(stop.signal.aborted)break;
 nonce=randomUUID();child=spawn(process.execPath,['--import','tsx','scripts/dev-local.ts','--sentinel-supervisor-child='+nonce],{cwd:root,env:{...process.env,SENTINEL_SUPERVISED:'1'},detached:true,stdio:['ignore','inherit','inherit']});await state('PROCESS_RUNNING_NOT_READINESS');
 let timer:ReturnType<typeof setTimeout>|undefined;const abort=()=>{signalGroup('SIGTERM');timer=setTimeout(()=>signalGroup('SIGKILL'),10000);timer.unref();};stop.signal.addEventListener('abort',abort,{once:true});
 try{lastExit=await new Promise<number>(resolve=>{child!.once('error',()=>resolve(1));child!.once('exit',(code,signal)=>resolve(code??(signal?128:1)));});}
 finally{if(timer)clearTimeout(timer);stop.signal.removeEventListener('abort',abort);signalGroup('SIGTERM');}
 if(stop.signal.aborted)break;
 // Include descendants when the stack leader was killed before forwarding shutdown.
 await delay(500);signalGroup('SIGKILL');restarts++;await state('BACKOFF','STACK_EXITED_RESTARTING_WITHOUT_RESUMING_HALT');
 const backoff=Math.min(30000,1000*2**Math.min(restarts-1,5));try{await delay(backoff,undefined,{signal:stop.signal});}catch{/* graceful stop */}
 }}finally{signalGroup('SIGTERM');for(let i=0;i<100&&child?.pid;i++){try{process.kill(-child.pid,0);}catch{break;}await delay(100);}signalGroup('SIGKILL');if(owned)await state('STOPPED');publish=false;if(session){try{await session.query('SELECT pg_advisory_unlock(7011005,$1)',[lockKey]);}catch{/* broken connection already released its lock */}session.release(!healthy);}await pool.end();}
