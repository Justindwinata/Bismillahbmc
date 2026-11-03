import { beforeAll,afterAll,it,expect } from 'vitest';
import { Pool,Store,migrate } from '../packages/storage/src/index.js';
import { observation } from '../packages/connectors/src/index.js';
import { createApi } from '../apps/api/src/server.js';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL_REQUIRED: disposable PostgreSQL only');
const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:6});
const store=new Store(pool);
beforeAll(async () => {await migrate(pool);await migrate(pool);});
afterAll(async () => {await pool.end();});
it('migrations apply once; concurrent duplicate observations have one audit and outbox',async () => {
  const key=crypto.randomUUID();
  const source=observation('dexscreener',key,{mint:key},Date.now());
  const saved=await Promise.all(Array.from({length:12},() => store.save(source)));
  expect(saved.filter(Boolean)).toHaveLength(1);
  const rows=await pool.query('SELECT id FROM source_snapshots WHERE source_key=$1',[key]);
  expect(rows.rowCount).toBe(1);
  const audit=await pool.query("SELECT id FROM audit_events WHERE payload->>'sourceId'=$1",[rows.rows[0].id]);
  expect(audit.rowCount).toBe(1);
  expect((await pool.query('SELECT id FROM outbox_events WHERE audit_id=$1',[audit.rows[0].id])).rowCount).toBe(1);
});
it('rollback on failed outbox commit retains no partial source or audit',async () => {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const key=crypto.randomUUID();
    await client.query("INSERT INTO source_snapshots(provider,source_key,source_hash,data_class,received_at,payload) VALUES ('dexscreener',$1,$2,'LIVE_PROVIDER',now(),'{}')",[key,'a'.repeat(64)]);
    await expect(client.query('INSERT INTO outbox_events(audit_id) VALUES (-1)')).rejects.toThrow();
    await client.query('ROLLBACK');
    expect((await pool.query('SELECT id FROM source_snapshots WHERE source_key=$1',[key])).rowCount).toBe(0);
  } finally {client.release();}
});
it('audit and source records deny edits; signer cannot turn on in SQL',async () => {
  await store.save(observation('dexscreener',crypto.randomUUID(),{},Date.now()));
  await expect(pool.query("UPDATE audit_events SET actor='tamper' WHERE id=(SELECT min(id) FROM audit_events)")).rejects.toThrow('APPEND_ONLY');
  await expect(pool.query('DELETE FROM source_snapshots WHERE id=(SELECT min(id) FROM source_snapshots)')).rejects.toThrow('APPEND_ONLY');
  await expect(pool.query('UPDATE system_state SET signer_enabled=true')).rejects.toThrow();
  await expect(pool.query("UPDATE system_state SET mode='MICRO_LIVE'")).rejects.toThrow();
});
it('real API halt persists through independent connection and restart',async () => {
  const token='test-only-service-credential-xxxxxxxxxxxxxxxx';
  const app=createApi(store,token);
  expect((await app.inject({method:'POST',url:'/api/v1/system/halt',headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(200);
  await app.close();
  const second=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  try {expect((await new Store(second).system()).mode).toBe('HALTED');}
  finally {await second.end();}
  const app2=createApi(store,token);
  const result=await app2.inject({url:'/api/v1/system',headers:{authorization:`Bearer ${token}`}});
  expect(result.json().decision.reasons).toEqual(['KILL_SWITCH_ACTIVE']);
  await app2.close();
});
it('provider failure retains last real success, unknown never becomes zero',async () => {
  await store.health('solana-rpc','OK',null);
  const before=(await pool.query("SELECT last_success_at FROM provider_health WHERE provider='solana-rpc'")).rows[0].last_success_at;
  await store.health('solana-rpc','DEGRADED','RATE_LIMITED');
  const after=(await pool.query("SELECT * FROM provider_health WHERE provider='solana-rpc'")).rows[0];
  expect(after.last_success_at).toEqual(before);expect(after.status).toBe('DEGRADED');
  expect(await store.candidates()).toBeInstanceOf(Array);
});

it('browser login creates a hashed durable session; CSRF, origin, logout and expiry are enforced',async () => {
  const { passwordHash,digest,cookieToken }=await import('../apps/api/src/auth.js');
  const password='FIXTURE-owner-login-NEVER-production';
  const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000'});
  try {
    expect((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{password},headers:{origin:'https://evil.test'}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{password:'FIXTURE-wrong-password'},headers:{origin:'http://localhost:3000'}})).statusCode).toBe(401);
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{password},headers:{origin:'http://localhost:3000'}});
    expect(login.statusCode).toBe(200);
    const setCookie=String(login.headers['set-cookie']);expect(setCookie).toContain('HttpOnly');expect(setCookie).toContain('SameSite=Strict');
    const cookie=setCookie.split(';')[0]!;
    const session=await app.inject({url:'/api/v1/auth/session',headers:{cookie}});
    const csrf=session.json().csrfToken as string;
    expect(await store.session(digest(cookieToken(cookie)!))).not.toBeNull();
    expect((await app.inject({method:'POST',url:'/api/v1/system/halt',headers:{cookie,origin:'http://localhost:3000'}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/v1/system/halt',headers:{cookie,origin:'https://evil.test','x-csrf-token':csrf}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:'/api/v1/system/halt',headers:{cookie,origin:'http://localhost:3000','x-csrf-token':csrf}})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/v1/dashboard',headers:{cookie}})).json()).toMatchObject({version:1,release:'NOT_LIVE_VERIFIED'});
    expect((await app.inject({url:'/api/v1/events?after=-1',headers:{cookie}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{cookie,origin:'http://localhost:3000','x-csrf-token':csrf}})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/v1/dashboard',headers:{cookie}})).statusCode).toBe(401);
  } finally {await app.close();}
});
it('SSE resumes a persisted cursor over actual HTTP with 500 committed events and no duplicates',async () => {
  const { passwordHash }=await import('../apps/api/src/auth.js');
  const password='FIXTURE-owner-login-NEVER-production';
  const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000'});
  const url=await app.listen({host:'127.0.0.1',port:0});
  const login=await fetch(url+'/api/v1/auth/login',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({password})});
  const cookie=login.headers.get('set-cookie')!.split(';')[0]!;
  try {
    const cursor=(await store.dashboard()).cursor;
    await Promise.all(Array.from({length:500},(_,i)=>store.health('FIXTURE-sse-'+i,'OK',null)));
    const response=await fetch(url+'/api/v1/events?after=0',{headers:{cookie,'last-event-id':cursor}});
    expect(response.status).toBe(200);
    const reader=response.body!.getReader();
    let pending='';const ids:string[]=[];
    while(ids.length<500){
      const chunk=await reader.read();if(chunk.done)break;
      pending+=new TextDecoder().decode(chunk.value);
      let split:number;
      while((split=pending.indexOf('\n\n'))>=0){const frame=pending.slice(0,split);pending=pending.slice(split+2);const match=frame.match(/^id: (\d+)/m);if(match)ids.push(match[1]!);}
    }
    await reader.cancel();
    expect(ids).toHaveLength(500);expect(new Set(ids).size).toBe(500);
    expect(ids.every((id,i)=>BigInt(id)>BigInt(i?ids[i-1]!:cursor))).toBe(true);
  } finally {await app.close();}
});
it('repeated halt is idempotent and snapshot cursor never observes partially committed events',async () => {
  await store.halt('FIXTURE-owner');
  const before=await store.dashboard();
  await Promise.all([store.halt('FIXTURE-owner'),store.halt('FIXTURE-owner')]);
  expect((await store.dashboard()).cursor).toBe(before.cursor);
});
it('watchlist limits and wallet signature dedupe commit together with cursor',async()=>{
  const wallet='11111111111111111111111111111111';
  await store.addWatch(wallet);await store.addWatch(wallet);
  await store.addWatch('So11111111111111111111111111111111111111112');
  await expect(store.addWatch('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).rejects.toThrow('WATCHLIST_LIMIT');
  const entries=[{signature:'FIXTURE_SIGNATURE_NOT_MAINNET',slot:'12',flow:{sourceAt:null,status:'UNKNOWN',reason:'FIXTURE'}}];
  await store.walletWindow(wallet,entries,entries[0]!.signature,true,(await store.watchlists()).find(w=>w.address===wallet)!.last_signature);await store.walletWindow(wallet,entries,entries[0]!.signature,true,entries[0]!.signature);
  expect((await pool.query('SELECT * FROM wallet_observations WHERE wallet=$1 AND signature=$2',[wallet,entries[0]!.signature])).rowCount).toBe(1);
  expect((await store.watchlists()).find(w=>w.address===wallet)?.last_signature).toBe(entries[0]!.signature);
  expect((await store.dashboard()).copyFeed).toBeInstanceOf(Array);
});
it('all eleven stage events, decision and outbox are atomically persisted and deduped',async()=>{
  const {evaluate,fingerprint}=await import('../packages/engine/src/index.js');
  const raw={mint:'So11111111111111111111111111111111111111112',sourceId:'FIXTURE:'+crypto.randomUUID(),sourceHash:'a'.repeat(64),receivedAt:new Date().toISOString(),sourceAt:null,mode:'OBSERVE',inputDataClass:'REPLAY',market:null,security:null,balanceLamports:null};
  const result=evaluate(raw,fingerprint({cap:'0'}));expect(await store.saveEvaluation(result)).toBe(true);
  expect(await store.saveEvaluation(evaluate(raw,result.policyHash))).toBe(false);
  expect((await pool.query('SELECT * FROM agent_events WHERE decision_id=$1',[result.decisionId])).rowCount).toBe(11);
  const snapshot=await store.dashboard();expect(snapshot.agents).toHaveLength(11);
  expect(snapshot.agents.find(e=>e.role==='GUARD')!.payload.output.state).toBe('VETO');
});
it('research PAPER persists buy/sell, veto, exact PnL and restart idempotency without touching live money',async()=>{
 const {ResearchStore}=await import('../packages/storage/src/research.js');const {replayPolicy}=await import('../packages/engine/src/replay.js');
 const research=new ResearchStore(pool);const session=await research.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000'});
 await store.halt('TEST');const halted=await research.runReplay(session.id,crypto.randomUUID(),'BUY');expect(halted.action).toBe('SKIP');
 await store.resumeObserve();
 const key=crypto.randomUUID();const result=await Promise.all([research.runReplay(session.id,key,'BUY'),research.runReplay(session.id,key,'BUY')]);expect(result.filter(r=>r.duplicate)).toHaveLength(1);
 expect((await research.detail(session.id)).snapshot.cashLamports).toBe('898');
 const recovered=new ResearchStore(pool);expect((await recovered.detail(session.id)).snapshot.positions[0]!.quantity).toBe('10');
 expect((await recovered.runReplay(session.id,crypto.randomUUID(),'SELL')).action).toBe('SELL_PROPOSED');
 const detail=await recovered.detail(session.id);expect(detail.snapshot.cashLamports).toBe('1016');expect(detail.snapshot.realizedPnlLamports).toBe('16');expect(detail.snapshot.positions).toHaveLength(0);
 expect((await recovered.runReplay(session.id,crypto.randomUUID(),'MISSING_SECURITY')).action).toBe('SKIP');
 expect((await recovered.runReplay(session.id,crypto.randomUUID(),'STALE_QUOTE')).action).toBe('SKIP');
 await expect(recovered.runReplay(session.id,key,'SELL')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 const shadow=await recovered.create({mode:'SHADOW',policy:replayPolicy,initialCashLamports:'1000'});expect((await recovered.runReplay(shadow.id,crypto.randomUUID(),'BUY')).action).toBe('BUY_PROPOSED');expect((await recovered.detail(shadow.id)).snapshot.positions).toHaveLength(0);
 await store.halt('TEST_END');
});
it('agent cycle selects freshest distinct mints globally, omits stale data, and rotates tied candidates',async()=>{
 const {agentCycle}=await import('../apps/worker/src/agent-cycle.js');
 // Isolated test transaction cleanup never touches the running observation database.
 const mints=Array.from({length:7},(_,i)=>'1'.repeat(31)+'8765432'[i]);
 const stamp=new Date();for(const [i,mint] of mints.entries())await store.saveMarket(mint,mint,{liquidity:{usd:100},volume:{m5:1,h24:2}},new Date(stamp.getTime()-i*100).toISOString());
 const expected=mints.slice(0,5);

 await agentCycle(store);
 const ids=(await pool.query("SELECT mint FROM agent_runs WHERE mint=ANY($1) ORDER BY created_at DESC LIMIT 5",[mints])).rows.map(r=>r.mint);
 expect(new Set(ids)).toEqual(new Set(expected));
 const tie=new Date().toISOString();for(const mint of mints)await store.saveMarket(mint,mint,{liquidity:{usd:100}},tie);
 await agentCycle(store);await agentCycle(store);
 expect((await pool.query('SELECT mint FROM agent_cursors WHERE mint=ANY($1)',[mints])).rowCount).toBe(7);
});
it('research API rejects live modes, arbitrary evidence, missing CSRF and unauthenticated reads',async()=>{
 const {passwordHash}=await import('../apps/api/src/auth.js');const password='FIXTURE-research-owner-not-production';
 const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000'});
 try{
  expect((await app.inject({url:'/api/v1/research/sessions'})).statusCode).toBe(401);
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{password},headers:{origin:'http://localhost:3000'}});
  const cookie=String(login.headers['set-cookie']).split(';')[0]!;const csrf=(await app.inject({url:'/api/v1/auth/session',headers:{cookie}})).json().csrfToken;
  const headers={cookie,origin:'http://localhost:3000','x-csrf-token':csrf};
  expect((await app.inject({method:'POST',url:'/api/v1/research/sessions',headers:{cookie,origin:'http://localhost:3000'},payload:{mode:'PAPER',initialCashLamports:'1000'}})).statusCode).toBe(403);
  for(const mode of ['LIVE','MICRO_LIVE','CAPPED_AUTO'])expect((await app.inject({method:'POST',url:'/api/v1/research/sessions',headers,payload:{mode,initialCashLamports:'1000'}})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:'/api/v1/system/resume-observe',headers,payload:{password:'FIXTURE-invalid-password'}})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/api/v1/system/resume-observe',headers,payload:{password}})).json()).toEqual({mode:'OBSERVE',signerEnabled:false});
  const created=await app.inject({method:'POST',url:'/api/v1/research/sessions',headers,payload:{mode:'PAPER',initialCashLamports:'1000'}});expect(created.statusCode).toBe(200);const id=created.json().id;
  expect((await app.inject({url:'/api/v1/research/sessions',headers})).json().some((s:{id:string})=>s.id===id)).toBe(true);
  expect((await app.inject({url:'/api/v1/research/sessions/not-uuid',headers})).statusCode).toBe(400);
  expect((await app.inject({url:'/api/v1/research/sessions/'+id,headers})).json().snapshot.cashLamports).toBe('1000');
  expect((await app.inject({method:'POST',url:`/api/v1/research/sessions/${id}/replay`,headers,payload:{requestKey:crypto.randomUUID(),scenario:'LIVE',quote:{fillable:true}}})).statusCode).toBe(400);
  const requestKey=crypto.randomUUID();const url=`/api/v1/research/sessions/${id}/replay`;
  const first=await app.inject({method:'POST',url,headers,payload:{requestKey,scenario:'BUY'}});expect(first.json().action).toBe('BUY_PROPOSED');
  expect((await app.inject({method:'POST',url,headers,payload:{requestKey,scenario:'BUY'}})).json().duplicate).toBe(true);
  expect((await app.inject({url:'/api/v1/research/sessions/'+id,headers})).json().snapshot.cashLamports).toBe('898');
  await store.halt('FIXTURE-api-end');
 }finally{await app.close();}
});
it('Phantom nonce proof is session bound, one-use, expiring and read-only with audited balance provenance',async()=>{
 const {generateKeyPairSync,sign}=await import('node:crypto');const {passwordHash}=await import('../apps/api/src/auth.js');
 const pair=generateKeyPairSync('ed25519'),bytes=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);let n=BigInt('0x'+bytes.toString('hex')),wallet='';const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){wallet=alphabet[Number(n%58n)]+wallet;n/=58n;}for(const b of bytes){if(b)break;wallet='1'+wallet;}
 const password='FIXTURE-phantom-owner-not-production';let rpcMode='OK';
 const rpc={read:async(method:string)=>{if(rpcMode==='FAIL')throw new Error('FIXTURE_RPC_DOWN');if(method==='getGenesisHash')return rpcMode==='WRONG_NETWORK'?'wrong':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';return {context:{slot:100},value:rpcMode==='UNSAFE'?Number.MAX_SAFE_INTEGER+1:1000};}};
 const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000',rpc});
 try{
  const login=async()=>{const l=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'http://localhost:3000'},payload:{password}});const cookie=String(l.headers['set-cookie']).split(';')[0]!;const csrf=(await app.inject({url:'/api/v1/auth/session',headers:{cookie}})).json().csrfToken;return {cookie,origin:'http://localhost:3000','x-csrf-token':csrf};};const headers=await login(),other=await login();
  const post=(url:string,payload:Record<string,unknown>,h=headers)=>app.inject({method:'POST',url:'/api/v1/wallet/'+url,headers:h,payload});
  const challenge=async()=>{const res=await post('challenge',{address:wallet});expect(res.statusCode).toBe(200);return res.json();};const signature=(message:string)=>sign(null,Buffer.from(message),pair.privateKey).toString('hex');
  expect((await app.inject({url:'/api/v1/wallet',headers})).json().status).toBe('NOT_CONNECTED');expect((await app.inject({url:'/api/v1/wallet/balance',headers})).json().balanceLamports).toBeNull();
  expect((await post('challenge',{address:'invalid'})).statusCode).toBe(400);expect((await post('verify',{})).statusCode).toBe(400);
  const first=await challenge();expect(first.message).toContain('URI: http://localhost:3000');
  const proof={challengeId:first.id,signature:signature(first.message)};expect((await post('verify',proof,other)).statusCode).toBe(403);expect((await post('verify',proof)).json()).toMatchObject({address:wallet,signerEnabled:false,authority:'READ_ONLY_IDENTITY'});expect((await post('verify',proof)).statusCode).toBe(403);
  expect((await app.inject({url:'/api/v1/wallet',headers})).json().address).toBe(wallet);
  const balance=(await app.inject({url:'/api/v1/wallet/balance',headers})).json();expect(balance).toMatchObject({status:'AVAILABLE',balanceLamports:'1000',slot:'100',dataClass:'LIVE_CHAIN',scope:'NATIVE_SOL_ONLY_NOT_EQUITY'});
  for(const mode of ['WRONG_NETWORK','UNSAFE','FAIL']){rpcMode=mode;expect((await app.inject({url:'/api/v1/wallet/balance',headers})).json().balanceLamports).toBeNull();}
  const wrong=await challenge();expect((await post('verify',{challengeId:wrong.id,signature:signature(wrong.message+'wrong-domain')})).statusCode).toBe(403);expect((await post('verify',{challengeId:wrong.id,signature:signature(wrong.message)})).statusCode).toBe(403);
  const expired=await challenge();await pool.query("UPDATE wallet_challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.id]);expect((await post('verify',{challengeId:expired.id,signature:signature(expired.message)})).statusCode).toBe(403);
  const pending=await challenge();await challenge();expect((await post('challenge',{address:wallet})).statusCode).toBe(429);
  expect((await post('disconnect',{})).statusCode).toBe(200);expect((await post('verify',{challengeId:pending.id,signature:signature(pending.message)})).statusCode).toBe(403);expect((await app.inject({url:'/api/v1/wallet',headers})).json().status).toBe('NOT_CONNECTED');
  expect((await pool.query("SELECT id FROM audit_events WHERE event_type='WALLET_IDENTITY_VERIFIED' AND payload->>'address'=$1",[wallet])).rowCount).toBe(1);
 }finally{await app.close();}
});
it('autonomous paper worker buys then requotes and sells after restart; no Replay endpoint is used',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');
 const scheduler=new PaperSchedulerStore(pool);await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);
 await paperCycle(scheduler,automaticFixtureSources(),'REPLAY_TEST',1);let detail=await scheduler.research.detail(session.id);expect(detail.snapshot.cashLamports).toBe('898');expect(detail.snapshot.positions[0]!.quantity).toBe('10');
 await expect(scheduler.research.runReplay(session.id,crypto.randomUUID(),'BUY')).rejects.toThrow('AUTOMATION_LEASE_REQUIRED');
 await pool.query('UPDATE paper_jobs SET next_at=clock_timestamp() WHERE session_id=$1',[session.id]);const restarted=new PaperSchedulerStore(pool);await paperCycle(restarted,automaticFixtureSources(),'REPLAY_TEST',1);detail=await restarted.research.detail(session.id);
 expect(detail.snapshot).toMatchObject({cashLamports:'1016',realizedPnlLamports:'16',equityLamports:'1016',positions:[]});expect(await restarted.research.performance(session.id)).toMatchObject({scope:'REPLAY_TEST',closedTrades:1,wins:1,closedNetPnlLamports:'16',qualification:'STRATEGY_NOT_VALIDATED'});expect(detail.events.map(e=>e.action)).toEqual(['BUY_PROPOSED','SELL_PROPOSED']);
 expect((await pool.query('SELECT * FROM paper_observations WHERE job_id IN(SELECT id FROM paper_jobs WHERE session_id=$1) AND kind=$2',[session.id,'QUOTE_SELL'])).rowCount).toBe(1);
 expect((await pool.query('SELECT * FROM agent_events WHERE decision_id=$1',[detail.events[1]!.decision_id])).rowCount).toBe(11);
});
it('paper leases serialize concurrent workers, fence expired owners and recover a crash before commit',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');
 const scheduler=new PaperSchedulerStore(pool);await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const sources=automaticFixtureSources();const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);
 const expired=await scheduler.claim('REPLAY_TEST',-1);expect(expired).not.toBeNull();await scheduler.record(expired!,'QUOTE_BUY',{classification:'REPLAY_TEST',crash:'before commit'});
 const recovered=await new PaperSchedulerStore(pool).claim('REPLAY_TEST');expect(recovered!.lease_token).not.toBe(expired!.lease_token);
 await expect(scheduler.research.apply(expired!.session_id,expired!.lease_token,replayInput('BUY'),undefined,expired!)).rejects.toThrow('LEASE_LOST');
 await scheduler.research.apply(recovered!.session_id,recovered!.lease_token,replayInput('BUY'),undefined,recovered!);
 expect((await scheduler.research.detail(recovered!.session_id)).events).toHaveLength(1);
 await scheduler.toggle(recovered!.session_id,false);const concurrent=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(concurrent.id,[replayInput('BUY').mint]);
 await Promise.all([paperCycle(scheduler,sources,'REPLAY_TEST',1),paperCycle(new PaperSchedulerStore(pool),sources,'REPLAY_TEST',1)]);
 expect((await scheduler.research.detail(concurrent.id)).events).toHaveLength(1);expect((await scheduler.research.detail(concurrent.id)).snapshot.cashLamports).toBe('898');
});
it('automatic quote outage, staleness, forged scope and midflight HALT cannot create a virtual fill',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');
 const scheduler=new PaperSchedulerStore(pool);await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");for(const failure of ['OUTAGE','STALE','SCOPE','HALT','PAUSE']){
  await store.resumeObserve();const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);const source=automaticFixtureSources(),quote=source.quote;source.quote=async request=>{if(failure==='OUTAGE')throw new Error('429 fixture');const observation=await quote(request);if(failure==='STALE')observation.quote.receivedAt=new Date(Date.now()-60000).toISOString();if(failure==='SCOPE')observation.sourceClass='LIVE_PROVIDER';if(failure==='HALT')await store.halt('FIXTURE-midflight');if(failure==='PAUSE')await scheduler.toggle(session.id,false);return observation;};
  await paperCycle(scheduler,source,'REPLAY_TEST',1);const detail=await scheduler.research.detail(session.id);expect(detail.snapshot.cashLamports,failure).toBe('1000');expect(detail.events.every(e=>e.fill===null),failure).toBe(true);
  // Disable completed test automations so later scenarios cannot claim them after their interval.
  await scheduler.toggle(session.id,false);
 }
 await store.halt('FIXTURE-test-end');
});
it('automatic exit marks expire to UNKNOWN and SHADOW records no inventory or fill',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');
 await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool);const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);const source=automaticFixtureSources();await paperCycle(scheduler,source,'REPLAY_TEST',1);
 const quote=source.quote;source.quote=async request=>{const result=await quote(request);result.quote.outputAmount='104';return result;};await pool.query('UPDATE paper_jobs SET next_at=clock_timestamp() WHERE session_id=$1',[session.id]);await paperCycle(scheduler,source,'REPLAY_TEST',1);expect((await scheduler.research.detail(session.id)).snapshot).toMatchObject({equityLamports:'1000',unrealizedPnlLamports:'0'});
 await pool.query("UPDATE paper_marks SET received_at=clock_timestamp()-interval '1 hour' WHERE session_id=$1",[session.id]);expect((await scheduler.research.detail(session.id)).snapshot.equityLamports).toBeNull();await scheduler.toggle(session.id,false);
 const shadow=await scheduler.create({mode:'SHADOW',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(shadow.id,[replayInput('BUY').mint]);await paperCycle(scheduler,automaticFixtureSources(),'REPLAY_TEST',1);const d=await scheduler.research.detail(shadow.id);expect(d.events[0]!.action).toBe('BUY_PROPOSED');expect(d.events[0]!.fill).toBeNull();expect(d.snapshot).toMatchObject({cashLamports:'1000',positions:[],equityLamports:'1000'});await scheduler.toggle(shadow.id,false);
});
it('crash injection before journal commit rolls back fill, eleven events and job acknowledgment together',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool);const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);const lease=(await scheduler.claim('REPLAY_TEST'))!;
 await pool.query("CREATE OR REPLACE FUNCTION fixture_fail_paper_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FIXTURE_CRASH_BEFORE_COMMIT'; END; $$");await pool.query('CREATE TRIGGER fixture_fail_paper_commit BEFORE INSERT ON research_journal FOR EACH ROW EXECUTE FUNCTION fixture_fail_paper_commit()');
 try{await expect(scheduler.research.apply(session.id,lease.lease_token,replayInput('BUY'),undefined,lease)).rejects.toThrow('FIXTURE_CRASH_BEFORE_COMMIT');}finally{await pool.query('DROP TRIGGER fixture_fail_paper_commit ON research_journal');await pool.query('DROP FUNCTION fixture_fail_paper_commit()');}
 expect((await scheduler.research.detail(session.id)).events).toHaveLength(0);expect((await pool.query('SELECT state FROM paper_jobs WHERE id=$1',[lease.id])).rows[0].state).toBe('LEASED');
 await pool.query("UPDATE paper_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[lease.id]);const recovered=(await new PaperSchedulerStore(pool).claim('REPLAY_TEST'))!;await scheduler.research.apply(session.id,recovered.lease_token,replayInput('BUY'),undefined,recovered);expect((await scheduler.research.detail(session.id)).events).toHaveLength(1);expect((await scheduler.research.detail(session.id)).snapshot.cashLamports).toBe('898');await scheduler.toggle(session.id,false);await store.halt('FIXTURE-crash-end');
});
it('owner automation API validates policy and controls, discovers current markets and exposes immutable source evidence',async()=>{
 const {passwordHash}=await import('../apps/api/src/auth.js');const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayPolicy}=await import('../packages/engine/src/replay.js');const password='FIXTURE-automatic-owner-not-production';const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000'});
 try{expect((await app.inject({url:'/api/v1/paper/automations'})).statusCode).toBe(401);const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'http://localhost:3000'},payload:{password}});const cookie=String(login.headers['set-cookie']).split(';')[0]!;const csrf=(await app.inject({url:'/api/v1/auth/session',headers:{cookie}})).json().csrfToken;const headers={cookie,origin:'http://localhost:3000','x-csrf-token':csrf};
 const payload={mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000};expect((await app.inject({method:'POST',url:'/api/v1/paper/automations',headers:{cookie,origin:'http://localhost:3000'},payload})).statusCode).toBe(403);expect((await app.inject({method:'POST',url:'/api/v1/paper/automations',headers,payload:{...payload,mode:'MICRO_LIVE'}})).statusCode).toBe(400);
 const created=(await app.inject({method:'POST',url:'/api/v1/paper/automations',headers,payload})).json();expect(created.scope).toBe('LIVE_PROVIDER');const scheduler=new PaperSchedulerStore(pool);await scheduler.discover();const list=(await app.inject({url:'/api/v1/paper/automations',headers})).json();expect(list.some((a:{session_id:string})=>a.session_id===created.id)).toBe(true);
 expect((await app.inject({url:'/api/v1/paper/automations/bad/evidence',headers})).statusCode).toBe(400);expect((await app.inject({url:'/api/v1/paper/automations/'+created.id+'/evidence',headers})).json()).toEqual([]);
 expect((await app.inject({method:'POST',url:'/api/v1/paper/automations/bad',headers,payload:{enabled:false}})).statusCode).toBe(400);expect((await app.inject({method:'POST',url:'/api/v1/paper/automations/'+created.id,headers,payload:{enabled:false}})).json()).toMatchObject({enabled:false,signerEnabled:false});
 }finally{await app.close();}
});
it('protective exits persist despite entry veto; an unavailable exit preserves position and emits durable alert',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool);const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);await paperCycle(scheduler,automaticFixtureSources(),'REPLAY_TEST',1,session.id);
 const sources:import('../apps/worker/src/paper-cycle.js').PaperSources=automaticFixtureSources(),market=sources.market;let unavailable=true;sources.market=async(mint)=>{const m=await market(mint);return {...m,input:{...m.input,security:{...m.input.security!,assessment:'VETO',reasons:['REPLAY_TEST_ENTRY_RISK']},poolEvidence:{...m.input.poolEvidence!,assessment:'VETO',exitSafe:!unavailable}}};};
 await pool.query('UPDATE paper_jobs SET next_at=clock_timestamp() WHERE session_id=$1',[session.id]);await paperCycle(scheduler,sources,'REPLAY_TEST',1,session.id);let detail=await scheduler.research.detail(session.id);expect(detail.snapshot.positions).toHaveLength(1);expect(detail.events.at(-1)!.fill).toBeNull();expect((await pool.query("SELECT id FROM audit_events WHERE event_type='EXIT_UNAVAILABLE' AND payload->>'sessionId'=$1",[session.id])).rowCount).toBe(1);
 unavailable=false;await pool.query('UPDATE paper_jobs SET next_at=clock_timestamp() WHERE session_id=$1',[session.id]);await paperCycle(scheduler,sources,'REPLAY_TEST',1,session.id);detail=await scheduler.research.detail(session.id);expect(detail.snapshot.positions).toHaveLength(0);expect(detail.events.at(-1)!.action).toBe('SELL_PROPOSED');const trace=await store.decision(detail.events.at(-1)!.decision_id);expect(trace!.events.find(e=>e.role==='RUG_CHECK')!.payload.output.state).toBe('VETO');expect(trace!.events.find(e=>e.role==='GUARD')!.payload.output.state).toBe('PASS');await scheduler.toggle(session.id,false);await store.halt('FIXTURE-CP1-end');
});
it('own durable lease reservation cannot be omitted or spent twice during fill commit',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool);const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);const lease=(await scheduler.claim('REPLAY_TEST',60000,session.id))!;
 await pool.query('UPDATE paper_jobs SET reservation_lamports=0 WHERE id=$1',[lease.id]);await expect(scheduler.research.apply(session.id,lease.lease_token,replayInput('BUY'),undefined,lease)).rejects.toThrow('RESERVATION_INSUFFICIENT');expect((await scheduler.research.detail(session.id)).events).toHaveLength(0);
 await pool.query('UPDATE paper_jobs SET reservation_lamports=120 WHERE id=$1',[lease.id]);const input=replayInput('BUY');const first=await scheduler.research.apply(session.id,lease.lease_token,input,undefined,lease);expect(first.action).toBe('BUY_PROPOSED');expect((await scheduler.research.apply(session.id,lease.lease_token,input,undefined,lease)).duplicate).toBe(true);expect((await scheduler.research.detail(session.id)).snapshot.cashLamports).toBe('898');await scheduler.toggle(session.id,false);await store.halt('FIXTURE-reservation-end');
});
it('immutable technical revision review survives restart, revocation is idempotent and atomically fences stale virtual fills',async()=>{
 const {ProgramReviewStore,assertProgramReview,MAINNET_GENESIS}=await import('../packages/storage/src/program-reviews.js');const {CPMM_PROGRAM}=await import('../packages/connectors/src/pool-security.js');const reviews=new ProgramReviewStore(pool),hash='e'.repeat(64);
 const raw={genesis:MAINNET_GENESIS,program:CPMM_PROGRAM,codeHash:hash,evidenceHash:'f'.repeat(64),reviewer:'FIXTURE_REVIEWER_NOT_REAL_APPROVAL',reviewReference:'REPLAY_TEST technical review regression evidence'};
 await expect(reviews.approve({...raw,genesis:'WRONG_NETWORK'})).rejects.toThrow();const id=await reviews.approve(raw);expect(await new ProgramReviewStore(pool).resolve(hash)).toBe(id);
 await expect(pool.query('UPDATE program_revision_reviews SET reviewer=$2 WHERE id=$1',[id,'tampered'])).rejects.toThrow('IMMUTABLE_PROGRAM_REVIEW');
 const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');await assertProgramReview(client,id,hash);let revoked=false;const pending=reviews.revoke(id,'FIXTURE revoked while a commit lock is held').then(v=>{revoked=v;});await new Promise(r=>setTimeout(r,25));expect(revoked).toBe(false);await client.query('COMMIT');await pending;expect(revoked).toBe(true);await expect(assertProgramReview(client,id,hash)).rejects.toThrow('PROGRAM_REVISION_REVIEW_REVOKED_OR_MISMATCH');await expect(assertProgramReview(client,null,hash)).rejects.toThrow('PROGRAM_REVISION_REVIEW_REQUIRED');await expect(assertProgramReview(client,id,'a'.repeat(64))).rejects.toThrow('PROGRAM_REVISION_REVIEW_REVOKED_OR_MISMATCH');}finally{await client.query('ROLLBACK');client.release();}
 expect(await reviews.revoke(id,'FIXTURE duplicate revocation')).toBe(false);expect(await reviews.resolve(hash)).toBeNull();await expect(pool.query('DELETE FROM program_revision_revocations WHERE review_id=$1',[id])).rejects.toThrow('IMMUTABLE_PROGRAM_REVIEW');expect((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE correlation_id=$1 AND event_type='PROGRAM_REVISION_REVIEW_REVOKED'",[id])).rows[0].n).toBe(1);
});
it('worker commit refuses an in-flight provider-mode proposal after technical review revocation',async()=>{
 // Deliberately constructed regression proposal: it must never persist a LIVE_PROVIDER fill.
 const {ProgramReviewStore,MAINNET_GENESIS}=await import('../packages/storage/src/program-reviews.js');const {CPMM_PROGRAM}=await import('../packages/connectors/src/pool-security.js');const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayInput,replayPolicy}=await import('../packages/engine/src/replay.js');const registry=new ProgramReviewStore(pool),codeHash='9'.repeat(64);const id=await registry.approve({genesis:MAINNET_GENESIS,program:CPMM_PROGRAM,codeHash,evidenceHash:'8'.repeat(64),reviewer:'REPLAY_TEST_ONLY',reviewReference:'REPLAY_TEST revoked before paper commit'});
 await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool);const session=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000});const fixture=replayInput('BUY');await store.saveMarket(fixture.mint,fixture.mint,{scope:'REPLAY_TEST',purpose:'negative registry commit fence'},new Date().toISOString(),null);await scheduler.enqueue(session.id,[fixture.mint]);const job=(await scheduler.claim('LIVE_PROVIDER',60000,session.id))!;expect(job).not.toBeNull();await registry.revoke(id,'REPLAY_TEST revoke before commit');const input={...fixture,inputDataClass:'LIVE_PROVIDER',sourceId:'REPLAY_TEST_NEGATIVE_ONLY',tokenDecimals:6,poolEvidence:{...fixture.poolEvidence!,revisionHash:codeHash,revisionReviewId:id}};
 try{await expect(scheduler.research.apply(session.id,job.lease_token,input,undefined,job)).rejects.toThrow('PROGRAM_REVISION_REVIEW_REVOKED_OR_MISMATCH');expect((await scheduler.research.detail(session.id)).events).toHaveLength(0);expect((await scheduler.research.detail(session.id)).snapshot.cashLamports).toBe('1000');await scheduler.fail(job,'PROGRAM_REVISION_REVIEW_REVOKED_OR_MISMATCH');expect((await scheduler.evidence(session.id)).some(e=>e.kind==='ERROR')).toBe(true);}finally{await scheduler.toggle(session.id,false);await store.halt('REPLAY_TEST registry fence end');}
});
it('registry database failures roll back review and revocation without silent authorization changes',async()=>{
 const {ProgramReviewStore,MAINNET_GENESIS}=await import('../packages/storage/src/program-reviews.js');const {CPMM_PROGRAM}=await import('../packages/connectors/src/pool-security.js');const registry=new ProgramReviewStore(pool);const raw={genesis:MAINNET_GENESIS,program:CPMM_PROGRAM,codeHash:'7'.repeat(64),evidenceHash:'6'.repeat(64),reviewer:'REPLAY_TEST',reviewReference:'REPLAY_TEST registry failure atomicity'};
 await pool.query("CREATE FUNCTION fixture_fail_program_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FIXTURE_REVIEW_DB_FAILURE'; END $$");
 try{await pool.query('CREATE TRIGGER fixture_review_failure BEFORE INSERT ON program_revision_reviews FOR EACH ROW EXECUTE FUNCTION fixture_fail_program_review()');try{await expect(registry.approve(raw)).rejects.toThrow('FIXTURE_REVIEW_DB_FAILURE');expect(await registry.resolve(raw.codeHash)).toBeNull();}finally{await pool.query('DROP TRIGGER fixture_review_failure ON program_revision_reviews');}
 const id=await registry.approve(raw);await pool.query('CREATE TRIGGER fixture_revocation_failure BEFORE INSERT ON program_revision_revocations FOR EACH ROW EXECUTE FUNCTION fixture_fail_program_review()');try{await expect(registry.revoke(id,'REPLAY_TEST failure')).rejects.toThrow('FIXTURE_REVIEW_DB_FAILURE');expect(await registry.resolve(raw.codeHash)).toBe(id);}finally{await pool.query('DROP TRIGGER fixture_revocation_failure ON program_revision_revocations');}await registry.revoke(id,'REPLAY_TEST cleanup');
 }finally{await pool.query('DROP FUNCTION fixture_fail_program_review()');}
});
it('quote/proof expiry and expired leases during slow persistence roll back all virtual accounting before retry',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayInput,replayPolicy}=await import('../packages/engine/src/replay.js');await pool.query("UPDATE paper_automations SET enabled=false WHERE scope='REPLAY_TEST'");await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool);
 for(const scenario of ['QUOTE_AGE','QUOTE_EXPIRY','CHAIN_PROOF','MARKET','LEASE','LATE_QUOTE_EXPIRY','LATE_LEASE']){
  const policy={...replayPolicy,quoteMaxAgeMs:scenario==='QUOTE_AGE'?300:5000,chainMaxAgeMs:scenario==='CHAIN_PROOF'?300:15000,marketMaxAgeMs:scenario==='MARKET'?300:15000};const session=await scheduler.create({mode:'PAPER',policy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);const lease=(await scheduler.claim('REPLAY_TEST',scenario.includes('LEASE')?300:60000,session.id))!;
  await pool.query("CREATE FUNCTION fixture_slow_paper_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$");const slowTable=scenario.startsWith('LATE_')?'paper_jobs':'research_journal';await pool.query(`CREATE TRIGGER fixture_slow_paper_commit BEFORE ${slowTable==='paper_jobs'?'UPDATE':'INSERT'} ON ${slowTable} FOR EACH ROW EXECUTE FUNCTION fixture_slow_paper_commit()`);const input:import('../packages/engine/src/index.js').EvaluationInput=replayInput('BUY');if(scenario.includes('QUOTE_EXPIRY'))input.quote!.expiresAt=new Date(Date.now()+300).toISOString();
  try{await expect(scheduler.research.apply(session.id,lease.lease_token,input,undefined,lease),scenario).rejects.toThrow(scenario.includes('LEASE')?'LEASE_LOST':'EVIDENCE_EXPIRED_DURING_COMMIT');}finally{await pool.query(`DROP TRIGGER fixture_slow_paper_commit ON ${slowTable}`);await pool.query('DROP FUNCTION fixture_slow_paper_commit()');}
  const failed=await scheduler.research.detail(session.id);expect(failed.events,scenario).toHaveLength(0);expect(failed.snapshot.cashLamports,scenario).toBe('1000');expect((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE event_type='RESEARCH_DECISION' AND payload->>'sessionId'=$1",[session.id])).rows[0].n).toBe(0);
  const retry=scenario.includes('LEASE')?(await scheduler.claim('REPLAY_TEST',60000,session.id))!:lease;const fresh=replayInput('BUY');const done=await scheduler.research.apply(session.id,retry.lease_token,fresh,undefined,retry);expect(done.action,scenario).toBe('BUY_PROPOSED');expect((await scheduler.research.apply(session.id,retry.lease_token,fresh,undefined,retry)).duplicate).toBe(true);expect((await scheduler.research.detail(session.id)).snapshot.cashLamports).toBe('898');await scheduler.toggle(session.id,false);
 }
 await store.halt('REPLAY_TEST slow commit qualification end');
});
it('capital, linked rent and partial FIFO replay survive restart without turning deposits into profit',async()=>{
 const {ResearchStore}=await import('../packages/storage/src/research.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');const research=new ResearchStore(pool),session=await research.create({mode:'PAPER',policy:{...replayPolicy,exitFractionBps:3000},initialCashLamports:'1000'});const deposit={kind:'DEPOSIT',requestKey:crypto.randomUUID(),amountLamports:'200',note:'REPLAY_TEST virtual deposit'};const results=await Promise.all([research.capital(session.id,deposit),research.capital(session.id,deposit)]);expect(results.filter(r=>r.duplicate)).toHaveLength(1);
 const rent=crypto.randomUUID();await research.capital(session.id,{kind:'RENT_RESERVE',requestKey:rent,amountLamports:'31',note:'REPLAY_TEST linked rent'});await research.capital(session.id,{kind:'RENT_REFUND',requestKey:crypto.randomUUID(),rentReservationKey:rent,amountLamports:'10',note:'REPLAY_TEST partial refund'});await research.capital(session.id,{kind:'WITHDRAW',requestKey:crypto.randomUUID(),amountLamports:'100',note:'REPLAY_TEST withdrawal'});
 let d=await research.detail(session.id);expect(d.snapshot).toMatchObject({cashLamports:'1079',rentReserveLamports:'21',netCapitalLamports:'1100',realizedPnlLamports:'0',equityLamports:'1100'});await store.resumeObserve();await research.runReplay(session.id,crypto.randomUUID(),'BUY');const exit=replayInput('SELL');exit.quote.inputAmount='3';exit.quote.outputAmount='36';expect((await research.apply(session.id,crypto.randomUUID(),exit)).action).toBe('SELL_PROPOSED');d=await new ResearchStore(pool).detail(session.id);expect(d.snapshot).toMatchObject({cashLamports:'1011',rentReserveLamports:'21',netCapitalLamports:'1100',realizedPnlLamports:'4',equityLamports:null});expect(d.snapshot.positions[0]).toMatchObject({quantity:'7',costLamports:'72'});
 const refunds=await Promise.allSettled([1,2].map(()=>research.capital(session.id,{kind:'RENT_REFUND',requestKey:crypto.randomUUID(),rentReservationKey:rent,amountLamports:'21',note:'REPLAY_TEST remaining refund'})));expect(refunds.filter(r=>r.status==='fulfilled')).toHaveLength(1);d=await research.detail(session.id);expect(d.snapshot.cashLamports).toBe('1032');expect(d.snapshot.rentReserveLamports).toBe('0');expect(d.snapshot.realizedPnlLamports).toBe('4');expect(d.capitalEvents).toHaveLength(5);
 await expect(research.capital(session.id,{...deposit,amountLamports:'201'})).rejects.toThrow('IDEMPOTENCY_CONFLICT');await expect(research.capital(session.id,{kind:'RENT_REFUND',requestKey:crypto.randomUUID(),rentReservationKey:crypto.randomUUID(),amountLamports:'1',note:'REPLAY_TEST wrong rent key'})).rejects.toThrow('RENT_RESERVATION_NOT_FOUND');await expect(research.apply(session.id,deposit.requestKey,replayInput('BUY'))).rejects.toThrow('IDEMPOTENCY_CONFLICT');await store.halt('REPLAY_TEST capital end');
});
it('concurrent virtual withdrawals, active worker reservations and SQL failure cannot overspend or duplicate capital',async()=>{
 const {ResearchStore}=await import('../packages/storage/src/research.js');const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');const research=new ResearchStore(pool),session=await research.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000'});const command=(kind:string,amountLamports:string)=>({kind,amountLamports,requestKey:crypto.randomUUID(),note:'REPLAY_TEST capital invariants'});
 const attempts=await Promise.allSettled([research.capital(session.id,command('WITHDRAW','600')),research.capital(session.id,command('WITHDRAW','600'))]);expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await research.detail(session.id)).snapshot).toMatchObject({cashLamports:'400',realizedPnlLamports:'0'});
 const deposit=command('DEPOSIT','50');await pool.query("CREATE FUNCTION fixture_fail_capital_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='VIRTUAL_CAPITAL_EVENT' THEN RAISE EXCEPTION 'FIXTURE_CAPITAL_CRASH'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER fixture_fail_capital_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fixture_fail_capital_audit()');try{await expect(research.capital(session.id,deposit)).rejects.toThrow('FIXTURE_CAPITAL_CRASH');expect((await research.detail(session.id)).snapshot.cashLamports).toBe('400');}finally{await pool.query('DROP TRIGGER fixture_fail_capital_audit ON audit_events');await pool.query('DROP FUNCTION fixture_fail_capital_audit()');}await research.capital(session.id,deposit);expect((await research.detail(session.id)).snapshot.cashLamports).toBe('450');
 const scheduler=new PaperSchedulerStore(pool),automated=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'0',intervalMs:1000},'REPLAY_TEST');await research.capital(automated.id,command('DEPOSIT','1000'));await scheduler.enqueue(automated.id,[replayInput('BUY').mint]);const job=(await scheduler.claim('REPLAY_TEST',60000,automated.id))!;expect((await pool.query('SELECT reservation_lamports::text AS amount FROM paper_jobs WHERE id=$1',[job.id])).rows[0].amount).toBe('120');await expect(research.capital(automated.id,command('WITHDRAW','900'))).rejects.toThrow('CAPITAL_ENCUMBERED_OR_RESERVE_BREACH');await expect(research.capital(automated.id,command('RENT_RESERVE','900'))).rejects.toThrow('CAPITAL_ENCUMBERED_OR_RESERVE_BREACH');await scheduler.fail(job,'REPLAY_TEST cleanup');await scheduler.toggle(automated.id,false);
 const shadow=await research.create({mode:'SHADOW',policy:replayPolicy,initialCashLamports:'10'});await research.capital(shadow.id,command('DEPOSIT','5'));expect((await research.detail(shadow.id)).snapshot).toMatchObject({mode:'SHADOW',sourceClass:'SHADOW',cashLamports:'15',realizedPnlLamports:'0'});
});
it('autonomous worker closes integer partial exits via fresh size-bound quotes and exact FIFO accounting',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput,}=await import('../packages/engine/src/replay.js');await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool),session=await scheduler.create({mode:'PAPER',policy:{...replayPolicy,exitFractionBps:5000},initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(session.id,[replayInput('BUY').mint]);const source:import('../apps/worker/src/paper-cycle.js').PaperSources=automaticFixtureSources(),quote=source.quote;source.quote=async request=>{const q=await quote(request);return request.inputMint===replayInput('BUY').mint?{...q,quote:{...q.quote,outputAmount:(BigInt(request.amount)*12n).toString()}}:q;};await paperCycle(scheduler,source,'REPLAY_TEST',1,session.id);const originalMarket=source.market;source.market=async mint=>{const m=await originalMarket(mint);return {...m,input:{...m.input,security:{...m.input.security!,assessment:'VETO',reasons:['REPLAY_TEST_ENTRY_RISK_DOWNGRADE']}}};};
 for(const quantity of ['5','3','2','1','0']){await pool.query('UPDATE paper_jobs SET next_at=clock_timestamp() WHERE session_id=$1',[session.id]);await paperCycle(scheduler,source,'REPLAY_TEST',1,session.id);const d=await scheduler.research.detail(session.id);expect(d.snapshot.positions[0]?.quantity??'0').toBe(quantity);}
 const d=await scheduler.research.detail(session.id);expect(d.snapshot).toMatchObject({cashLamports:'1008',realizedPnlLamports:'8',equityLamports:'1008'});expect(d.events.filter(e=>e.fill?.side==='SELL')).toHaveLength(5);expect((await scheduler.research.performance(session.id)).closedTrades).toBe(1);await scheduler.toggle(session.id,false);await store.halt('REPLAY_TEST partial end');
});
it('authenticated capital API enforces CSRF, scope, idempotency and bounded decision history pages',async()=>{
 const {passwordHash}=await import('../apps/api/src/auth.js');const password='FIXTURE-integrated-capital-owner';const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000'});
 try{const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'http://localhost:3000'},payload:{password}});const cookie=String(login.headers['set-cookie']).split(';')[0]!;const csrf=(await app.inject({url:'/api/v1/auth/session',headers:{cookie}})).json().csrfToken;const headers={cookie,origin:'http://localhost:3000','x-csrf-token':csrf};const session=(await app.inject({method:'POST',url:'/api/v1/research/sessions',headers,payload:{mode:'PAPER',initialCashLamports:'1000'}})).json();const url='/api/v1/research/sessions/'+session.id+'/capital',command={kind:'DEPOSIT',requestKey:crypto.randomUUID(),amountLamports:'25',note:'REPLAY_TEST virtual API deposit'};
 expect((await app.inject({method:'POST',url,payload:command})).statusCode).toBe(401);expect((await app.inject({method:'POST',url,headers:{cookie,origin:'http://localhost:3000'},payload:command})).statusCode).toBe(403);expect((await app.inject({method:'POST',url,headers,payload:{...command,kind:'MAINNET_DEPOSIT'}})).statusCode).toBe(400);expect((await app.inject({method:'POST',url,headers,payload:{...command,amountLamports:'1.5'}})).statusCode).toBe(400);
 expect((await app.inject({method:'POST',url,headers,payload:command})).json()).toMatchObject({classification:'VIRTUAL_CAPITAL_NOT_CHAIN',duplicate:false,snapshot:{cashLamports:'1025',realizedPnlLamports:'0'}});expect((await app.inject({method:'POST',url,headers,payload:command})).json().duplicate).toBe(true);expect((await app.inject({method:'POST',url,headers,payload:{...command,amountLamports:'26'}})).statusCode).toBe(409);
 const {ResearchStore}=await import('../packages/storage/src/research.js');const research=new ResearchStore(pool);for(let i=0;i<55;i++)await research.runReplay(session.id,crypto.randomUUID(),'MISSING_SECURITY');const first=(await app.inject({url:'/api/v1/research/sessions/'+session.id,headers:{cookie}})).json();expect(first.events).toHaveLength(50);expect(first.eventCount).toBe(55);expect(first.history.hasMore).toBe(true);const older=(await app.inject({url:'/api/v1/research/sessions/'+session.id+'?before='+first.history.nextCursor,headers:{cookie}})).json();expect(older.events).toHaveLength(5);expect(older.history.hasMore).toBe(false);expect(first.events.some((a:{id:string})=>older.events.some((b:{id:string})=>a.id===b.id))).toBe(false);expect((await app.inject({url:'/api/v1/research/sessions/'+session.id+'?limit=1000',headers:{cookie}})).statusCode).toBe(400);expect((await research.performance(session.id)).events).toBe(55);
 }finally{await app.close();}
});
it('provider dimensions never turn rate limits or stale receipts into health; worker samples survive restart and stopped runs cannot resurrect',async()=>{
 const source=observation('solana-rpc','finalized-slot',{slot:'99999999'},Date.now()-120000,'99999999');await store.save(source);await store.health('solana-rpc','DEGRADED','RATE_LIMITED');const health=(await store.system()).providers.find((p:{provider:string})=>p.provider==='solana-rpc');expect(health).toMatchObject({transport_status:'REACHABLE',response_quality:'ERROR'});expect(health.last_data_at).not.toBeNull();
 const run=crypto.randomUUID();await store.workerHeartbeat(run,'RUNNING',{marketAt:null,paperAt:null});await new Store(pool).workerHeartbeat(run,'RUNNING',{marketAt:new Date().toISOString(),paperAt:null});await store.workerHeartbeat(run,'STOPPED',{marketAt:null,paperAt:null});await store.workerHeartbeat(run,'RUNNING',{marketAt:null,paperAt:null});const row=(await pool.query('SELECT state FROM worker_heartbeats WHERE run_id=$1',[run])).rows[0];expect(row.state).toBe('STOPPED');const samples=(await pool.query('SELECT state,mode,providers FROM worker_observation_samples WHERE run_id=$1 ORDER BY sequence',[run])).rows;expect(samples.map(s=>s.state)).toEqual(['RUNNING','RUNNING','STOPPED']);expect(samples[0].providers.some((p:{provider:string})=>p.provider==='solana-rpc')).toBe(true);await expect(pool.query('DELETE FROM worker_observation_samples WHERE run_id=$1',[run])).rejects.toThrow('APPEND_ONLY');
});
it('decision audit joins the exact input, ledger sequence and source lease without inventing chain signatures',async()=>{
 const {ResearchStore}=await import('../packages/storage/src/research.js');const research=new ResearchStore(pool);const {replayPolicy}=await import('../packages/engine/src/replay.js');await store.resumeObserve();const s=await research.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000'}),r=await research.runReplay(s.id,crypto.randomUUID(),'BUY');const trace=await store.decision(r.decisionId);expect(trace!.events).toHaveLength(11);expect(trace!.lineage).toMatchObject({classification:'RESEARCH_NOT_CHAIN',chainSignature:null,session_id:s.id,fill:{sourceClass:'REPLAY',side:'BUY'}});expect(trace!.lineage!.ledger_sequence).toMatch(/^[1-9][0-9]*$/);expect(trace!.lineage!.input.sourceId).toContain('REPLAY');expect(trace!.lineage!.sourceReceipts).toHaveLength(0);await store.halt('REPLAY_TEST lineage end');
});
it('worker shutdown cannot obtain a lease when pre-aborted or commit a fill after a midflight stop',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {paperCycle}=await import('../apps/worker/src/paper-cycle.js');const {automaticFixtureSources}=await import('../packages/engine/src/automatic-fixture.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');await store.resumeObserve();const scheduler=new PaperSchedulerStore(pool),s=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000},'REPLAY_TEST');await scheduler.enqueue(s.id,[replayInput('BUY').mint]);const stopped=new AbortController();stopped.abort();await paperCycle(scheduler,automaticFixtureSources(),'REPLAY_TEST',1,s.id,stopped.signal);expect((await pool.query('SELECT attempt FROM paper_jobs WHERE session_id=$1',[s.id])).rows[0].attempt).toBe(0);
 const controller=new AbortController(),sources=automaticFixtureSources(),quote=sources.quote;sources.quote=async request=>{const q=await quote(request);controller.abort();return q;};await paperCycle(scheduler,sources,'REPLAY_TEST',1,s.id,controller.signal);expect((await scheduler.research.detail(s.id)).events).toHaveLength(0);expect((await scheduler.evidence(s.id)).some(e=>e.kind==='ERROR'&&e.payload.reason==='WORKER_STOP_REQUESTED')).toBe(true);await scheduler.toggle(s.id,false);await store.halt('REPLAY_TEST shutdown end');
});
it('enabled real-provider automation does not consume new-entry leases under owner HALT; isolated explicit resume re-enables validation only',async()=>{
 const {PaperSchedulerStore}=await import('../packages/storage/src/paper-scheduler.js');const {replayPolicy,replayInput}=await import('../packages/engine/src/replay.js');const scheduler=new PaperSchedulerStore(pool),s=await scheduler.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000',intervalMs:1000});await store.saveMarket(replayInput('BUY').mint,replayInput('BUY').mint,{classification:'REPLAY_TEST_NEGATIVE_NO_FILL'},new Date().toISOString());await scheduler.enqueue(s.id,[replayInput('BUY').mint]);await store.halt('REPLAY_TEST halted scheduler control');expect(await scheduler.claim('LIVE_PROVIDER',60000,s.id)).toBeNull();const status=(await scheduler.status()).find(r=>r.session_id===s.id);expect(status.enabled).toBe(true);expect(status.effective_execution).toBe('BLOCKED_KILL_SWITCH');expect((await pool.query('SELECT attempt FROM paper_jobs WHERE session_id=$1',[s.id])).rows[0].attempt).toBe(0);await store.resumeObserve();const job=(await scheduler.claim('LIVE_PROVIDER',60000,s.id))!;expect(job).not.toBeNull();await scheduler.fail(job,'REPLAY_TEST no provider fill attempted');await scheduler.toggle(s.id,false);await store.halt('REPLAY_TEST scheduler end');
});
it('portfolio API preserves UNKNOWN, session isolation and disconnect fencing across a real PostgreSQL binding',async()=>{
 const {passwordHash,digest}=await import('../apps/api/src/auth.js');const {keyString}=await import('../packages/connectors/src/pool-security.js');
 const wallet=keyString((await import('node:crypto')).randomBytes(32)),password='FIXTURE-portfolio-owner-not-production';let fail=false,disconnect=false,hash='';
 const rpc={read:async(method:string)=>{if(fail)throw new Error('FIXTURE_PROVIDER_DOWN');if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';if(method==='getTokenAccountsByOwner')return {context:{slot:100},value:[]};if(method==='getBalance'){if(disconnect)await pool.query('DELETE FROM wallet_bindings WHERE session_hash=$1',[hash]);return {context:{slot:100},value:100};}if(method==='getAccountInfo'){if(disconnect)await pool.query('DELETE FROM wallet_bindings WHERE session_hash=$1',[hash]);return {context:{slot:100},value:null};}throw new Error('UNEXPECTED_METHOD');}};
 const app=createApi(store,'fixture-service-token-xxxxxxxxxxxxxxxxxxx',{store,passwordHash:await passwordHash(password),origin:'http://localhost:3000',rpc});
 try{
  expect((await app.inject({url:'/api/v1/wallet/portfolio'})).statusCode).toBe(401);
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:'http://localhost:3000'},payload:{password}});const cookie=String(login.headers['set-cookie']).split(';')[0]!;hash=digest(cookie.slice(cookie.indexOf('=')+1));const headers={cookie};
  expect((await app.inject({url:'/api/v1/wallet/portfolio',headers})).json()).toMatchObject({status:'NOT_CONNECTED',holdings:null});
  // Test-only binding setup; ownership proof itself is exercised by the nonce integration test above.
  await pool.query('INSERT INTO wallet_bindings(session_hash,address,proof_hash) VALUES ($1,$2,$3)',[hash,wallet,'fixture-proof']);
  const result=(await app.inject({url:'/api/v1/wallet/portfolio',headers})).json();expect(result).toMatchObject({status:'AVAILABLE',nativeBalanceLamports:'0',holdings:[],equityLamports:null,signerEnabled:false});
  expect((await pool.query("SELECT id FROM source_snapshots WHERE source_key=$1",['wallet-portfolio:'+wallet])).rowCount).toBe(1);
  fail=true;expect((await app.inject({url:'/api/v1/wallet/portfolio',headers})).json()).toMatchObject({status:'UNAVAILABLE',nativeBalanceLamports:null,holdings:null});fail=false;
  disconnect=true;expect((await app.inject({url:'/api/v1/wallet/portfolio',headers})).json()).toMatchObject({status:'BINDING_CHANGED',holdings:null,nativeBalanceLamports:null});
  await pool.query('INSERT INTO wallet_bindings(session_hash,address,proof_hash) VALUES ($1,$2,$3)',[hash,wallet,'fixture-proof-new']);expect((await app.inject({url:'/api/v1/wallet/balance',headers})).json()).toMatchObject({status:'BINDING_CHANGED',balanceLamports:null});
 }finally{await app.close();}
});
it('wallet cursor compare-and-swap commits only one concurrent window and rolls back losing receipts/outbox',async()=>{
 const wallet='11111111111111111111111111111111';await store.addWatch(wallet);const expected=(await store.watchlists()).find(w=>w.address===wallet)!.last_signature;
 const windows=['A','B'].map(tag=>({signature:'FIXTURE_CURSOR_'+tag+'_'+crypto.randomUUID(),slot:'123',flow:{sourceAt:null,copyEligible:false}}));
 const outcomes=await Promise.allSettled(windows.map(item=>store.walletWindow(wallet,[item],item.signature,false,expected)));
 expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);const loser=outcomes.findIndex(o=>o.status==='rejected'),winner=1-loser;expect((outcomes[loser] as PromiseRejectedResult).reason.message).toBe('WALLET_CURSOR_CONFLICT');
 expect((await store.watchlists()).find(w=>w.address===wallet)!.last_signature).toBe(windows[winner]!.signature);
 expect((await pool.query('SELECT signature FROM wallet_observations WHERE wallet=$1 AND signature=$2',[wallet,windows[loser]!.signature])).rowCount).toBe(0);
 expect((await pool.query("SELECT o.id FROM outbox_events o JOIN audit_events a ON a.id=o.audit_id WHERE a.payload->>'signature'=$1",[windows[loser]!.signature])).rowCount).toBe(0);
 const restarted=new Store(pool);await expect(restarted.walletWindow(wallet,[windows[loser]!],windows[loser]!.signature,false,expected)).rejects.toThrow('WALLET_CURSOR_CONFLICT');
});

