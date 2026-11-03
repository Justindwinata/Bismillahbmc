import { createHash } from 'node:crypto';
import { Pool } from 'pg';
const source=process.env.BACKUP_VERIFY_SOURCE_URL,target=process.env.BACKUP_VERIFY_TARGET_URL;
if(!source||!target||source===target)throw new Error('DISTINCT_SOURCE_AND_RESTORED_DATABASE_REQUIRED');
const pools=[new Pool({connectionString:source,max:1}),new Pool({connectionString:target,max:1})];
const identifier=(s:string)=>'"'+s.replaceAll('"','""')+'"';
try{
 const inventories=[];
 for(const pool of pools){
  await pool.query("SET TIME ZONE 'UTC'");await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=(await pool.query<{schemaname:string;tablename:string}>("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename")).rows;
  const result=[];
  for(const table of tables){if(['browser_sessions','wallet_challenges','wallet_bindings'].includes(table.tablename))continue;const where=table.tablename==='audit_events'?" WHERE event_type<>'SYSTEM_RESTORED_SESSIONS_REVOKED'":table.tablename==='outbox_events'?" WHERE audit_id NOT IN (SELECT id FROM audit_events WHERE event_type='SYSTEM_RESTORED_SESSIONS_REVOKED')":'';await pool.query(`DECLARE restore_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS value FROM ${identifier(table.schemaname)}.${identifier(table.tablename)} t${where} ORDER BY row_to_json(t)::text`);const digest=createHash('sha256');let count=0;try{while(true){const rows=await pool.query<{value:string}>('FETCH FORWARD 64 FROM restore_rows');if(!rows.rowCount)break;for(const row of rows.rows){if(count)digest.update('\n');digest.update(row.value);count++;}}}finally{await pool.query('CLOSE restore_rows');}result.push({table:table.schemaname+'.'+table.tablename,rows:count,sha256:digest.digest('hex')});}
  await pool.query('COMMIT');
  inventories.push(result);
 }
 if(JSON.stringify(inventories[0])!==JSON.stringify(inventories[1]))throw new Error('RESTORE_DATA_MISMATCH');
 const restored=pools[1]!;for(const table of ['browser_sessions','wallet_challenges','wallet_bindings'])if((await restored.query(`SELECT 1 FROM ${identifier(table)} LIMIT 1`)).rowCount)throw new Error('RESTORED_SESSION_NOT_REVOKED');await restored.query('BEGIN');let immutable=false;
 try{await restored.query('UPDATE audit_events SET actor=actor WHERE id=(SELECT id FROM audit_events LIMIT 1)');}catch(error){const reason=error as {code?:string;message?:string};if(reason.code!=='P0001'||reason.message!=='APPEND_ONLY')throw error;immutable=true;}finally{await restored.query('ROLLBACK');}
 if(!immutable)throw new Error('RESTORED_AUDIT_IMMUTABILITY_NOT_PROVEN');
 console.log(JSON.stringify({status:'MATCH',auditMutationRejected:true,authSessionsIntentionallyRevoked:true,tables:inventories[0]},null,2));
}finally{await Promise.all(pools.map(pool=>pool.end()));}
