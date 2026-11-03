import { mkdir,readFile,writeFile } from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import { spawn } from 'node:child_process';
import { passwordHash,opaque } from '../apps/api/src/auth.js';
import { validateBootstrap,databasePool } from './runtime.js';
import { migrate } from '../packages/storage/src/index.js';
validateBootstrap();
const pool=databasePool();
try {await migrate(pool);}finally {await pool.end();}
await mkdir('.tmp',{recursive:true,mode:0o700});
const profile=process.env.LOCAL_RUNTIME_NAME??'';if(profile&&!/^[a-z][a-z0-9-]{0,40}$/.test(profile))throw new Error('INVALID_LOCAL_RUNTIME_NAME');
const webPort=Number(process.env.LOCAL_WEB_PORT??3000),apiPort=Number(process.env.API_PORT??4000);if([webPort,apiPort].some(p=>!Number.isInteger(p)||p<1024||p>65535)||webPort===apiPort)throw new Error('INVALID_LOCAL_PORTS');
const suffix=profile?'-'+profile:'';const path='.tmp/local-auth'+suffix+'.json';
let credentials:{serviceToken:string;password:string;passwordHash:string};
try {credentials=JSON.parse(await readFile(path,'utf8')) as typeof credentials;}
catch {const password=opaque();credentials={password,serviceToken:opaque(),passwordHash:await passwordHash(password)};await writeFile(path,JSON.stringify(credentials),{mode:0o600});}
const env={...process.env,NODE_ENV:process.env.LOCAL_WEB_BUILD==='1'?'production':'development',NEXT_TELEMETRY_DISABLED:'1',SERVICE_AUTH_TOKEN:credentials.serviceToken,OWNER_PASSWORD_HASH:credentials.passwordHash,API_PORT:String(apiPort),WEB_ORIGIN:'http://localhost:'+webPort};
const supervised=process.env.SENTINEL_SUPERVISED==='1';
const workerEnv:NodeJS.ProcessEnv={...env},webEnv:NodeJS.ProcessEnv={...env};delete workerEnv.SERVICE_AUTH_TOKEN;delete workerEnv.OWNER_PASSWORD_HASH;
for(const key of ['DATABASE_URL','SERVICE_AUTH_TOKEN','OWNER_PASSWORD_HASH','JUPITER_API_KEY','OPENAI_API_KEY','SOLANA_RPC_HTTP_URL','SOLANA_RPC_WS_URL','BACKUP_PASSPHRASE_FILE'])delete (webEnv as Record<string,string|undefined>)[key];
const requireWeb=createRequire(new URL('../apps/web/package.json',import.meta.url));
const services=[{name:'api',args:['--import','tsx','apps/api/src/main.ts'],env,cwd:process.cwd()},{name:'worker',args:['--import','tsx','apps/worker/src/main.ts'],env:workerEnv,cwd:process.cwd()},{name:'web',args:[requireWeb.resolve('next/dist/bin/next'),process.env.LOCAL_WEB_BUILD==='1'?'start':'dev','--hostname','localhost','--port',String(webPort)],env:webEnv,cwd:fileURLToPath(new URL('../apps/web',import.meta.url))}];
const children=new Map<string,ReturnType<typeof spawn>>(),timers=new Set<ReturnType<typeof setTimeout>>();let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const timer of timers)clearTimeout(timer);timers.clear();for(const child of children.values()){if(!child.pid)continue;try{if(process.platform==='win32'||supervised)child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{/* own child already stopped */}}}
function start(service:typeof services[number],failures=0){if(stopping)return;const began=Date.now(),child=spawn(process.execPath,service.args,{stdio:'inherit',env:service.env,cwd:service.cwd,detached:process.platform!=='win32'&&!supervised});children.set(service.name,child);let handled=false;
 const ended=(code:number)=>{if(handled)return;handled=true;if(children.get(service.name)===child)children.delete(service.name);if(stopping)return;if(!supervised){process.exitCode=code||1;stop();return;}
  const next=Date.now()-began>=60000?0:failures+1,backoff=Math.min(30000,1000*2**Math.min(next,5));console.error(JSON.stringify({event:'SERVICE_RESTART_SCHEDULED',service:service.name,exitCode:code,backoffMs:backoff,mainnetSigning:false}));const timer=setTimeout(()=>{timers.delete(timer);start(service,next);},backoff);timers.add(timer);
 };child.once('error',()=>ended(1));child.once('exit',(code,signal)=>ended(code??(signal?128:1)));
}
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,stop);
for(const service of services)start(service);
await writeFile('.tmp/runtime'+suffix+'.pid',String(process.pid));
console.log('OBSERVE stack: http://localhost:'+webPort+'. Local owner credentials: '+path+' (never share). No signer.');