it('changed finalized receipt bytes quarantine duplicate signatures and preserve the original cursor/evidence',async()=>{
 const wallet='11111111111111111111111111111111',expected=(await store.watchlists()).find(w=>w.address===wallet)!.last_signature;
 const item={signature:'FIXTURE_RECEIPT_'+crypto.randomUUID(),slot:'124',flow:{sourceAt:null,provenance:{receiptHash:'a'.repeat(64)}}};await store.walletWindow(wallet,[item],item.signature,false,expected);
 await store.walletWindow(wallet,[item],item.signature,false,item.signature);
 const altered={...item,flow:{...item.flow,provenance:{receiptHash:'b'.repeat(64)}}};await expect(store.walletWindow(wallet,[altered],'FIXTURE_BAD_WATERMARK',false,item.signature)).rejects.toThrow('WALLET_RECEIPT_CONFLICT');
 expect((await store.watchlists()).find(w=>w.address===wallet)!.last_signature).toBe(item.signature);expect((await pool.query('SELECT payload FROM wallet_observations WHERE wallet=$1 AND signature=$2',[wallet,item.signature])).rows[0].payload.provenance.receiptHash).toBe('a'.repeat(64));
});
it('whole-session analytics and UTC filters include fills beyond the50-decision page without changing cumulative accounting',async()=>{
 const {ResearchStore}=await import('../packages/storage/src/research.js'),{replayPolicy}=await import('../packages/engine/src/replay.js');const research=new ResearchStore(pool),session=await research.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000'});await store.resumeObserve();
 try{
  await research.runReplay(session.id,crypto.randomUUID(),'BUY');await research.runReplay(session.id,crypto.randomUUID(),'SELL');for(let i=0;i<55;i++)await research.runReplay(session.id,crypto.randomUUID(),'MISSING_SECURITY');
  const page=await research.detail(session.id);expect(page.events).toHaveLength(50);expect(page.events.every(e=>e.fill===null)).toBe(true);expect(page.history.matchedCount).toBe(57);expect(page.snapshot.realizedPnlLamports).toBe('16');
  const series=await research.series(session.id);expect(series.scope).toBe('ENTIRE_SESSION_NOT_HISTORY_PAGE');expect(series.totalDecisions).toBe(57);expect(series.totalFills).toBe(2);expect(series.points).toHaveLength(57);expect(series.points[0]!.realizedPnlLamports).toBe('0');expect(series.points[1]!.realizedPnlLamports).toBe('16');expect((await research.performance(session.id)).closedTrades).toBe(1);
  const utcDay=new Date(series.points[0]!.recordedAt).toISOString().slice(0,10);expect((await research.detail(session.id,{from:utcDay,to:utcDay})).eventCount).toBe(57);const empty=await research.series(session.id,{from:'2099-01-01'});expect(empty.points).toHaveLength(0);expect(empty.totalDecisions).toBe(57);expect(empty.totalFills).toBe(2);const emptyPage=await research.detail(session.id,{from:'2099-01-01'});expect(emptyPage.history.matchedCount).toBe(0);expect(emptyPage.events).toHaveLength(0);expect(emptyPage.snapshot.realizedPnlLamports).toBe('16');
  const shifted=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1,options:'-c timezone=Pacific/Honolulu'});try{expect((await new ResearchStore(shifted).series(session.id,{from:utcDay,to:utcDay})).points).toHaveLength(57);}finally{await shifted.end();}
  await expect(research.series(session.id,{from:'2026-02-31'})).rejects.toThrow();await expect(research.detail(session.id,{from:'2026-11-03',to:'2026-11-01'})).rejects.toThrow('INVALID_DATE_RANGE');
 }finally{await store.halt('FIXTURE_SERIES_END');}
});
it('long SHADOW sessions continue beyond10000 with bounded chart extrema and full streamed statistics; PAPER entry cap still permits owned protective exits',async()=>{
 const {ResearchStore}=await import('../packages/storage/src/research.js'),{replayPolicy}=await import('../packages/engine/src/replay.js');const research=new ResearchStore(pool);await store.resumeObserve();
 // Bulk rows are labelled regression fixtures, never provider or chain proof.
 const bulk=async(id:string,n:number)=>{const template=(await pool.query('SELECT j.input,j.snapshot,r.mint,r.policy_hash,r.mode FROM research_journal j JOIN agent_runs r ON r.decision_id=j.decision_id WHERE j.session_id=$1 ORDER BY j.id DESC LIMIT 1',[id])).rows[0];await pool.query(`WITH seeds AS MATERIALIZED(SELECT gen_random_uuid() AS decision,gen_random_uuid() AS request,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text) AS hash FROM generate_series(1,$2)), agents AS (
 INSERT INTO agent_runs(decision_id,mint,input_hash,policy_hash,mode,action) SELECT decision,$5,hash,$6,$7,'SKIP' FROM seeds RETURNING decision_id
 ) INSERT INTO research_journal(session_id,request_key,input_hash,decision_id,input,fill,snapshot) SELECT $1,s.request,s.hash,s.decision,$3::jsonb||jsonb_build_object('sourceId','REPLAY_TEST_BULK'),NULL,$4::jsonb FROM seeds s JOIN agents a ON a.decision_id=s.decision`,[id,n,JSON.stringify(template.input),JSON.stringify(template.snapshot),template.mint,template.policy_hash,template.mode]);};
 try{
  const shadow=await research.create({mode:'SHADOW',policy:replayPolicy,initialCashLamports:'1000'});await research.runReplay(shadow.id,crypto.randomUUID(),'MISSING_SECURITY');await bulk(shadow.id,10004);await research.runReplay(shadow.id,crypto.randomUUID(),'MISSING_SECURITY');
  const series=await research.series(shadow.id);expect(series.totalDecisions).toBe(10006);expect(series.rangeDecisionCount).toBe(10006);expect(series.sampling).toBe('BUCKET_FIRST_LAST_MIN_MAX');expect(series.points.length).toBeLessThanOrEqual(10000);const boundaries=(await pool.query('SELECT min(id)::text AS first,max(id)::text AS last FROM research_journal WHERE session_id=$1',[shadow.id])).rows[0];expect(series.points[0]!.id).toBe(boundaries.first);expect(series.points.at(-1)!.id).toBe(boundaries.last);expect(await research.performance(shadow.id)).toMatchObject({events:10006,closedTrades:0,winRate:null});
  const paper=await research.create({mode:'PAPER',policy:replayPolicy,initialCashLamports:'1000'});await research.runReplay(paper.id,crypto.randomUUID(),'BUY');await bulk(paper.id,9999);await expect(research.runReplay(paper.id,crypto.randomUUID(),'BUY')).rejects.toThrow('RESEARCH_SESSION_EVENT_LIMIT');await research.runReplay(paper.id,crypto.randomUUID(),'SELL');expect((await research.detail(paper.id)).snapshot.positions).toHaveLength(0);expect(await research.performance(paper.id)).toMatchObject({events:10001,closedTrades:1,closedNetPnlLamports:'16'});await expect(research.runReplay(paper.id,crypto.randomUUID(),'SELL')).rejects.toThrow('RESEARCH_SESSION_EVENT_LIMIT');
 }finally{await store.halt('REPLAY_LONG_HISTORY_END');}
},30000);
it('router executable review is explicitly recorded/revoked per program and does not become a signer mandate',async()=>{const {ProgramReviewStore,MAINNET_GENESIS}=await import('../packages/storage/src/program-reviews.js'),{JUPITER}=await import('../packages/execution/src/swap-verifier.js');const reviews=new ProgramReviewStore(pool),codeHash=crypto.randomUUID().replaceAll('-','').repeat(2),id=await reviews.approve({genesis:MAINNET_GENESIS,program:JUPITER,codeHash,evidenceHash:'e'.repeat(64),reviewer:'REPLAY_TEST',reviewReference:'REPLAY_TEST_ROUTER_REVIEW_NOT_ACTUAL_CODE'});expect(await reviews.resolve(codeHash,JUPITER)).toBe(id);expect(await reviews.resolve(codeHash)).toBeNull();expect((await store.system()).signer_enabled).toBe(false);await reviews.revoke(id,'REPLAY_TEST revision retired');expect(await reviews.resolve(codeHash,JUPITER)).toBeNull();await expect(reviews.resolve(codeHash,'UNSUPPORTED')).rejects.toThrow();});
it('authenticated read-only swap preflight joins raw RPC, per-program review, durable evidence and API without signing or creating an order',async()=>{const {proofFixture}=await import('./support/swap-proof.js'),{ProgramReviewStore,MAINNET_GENESIS}=await import('../packages/storage/src/program-reviews.js'),{JUPITER}=await import('../packages/execution/src/swap-verifier.js'),{CPMM_PROGRAM}=await import('../packages/connectors/src/pool-security.js'),{passwordHash}=await import('../apps/api/src/auth.js');const f=proofFixture(),reviews=new ProgramReviewStore(pool);for(const [program,pin]of [[JUPITER,f.pins.jupiter],[CPMM_PROGRAM,f.pins.cpmm]] as const)pin.reviewId=await reviews.approve({genesis:MAINNET_GENESIS,program,codeHash:pin.codeHash,evidenceHash:'f'.repeat(64),reviewer:'REPLAY_TEST',reviewReference:'REPLAY_TEST_BINARY_PROGRAM_NOT_MAINNET_REVIEW'});const before=await store.system(),token='fixture-preflight-service-token-xxxxxxxxxxxxxxxx',browser={store,passwordHash:await passwordHash('FixturePreflightPasswordNotOwner1'),origin:'http://localhost:3000',rpc:f.rpc,rpcProvenance:'REPLAY_TEST' as const},app=createApi(store,token,browser),body={intent:f.intent,transaction:f.wire.toString('base64'),minimumSlot:1},headers={authorization:'Bearer '+token};try{
 expect((await app.inject({method:'POST',url:'/api/v1/execution/preflight-swap',payload:body})).statusCode).toBe(401);expect((await app.inject({method:'POST',url:'/api/v1/execution/preflight-swap',headers:{...headers,origin:'https://evil.invalid'},payload:body})).statusCode).toBe(403);const outcomes=await Promise.all([app.inject({method:'POST',url:'/api/v1/execution/preflight-swap',headers,payload:body}),app.inject({method:'POST',url:'/api/v1/execution/preflight-swap',headers,payload:body})]);expect(outcomes.map(r=>r.statusCode).sort()).toEqual([200,429]);const verified=outcomes.find(r=>r.statusCode===200)!.json();expect(verified).toMatchObject({financialAuthorization:'NONE',chainSettlementVerified:false,sourceClass:'REPLAY_TEST',status:'WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED'});const saved=(await app.inject({url:'/api/v1/execution/preflights',headers})).json();expect(saved.some((r:{id:string;source_class:string})=>r.id===verified.id&&r.source_class==='REPLAY_TEST')).toBe(true);expect((await pool.query('SELECT id FROM execution_orders WHERE correlation_id=$1',[f.intent.correlationId])).rowCount).toBe(0);expect((await store.system()).mode).toBe(before.mode);expect((await store.system()).signer_enabled).toBe(false);await expect(pool.query('DELETE FROM execution_swap_preflights WHERE id=$1',[verified.id])).rejects.toThrow('APPEND_ONLY');
 }finally{await app.close();}await reviews.revoke(f.pins.jupiter.reviewId,'REPLAY_TEST preflight revocation');const denied=createApi(store,token,browser);try{const result=await denied.inject({method:'POST',url:'/api/v1/execution/preflight-swap',headers,payload:body});expect(result.statusCode).toBe(422);expect(result.json()).toMatchObject({status:'VETO',financialAuthorization:'NONE',reason:'SWAP_EXECUTABLE_REVIEW_REQUIRED'});}finally{await denied.close();}});

