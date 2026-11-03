import {swapPreflightRoutes} from './swap-preflight.js';
import { loadReleaseEvidence } from '../../../packages/domain/src/qualification-evidence.js';
import { ExecutionStore } from '../../../packages/storage/src/execution.js';
import { evaluateSoftwareGates } from '../../../packages/domain/src/qualification.js';
import { walletRoutes } from './wallet-routes.js';
import type { WalletReadRpc } from '../../../packages/connectors/src/wallet.js';
import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { setTimeout as pause } from 'node:timers/promises';
import { z } from 'zod';
import { cookieToken,digest,opaque,verifyPassword } from './auth.js';
import { capitalCommand } from '../../../packages/accounting/src/capital.js';
import { ResearchStore,historyPage,historyRange } from '../../../packages/storage/src/research.js';
import { PaperSchedulerStore,automationConfig } from '../../../packages/storage/src/paper-scheduler.js';
import { replayPolicy } from '../../../packages/engine/src/replay.js';
import { address,bootstrapVeto } from '../../../packages/domain/src/index.js';
import type { Store } from '../../../packages/storage/src/index.js';
export function createApi(store: Pick<Store,'system'|'candidates'|'halt'>, token: string, browser?:{store:Store;passwordHash:string;origin:string;rpc?:Pick<WalletReadRpc,'read'>|undefined;rpcProvenance?:'LIVE_CHAIN_RPC'|'REPLAY_TEST';runtimeIdentity?:string}) {
  if (Buffer.byteLength(token) < 32) throw new Error('SERVICE_TOKEN_REQUIRED');
  const app = Fastify({logger:false,bodyLimit:4096,requestTimeout:10000});
  app.addHook('onRequest',async (request,reply) => {
    reply.header('cache-control','no-store').header('x-content-type-options','nosniff').header('content-security-policy',"default-src 'none'; frame-ancestors 'none'");
    if (request.url === '/api/v1/health/live' && request.method === 'GET') return;
    const path=request.url.split('?')[0];
    if (browser && path === '/api/v1/auth/login') {
      if (request.headers.origin !== browser.origin) return reply.code(403).send({error:'ORIGIN_DENIED'});
      return;
    }
    if (browser && request.headers.cookie && !request.headers.authorization) {
      const raw=cookieToken(request.headers.cookie);
      const session=raw ? await browser.store.session(digest(raw)) : null;
      if (!session) return reply.code(401).send({error:'SESSION_EXPIRED'});
      if (!['GET','HEAD'].includes(request.method) && (request.headers.origin !== browser.origin || request.headers['x-csrf-token'] !== session.csrf_token)) return reply.code(403).send({error:'CSRF_DENIED'});
      return;
    }
    if (request.headers.origin || request.headers.cookie) return reply.code(403).send({error:'BROWSER_AUTH_NOT_IMPLEMENTED'});
    const supplied = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return reply.code(401).send({error:'UNAUTHORIZED'});
  });
  app.setErrorHandler((_error,_request,reply) => {reply.code(503).send({error:'DEPENDENCY_UNAVAILABLE',signerEnabled:false});});
  app.get('/api/v1/health/live',async () => ({status:'alive'}));
  app.get('/api/v1/health/ready',async (_request,reply) => {
    const system = await store.system();
    const evidence=await loadReleaseEvidence();
    const software=evaluateSoftwareGates([...evidence.proofs,{id:'SAFE_LOCKED_DEFAULTS',status:system.signer_enabled===false?'PASS':'FAIL',evidence:system.signer_enabled===false?'system_state.signer_enabled=false; bootstrap hard caps zero':null}]);
    return reply.code(software.qualified?200:503).send({status:software.qualified?'SOFTWARE_QUALIFIED':'DEGRADED',reason:software.qualified?'OWNER_ACTIVATION_STILL_REQUIRED':'RELEASE_NOT_QUALIFIED',mode:system.mode,signerEnabled:false,software,source:{runtime:browser?.runtimeIdentity??null,tested:evidence.testedSourceIdentity,match:browser?.runtimeIdentity&&evidence.testedSourceIdentity?browser.runtimeIdentity===evidence.testedSourceIdentity:null},evidenceIssues:evidence.issues});
  });
  app.get('/api/v1/system',async () => {
    const state = await store.system();
    return {...state,signerEnabled:false,release:'NOT_LIVE_VERIFIED',decision:bootstrapVeto(state.mode === 'HALTED')};
  });
  app.get('/api/v1/market/candidates',async () => ({classification:'DISCOVERY_LEADS_ONLY',items:await store.candidates()}));
  app.post('/api/v1/system/halt',async () => {await store.halt('local-service-owner');return {mode:'HALTED',signerEnabled:false};});
  if (browser) {
    walletRoutes(app,browser.store,browser.origin,browser.rpc);
    const execution=new ExecutionStore(browser.store.pool);swapPreflightRoutes(app,browser.store,browser.rpc,browser.rpcProvenance);
    app.get('/api/v1/execution/orders',async()=>({mode:'HARNESS',sourceClass:'HARNESS_NOT_CHAIN',mainnetEnabled:false,capability:'TRANSFER_AND_SINGLE_CP_SWAP_HARNESS_PREFLIGHT_ONLY_NO_MAINNET_AUTHORITY',orders:await execution.list()}));
    app.get('/api/v1/execution/orders/:id',async(request,reply)=>{const id=z.uuid().safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'INVALID_ORDER_ID'});const result=await execution.detail(id.data);return result??reply.code(404).send({error:'ORDER_NOT_FOUND'});});
    const research=new ResearchStore(browser.store.pool);
    const scheduler=new PaperSchedulerStore(browser.store.pool);
    app.get('/api/v1/paper/automations',()=>scheduler.status());
    app.get('/api/v1/paper/automations/:id/evidence',async(request,reply)=>{const id=z.uuid().safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});return scheduler.evidence(id.data);});
    app.post('/api/v1/paper/automations',async(request,reply)=>{const input=automationConfig.safeParse(request.body);if(!input.success)return reply.code(400).send({error:'INVALID_PAPER_POLICY'});return scheduler.create(input.data);});
    app.post('/api/v1/paper/automations/:id',async(request,reply)=>{const id=z.uuid().safeParse((request.params as {id:string}).id),input=z.strictObject({enabled:z.boolean()}).safeParse(request.body);if(!id.success||!input.success)return reply.code(400).send({error:'INVALID_PAPER_CONTROL'});await scheduler.toggle(id.data,input.data.enabled);return {enabled:input.data.enabled,signerEnabled:false};});
    const attempts=new Map<string,{count:number;until:number}>();
    const connections=new Map<string,number>();
    const secure=browser.origin.startsWith('https:') ? '; Secure' : '';
    app.post('/api/v1/auth/login',async (request,reply) => {
      const now=Date.now();
      for (const [key,value] of attempts) if (value.until<now) attempts.delete(key);
      const previous=attempts.get(request.ip) ?? {count:0,until:now+60_000};
      attempts.set(request.ip,{count:previous.count+1,until:previous.until});
      if (previous.count>=5 || attempts.size>1000) return reply.code(429).send({error:'LOGIN_RATE_LIMITED'});
      const input=z.object({password:z.string().min(12).max(256)}).safeParse(request.body);
      if (!input.success || !await verifyPassword(input.data.password,browser.passwordHash)) return reply.code(401).send({error:'INVALID_LOGIN'});
      attempts.delete(request.ip); // successful owner authentication clears failed-attempt budget
      const raw=opaque();const csrf=opaque();
      await browser.store.createSession(digest(raw),csrf);
      reply.header('set-cookie',`sentinel_session=${raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${secure}`);
      return {authenticated:true};
    });
    app.get('/api/v1/auth/session',async (request,reply) => {
      const raw=cookieToken(request.headers.cookie);
      const session=raw ? await browser.store.session(digest(raw)) : null;
      if (!session) return reply.code(401).send({error:'SESSION_REQUIRED'});
      return {role:'OWNER',csrfToken:session.csrf_token,expiresAt:session.expires_at};
    });
    app.post('/api/v1/auth/logout',async (request,reply) => {
      const raw=cookieToken(request.headers.cookie);
      if (raw) await browser.store.deleteSession(digest(raw));
      reply.header('set-cookie',`sentinel_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
      return {authenticated:false};
    });
    app.post('/api/v1/smart-wallets',async(request,reply)=>{
      const input=z.object({address}).safeParse(request.body);
      if(!input.success)return reply.code(400).send({error:'INVALID_PUBLIC_ADDRESS'});
      await browser.store.addWatch(input.data.address);return {status:'OBSERVING_PUBLIC_ONLY'};
    });
    app.get('/api/v1/decisions/:id',async(request,reply)=>{
      const id=z.uuid().safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'INVALID_DECISION_ID'});
      const result=await browser.store.decision(id.data);return result ?? reply.code(404).send({error:'DECISION_NOT_FOUND'});
    });
    app.post('/api/v1/system/resume-observe',async(request,reply)=>{
      const input=z.object({password:z.string().min(12).max(256)}).safeParse(request.body);
      if(!input.success||!await verifyPassword(input.data.password,browser.passwordHash))return reply.code(403).send({error:'REAUTH_REQUIRED'});
      await browser.store.resumeObserve();return {mode:'OBSERVE',signerEnabled:false};
    });
    app.get('/api/v1/research/sessions',async()=>research.list());
    app.post('/api/v1/research/sessions',async(request,reply)=>{
      const input=z.object({mode:z.enum(['PAPER','SHADOW']),initialCashLamports:z.string().regex(/^(0|[1-9][0-9]{0,18})$/)}).safeParse(request.body);
      if(!input.success)return reply.code(400).send({error:'INVALID_RESEARCH_SESSION'});
      return research.create({...input.data,policy:replayPolicy});
    });
    app.post('/api/v1/research/sessions/:id/capital',async(request,reply)=>{
      const id=z.uuid().safeParse((request.params as {id:string}).id),input=capitalCommand.safeParse(request.body);if(!id.success||!input.success)return reply.code(400).send({error:'INVALID_VIRTUAL_CAPITAL_COMMAND'});
      try{return await research.capital(id.data,input.data);}catch(error){const code=error instanceof Error?error.message:'';if(['IDEMPOTENCY_CONFLICT','CAPITAL_ENCUMBERED_OR_RESERVE_BREACH','VIRTUAL_CASH_OVERFLOW','RENT_RESERVATION_NOT_FOUND','RENT_REFUND_EXCEEDS_RESERVATION'].includes(code))return reply.code(409).send({error:code});throw error;}
    });
    app.get('/api/v1/research/sessions/:id/series',async(request,reply)=>{const id=z.uuid().safeParse((request.params as {id:string}).id),range=historyRange.safeParse(request.query);if(!id.success||!range.success)return reply.code(400).send({error:'INVALID_SERIES_RANGE'});return research.series(id.data,range.data);});
    app.get('/api/v1/research/sessions/:id/performance',async(request,reply)=>{const id=z.uuid().safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});return research.performance(id.data);});
    app.get('/api/v1/research/sessions/:id',async(request,reply)=>{
      const id=z.uuid().safeParse((request.params as {id:string}).id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});const page=historyPage.safeParse(request.query);if(!page.success)return reply.code(400).send({error:'INVALID_HISTORY_PAGE'});return research.detail(id.data,page.data);
    });
    app.post('/api/v1/research/sessions/:id/replay',async(request,reply)=>{
      const id=z.uuid().safeParse((request.params as {id:string}).id);
      const input=z.object({requestKey:z.uuid(),scenario:z.enum(['BUY','SELL','MISSING_SECURITY','STALE_QUOTE'])}).safeParse(request.body);
      if(!id.success||!input.success)return reply.code(400).send({error:'INVALID_REPLAY'});
      return research.runReplay(id.data,input.data.requestKey,input.data.scenario);
    });
    app.get('/api/v1/dashboard',async () => browser.store.dashboard());
    app.get('/api/v1/events',async (request,reply) => {
      const raw=cookieToken(request.headers.cookie);
      if (!raw) return reply.code(401).send({error:'SESSION_REQUIRED'});
      const query=request.query as {after?:string};
      const candidate=request.headers['last-event-id'] ?? query.after ?? '0';
      if (typeof candidate !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(candidate) || BigInt(candidate)>9223372036854775807n) return reply.code(400).send({error:'INVALID_CURSOR'});
      const key=digest(raw);
      if ((connections.get(key) ?? 0)>=2 || [...connections.values()].reduce((a,b)=>a+b,0)>=20) return reply.code(429).send({error:'STREAM_LIMIT'});
      connections.set(key,(connections.get(key) ?? 0)+1);
      let cursor=candidate;let closed=false;const deadline=Date.now()+15000;
      const stop=new AbortController();
      reply.raw.on('close',() => {closed=true;stop.abort();});
      reply.hijack();
      reply.raw.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive','x-accel-buffering':'no'});
      reply.raw.write('retry: 2000\n\n');
      try {
        while (!closed && Date.now()<deadline) {
          if (!await browser.store.session(key)) break;
          const events=await browser.store.events(cursor);
          for (const event of events) {
            if (closed) break;
            if (!reply.raw.write(`id: ${event.sequence}\nevent: update\ndata: ${JSON.stringify({version:1,...event})}\n\n`)) {closed=true;break;}
            cursor=event.sequence as string;
          }
          if (!closed) reply.raw.write(`event: heartbeat\ndata: ${JSON.stringify({at:new Date().toISOString()})}\n\n`);
          try {await pause(events.length===100 ? 10 : 1500,undefined,{signal:stop.signal});} catch {break;}
        }
      } catch { /* terminate: native EventSource reconnects from last delivered ID */ }
      finally {
        const count=(connections.get(key) ?? 1)-1;
        if (count>0) connections.set(key,count);else connections.delete(key);
        reply.raw.end();
      }
    });
  }
  return app;
}
