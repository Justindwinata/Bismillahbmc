import { readFile,link,stat,unlink,mkdir } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import {sealBackupStream,withVerifiedBackup} from './backup-stream.js';
import {pipeline} from 'node:stream/promises';
import type {Readable} from 'node:stream';
const mode=process.argv[2],file=process.env.BACKUP_FILE,passwordFile=process.env.BACKUP_PASSPHRASE_FILE,url=process.env.DATABASE_URL;
if(!['backup','restore'].includes(mode??'')||!file||!passwordFile||!url)throw new Error('REQUIRE_MODE_BACKUP_FILE_PASSPHRASE_FILE_DATABASE_URL');
const target=resolve(file);if(!target.endsWith('.sentinel.enc'))throw new Error('ENCRYPTED_SUFFIX_REQUIRED');
const permissions=await stat(passwordFile);if(process.platform!=='win32'&&(permissions.mode&0o077)!==0)throw new Error('PASSPHRASE_FILE_MUST_BE_PRIVATE');
const password=await readFile(passwordFile);if(password.length<32)throw new Error('PASSPHRASE_MIN_32_BYTES');
const db=new URL(url);if(!['postgres:','postgresql:'].includes(db.protocol))throw new Error('POSTGRES_URL_REQUIRED');
// Credentials go only through the child environment, never process arguments or logs.
const local=['localhost','127.0.0.1','[::1]'].includes(db.hostname);
if(!local&&db.searchParams.get('sslmode')!=='verify-full')throw new Error('REMOTE_BACKUP_REQUIRES_VERIFIED_TLS');
const childEnv={...process.env,PGSSLMODE:local?'disable':'verify-full',PGHOST:db.hostname,PGPORT:db.port||'5432',PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:decodeURIComponent(db.pathname.slice(1)),PGCONNECT_TIMEOUT:'10'};
async function pg(command:string,args:string[],operation:(child:ReturnType<typeof spawn>)=>Promise<void>){
 const child=spawn(command,args,{env:childEnv,stdio:['pipe','pipe','pipe']});child.stderr?.resume();const timer=setTimeout(()=>child.kill('SIGTERM'),600000);
 const completion=new Promise<void>((resolve,reject)=>{child.once('error',()=>reject(new Error('POSTGRES_TOOL_UNAVAILABLE')));child.once('close',code=>code===0?resolve():reject(new Error('POSTGRES_OPERATION_FAILED')));});
 const io=operation(child);const results=await Promise.allSettled([io.catch(error=>{child.kill('SIGTERM');throw error;}),completion]);clearTimeout(timer);for(const result of results)if(result.status==='rejected')throw result.reason;
}
try{
 if(mode==='backup'){
  // Refuse to overwrite an existing archive; preserve the previous recovery point.
  try{await stat(target);throw new Error('BACKUP_ALREADY_EXISTS');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  await mkdir(dirname(target),{recursive:true,mode:0o700});const temporary=target+'.partial-'+process.pid;
  try{await pg('pg_dump',['--format=custom','--no-owner','--no-acl'],async child=>{child.stdin?.end();await sealBackupStream(child.stdout as Readable,temporary,password);});await link(temporary,target);}finally{await unlink(temporary).catch(()=>{});}
  console.log('Encrypted backup written. No plaintext dump created; perform a disposable restore drill before relying on it.');
 }else{
  if(process.env.CONFIRM_EMPTY_DATABASE_RESTORE!=='true')throw new Error('EXPLICIT_EMPTY_RESTORE_REQUIRED');
  await withVerifiedBackup(target,password,async dump=>{const pool=new Pool({connectionString:url,connectionTimeoutMillis:10000,max:1});
  try{const existing=await pool.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1");if(existing.rowCount)throw new Error('RESTORE_TARGET_NOT_EMPTY');await pg('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',childEnv.PGDATABASE],async child=>{child.stdout?.resume();await pipeline(dump,child.stdin!);});await pool.query('BEGIN');try{await pool.query('SELECT pg_advisory_xact_lock(7011002)');await pool.query('DELETE FROM browser_sessions');const audit=await pool.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('restore-tool','SYSTEM_RESTORED_SESSIONS_REVOKED',gen_random_uuid(),'{\"sessionsRevoked\":true}') RETURNING id");await pool.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0].id]);await pool.query('COMMIT');}catch(error){await pool.query('ROLLBACK');throw error;}console.log('Restore committed into an empty target; browser sessions and wallet proofs revoked. Verify ledger/audit consistency before operating.');}finally{await pool.end();}});
 }
}finally{password.fill(0);}