it('swap receipts bind immutable preflight proof, survive store restart and dedupe concurrent observations without touching orders or portfolio',async()=>{
 const {receiptFixture}=await import('./support/swap-receipt.js'),{SwapPreflightStore}=await import('../packages/storage/src/swap-preflight.js'),{reconcileFinalizedSwap}=await import('../packages/execution/src/swap-chain-receipt.js');
 const f=await receiptFixture(),proofs=new SwapPreflightStore(pool),unsigned=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),f.record.signedWire.subarray(65)]),id=await proofs.save(f.record.intent,unsigned,'REPLAY_TEST',{status:'WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED'},{verifiedAt:f.clock,context:f.context}),saved=await new SwapPreflightStore(pool).prepared(id);
 expect(saved.source_class).toBe('REPLAY_TEST');const result=await reconcileFinalizedSwap({...f.record,intent:saved.intent,verificationContext:saved.verification_context,verifiedAt:Number(saved.verified_at)},f.rpc,'REPLAY_TEST');expect(result).toMatchObject({status:'RECONCILED_OBSERVATION',chainVerified:false});
 const ids=await Promise.all(Array.from({length:8},()=>proofs.observe(id,f.record.signature,result)));expect(new Set(ids).size).toBe(1);expect((await pool.query('SELECT id FROM audit_events WHERE event_type=$1 AND payload->>\'id\'=$2',['SWAP_RECEIPT_OBSERVED',ids[0]])).rowCount).toBe(1);expect((await proofs.receipts()).some(r=>r.id===ids[0]&&r.correlation_id===f.record.intent.correlationId)).toBe(true);
 await expect(pool.query('UPDATE execution_swap_prepared SET verified_at=0 WHERE preflight_id=$1',[id])).rejects.toThrow('APPEND_ONLY');await expect(pool.query('DELETE FROM execution_swap_receipt_observations WHERE id=$1',[ids[0]])).rejects.toThrow('APPEND_ONLY');
 expect((await pool.query('SELECT id FROM execution_orders WHERE correlation_id=$1',[f.record.intent.correlationId])).rowCount).toBe(0);
 const token='fixture-receipt-service-token-xxxxxxxxxxxxxxxx',app=createApi(store,token,{store,passwordHash:'unused',origin:'http://localhost:3000',rpc:f.rpc,rpcProvenance:'REPLAY_TEST'}),headers={authorization:'Bearer '+token};try{
  expect((await app.inject({method:'POST',url:'/api/v1/execution/observe-swap-receipt',payload:{preflightId:id,signature:f.record.signature}})).statusCode).toBe(401);
  const r=await app.inject({method:'POST',url:'/api/v1/execution/observe-swap-receipt',headers,payload:{preflightId:id,signature:f.record.signature}});expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({status:'RECONCILED_OBSERVATION',portfolioApplied:false,sourceClass:'REPLAY_TEST',receipt:{success:true}});
  expect((await app.inject({url:'/api/v1/execution/receipt-observations',headers})).json().some((r:{id:string})=>r.id===ids[0])).toBe(true);
 }finally{await app.close();}
});

