/** Actual process crash qualification, disposable QA only. No owner HALT changes or financial transport. */
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {open,readFile,mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool} from 'pg';
import {sourceIdentity} from './source-identity.js';
const url=process.env.TEST_DATABASE_URL,directory=process.argv[2];if(!url||new URL(url).pathname!=='/sentinel_d1_test_browser'||!directory||!/^evidence\/[a-z0-9-]+$/.test(directory))throw new Error('ISOLATED_SUPERVISOR_QUALIFICATION_REQUIRED');
await mkdir(directory,{recursive:true});const source=await sourceIdentity(),startedAt=new Date().toISOString(),pool=new Pool({connectionString:url,max:1}),children:ChildProcess[]=[],steps:unknown[]=[],statusPath='.tmp/supervisor-accounting-e2e.status.json';
const before=(await pool.query('SELECT mode,signer_enabled,updated_at FROM system_state WHERE singleton')).rows[0];if(before.mode!=='HALTED'||before.signer_enabled!==false)throw new Error('QA_MUST_BE_HALTED');
const env={...process.env,DATABASE_URL:url,LOCAL_RUNTIME_NAME:'accounting-e2e',LOCAL_WEB_PORT:'3100',API_PORT:'4100',LOCAL_WEB_BUILD:'1',NEXT_DIST_DIR:'.next-signing-qa',SOLANA_RPC_HTTP_URL:'',SOLANA_RPC_WS_URL:''};
const handle=await open('.tmp/supervisor-qualification.log','a',0o600);
const start=(database=url)=>{const p=spawn(process.execPath,['--import','tsx','scripts/supervisor.ts'],{env:{...env,DATABASE_URL:database},detached:true,stdio:['ignore',handle.fd,handle.fd]});children.push(p);return p;};
async function until<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,limit=30000){const end=Date.now()+limit;let last:unknown;while(Date.now()<end){try{const v=await read();if(accept(v))return v;}catch(error){last=error;}await delay(100);}throw new Error('QUALIFICATION_TIMEOUT_'+String(last instanceof Error?last.message:'CONDITION'));}
const status=async()=>JSON.parse(await readFile(statusPath,'utf8'));
const alive=async()=>{try{return (await fetch('http://127.0.0.1:4100/api/v1/health/live',{signal:AbortSignal.timeout(1000)})).status===200;}catch{return false;}};
const worker=async()=>{const row=(await pool.query("SELECT progress->>'workerPid' AS pid FROM worker_heartbeats WHERE state='RUNNING' AND started_at>$1 AND progress->>'sourceIdentity'=$2 AND observed_at>clock_timestamp()-interval '20 seconds' ORDER BY started_at DESC LIMIT 1",[startedAt,source])).rows[0];return row?Number(row.pid):null;};
const listenerPid=(port:number)=>Number(execFileSync('lsof',['-nP','-iTCP:'+port,'-sTCP:LISTEN','-t'],{encoding:'utf8'}).trim());
const exited=(p:ChildProcess,limit=15000)=>until(async()=>p.exitCode!==null||p.signalCode!==null,Boolean,limit);
try{
 let master=start();await until(status,s=>s.pid===master.pid&&s.status==='PROCESS_RUNNING_NOT_READINESS');await until(alive,Boolean);let pid=await until(worker,p=>p!==null);steps.push({step:'STARTED_HALTED_QA',supervisorPid:master.pid,workerPid:pid});
 const duplicate=start();await exited(duplicate,5000);if(duplicate.exitCode!==1||!(await alive()))throw new Error('DUPLICATE_SUPERVISOR_NOT_DENIED');steps.push({step:'DUPLICATE_PROFILE_DENIED',exitCode:duplicate.exitCode});
 const foreign=new URL(url);foreign.pathname='/sentinel_execution_test';const crossDatabase=start(foreign.toString());await exited(crossDatabase,5000);if(crossDatabase.exitCode!==1||!(await alive())||(await status()).pid!==master.pid)throw new Error('CROSS_DATABASE_PROFILE_NOT_PRESERVED');steps.push({step:'CROSS_DATABASE_SAME_PROFILE_DENIED_WITHOUT_REAPING_ACTIVE_STACK',exitCode:crossDatabase.exitCode});
 const apiPid=listenerPid(4100),webPid=listenerPid(3100),stackPid=(await status()).childPid;
 const args=execFileSync('ps',['-p',String(pid),'-o','args='],{encoding:'utf8'});if(!args.includes('apps/worker/src/main.ts'))throw new Error('WORKER_PID_NOT_OWNED');process.kill(pid!,'SIGKILL');const oldWorker=pid;pid=await until(worker,p=>p!==null&&p!==oldWorker);await until(alive,Boolean);if(listenerPid(4100)!==apiPid||listenerPid(3100)!==webPid||(await status()).childPid!==stackPid)throw new Error('WORKER_FAILURE_RESTARTED_HEALTHY_API_OR_WEB');steps.push({step:'WORKER_SIGKILL_RECOVERED_WITH_API_WEB_PRESERVED',oldWorkerPid:oldWorker,newWorkerPid:pid,apiPid,webPid});
 const old=await status();process.kill(old.childPid,'SIGKILL');await until(status,s=>s.pid===master.pid&&s.childPid!==old.childPid&&s.status==='PROCESS_RUNNING_NOT_READINESS');await until(alive,Boolean);steps.push({step:'STACK_LEADER_SIGKILL_AUTO_RECOVERED'});
 const orphan=await status();master.kill('SIGKILL');await exited(master);master=start();await until(status,s=>s.pid===master.pid&&s.childNonce!==orphan.childNonce&&s.status==='PROCESS_RUNNING_NOT_READINESS');await until(alive,Boolean);steps.push({step:'SUPERVISOR_SIGKILL_OLD_TAGGED_STACK_REAPED_AND_RECOVERED',oldChildPid:orphan.childPid,newChildPid:(await status()).childPid});
 master.kill('SIGTERM');await exited(master);await until(alive,v=>!v);const after=(await pool.query('SELECT mode,signer_enabled,updated_at FROM system_state WHERE singleton')).rows[0];if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('QA_HALT_CHANGED');steps.push({step:'GRACEFUL_STOP_AND_HALT_PRESERVED'});
 await writeFile(directory+'/supervisor-result.json',JSON.stringify({startedAt,endedAt:new Date().toISOString(),sourceIdentity:source,classification:'ISOLATED_NONFINANCIAL_REAL_PROCESS_FAULT_INJECTION',status:'PASS',steps,before,after,mainnetSigning:false},null,2)+'\n');console.log('Supervisor real-process qualification PASS; no HALT changes.');
}finally{for(const p of children){if(p.exitCode===null&&p.signalCode===null)p.kill('SIGTERM');}await handle.close();await pool.end();}