it('receipt worker recovers after crash, leases concurrent readers, backs off unknown results and never submits',async()=>{
 const {receiptFixture}=await import('./support/swap-receipt.js'),{SwapPreflightStore}=await import('../packages/storage/src/swap-preflight.js'),{swapReceiptCycle}=await import('../apps/worker/src/swap-receipt-cycle.js');const f=await receiptFixture(),s=new SwapPreflightStore(pool),unsigned=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),f.record.signedWire.subarray(65)]),id=await s.save(f.record.intent,unsigned,'REPLAY_TEST',{status:'WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED'},{verifiedAt:f.clock,context:f.context});
 const jobs=await Promise.all(Array.from({length:6},()=>s.enqueue(id,f.record.signature)));expect(new Set(jobs.map(j=>j.id)).size).toBe(1);const job=jobs[0];expect(await s.claim('LIVE_CHAIN_RPC',job.id)).toBeNull();
 const calls:string[]=[],rpc={read:async(m:Parameters<typeof f.rpc.read>[0])=>{calls.push(m);return f.rpc.read(m);}};
 await expect(swapReceiptCycle(s,rpc,'REPLAY_TEST',job.id,()=>{throw new Error('CRASH_AFTER_OBSERVATION');})).rejects.toThrow('CRASH_AFTER_OBSERVATION');expect((await s.requests()).find(r=>r.id===job.id).state).toBe('PENDING');
 expect(await swapReceiptCycle(s,rpc,'REPLAY_TEST',job.id)).toEqual({status:'IDLE'});
 await pool.query("UPDATE execution_swap_receipt_requests SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);
 const results=await Promise.all(Array.from({length:6},()=>swapReceiptCycle(new SwapPreflightStore(pool),rpc,'REPLAY_TEST',job.id)));expect(results.filter(r=>r.status==='RECONCILED_OBSERVATION')).toHaveLength(1);expect((await s.requests()).find(r=>r.id===job.id)).toMatchObject({state:'COMPLETE',attempts:2});expect((await pool.query('SELECT id FROM execution_swap_receipt_observations WHERE preflight_id=$1',[id])).rowCount).toBe(1);
 expect(calls.every(m=>['getTransaction','getSignatureStatuses','getGenesisHash'].includes(m))).toBe(true);
 const g=await receiptFixture(true),other=await s.save(g.record.intent,Buffer.concat([Buffer.from([1]),Buffer.alloc(64),g.record.signedWire.subarray(65)]),'REPLAY_TEST',{status:'WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED'},{verifiedAt:g.clock,context:g.context}),pending=await s.enqueue(other,g.record.signature);
 expect(await swapReceiptCycle(s,{read:async()=>null},'REPLAY_TEST',pending.id)).toMatchObject({status:'UNKNOWN',reason:'SIGNED_RECEIPT_UNAVAILABLE',portfolioApplied:false});expect((await s.requests()).find(r=>r.id===pending.id)).toMatchObject({state:'PENDING',attempts:1});expect(await swapReceiptCycle(s,g.rpc,'REPLAY_TEST',pending.id)).toEqual({status:'IDLE'});
 await pool.query('UPDATE execution_swap_receipt_requests SET next_at=clock_timestamp() WHERE id=$1',[pending.id]);expect(await swapReceiptCycle(s,g.rpc,'REPLAY_TEST',pending.id)).toMatchObject({status:'RECONCILED_OBSERVATION',receipt:{success:false},accounting:{inputAmount:'0',outputAmount:'0'}});
});

it('worker dependency faults persist honest retry audit and outbox without fabricating agent decisions or fills',async()=>{
 const id=crypto.randomUUID();await store.workerFault(id,'AGENTS','DATABASE_QUERY_TIMEOUT');const event=(await pool.query("SELECT a.id,a.payload,o.id AS sequence FROM audit_events a JOIN outbox_events o ON o.audit_id=a.id WHERE a.correlation_id=$1 AND a.event_type='DEPENDENCY_FAILURE_RETRY'",[id])).rows[0];expect(event.payload).toMatchObject({component:'AGENTS',reason:'DATABASE_QUERY_TIMEOUT',financialAuthorization:'NONE'});expect(event.sequence).toBeDefined();expect((await pool.query('SELECT decision_id FROM agent_runs WHERE decision_id=$1',[id])).rowCount).toBe(0);await expect(store.workerFault(id,'AGENTS','https://untrusted.invalid/key=SECRET')).rejects.toThrow();
});

it('bounded dashboard preserves deterministic latest source identity before enriching only selected candidates',async()=>{
 const {keyString}=await import('../packages/connectors/src/pool-security.js'),{randomBytes}=await import('node:crypto'),mint=keyString(randomBytes(32)),at=Date.now();for(const version of [1,2])await store.save(observation('dexscreener',mint,{classification:'REPLAY_TEST_SOURCE_SELECTION',version},at));const dashboard=await store.dashboard(),candidate=dashboard.candidates.find(c=>c.mint===mint);expect(candidate.payload.version).toBe(2);expect(dashboard.candidates.length).toBeLessThanOrEqual(100);expect(dashboard.candidates.map(c=>c.received_at.getTime())).toEqual([...dashboard.candidates.map(c=>c.received_at.getTime())].sort((a,b)=>b-a));
});
it('fresh discovery excludes a mint whose latest receipt is future-dated instead of falling back to older data',async()=>{
 const {keyString}=await import('../packages/connectors/src/pool-security.js'),{randomBytes}=await import('node:crypto'),{agentCycle}=await import('../apps/worker/src/agent-cycle.js'),mint=keyString(randomBytes(32)),valid=keyString(randomBytes(32)),at=Date.now();await store.saveMarket(mint,mint,{classification:'REPLAY_TEST_FUTURE_MISSING_PROOF'},new Date(at-1).toISOString());await store.saveMarket(mint,mint,{classification:'REPLAY_TEST_FUTURE_MISSING_PROOF'},new Date(at+600000).toISOString());await store.saveMarket(valid,valid,{classification:'REPLAY_TEST_VALID_TIME_MISSING_PROOF'},new Date(at-1).toISOString());await agentCycle(store);expect((await pool.query('SELECT mint FROM agent_cursors WHERE mint=$1',[mint])).rowCount).toBe(0);expect((await pool.query('SELECT mint FROM agent_cursors WHERE mint=$1',[valid])).rowCount).toBe(1);
});
