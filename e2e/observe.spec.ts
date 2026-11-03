import { test,expect } from '@playwright/test';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
const testOrigin=process.env.PLAYWRIGHT_BASE_URL??'http://localhost:3000';
const evidenceDir=process.env.EVIDENCE_DIR ?? 'evidence/R4/R3.1/browser';
const auth=JSON.parse(await readFile(process.env.LOCAL_AUTH_PATH??'.tmp/local-auth.json','utf8')) as {password:string;serviceToken:string};
const traced=new WeakSet<object>();
const secrets=new Set([auth.password,auth.serviceToken]);
test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByLabel('Password owner lokal').fill(auth.password);
  await page.getByRole('button',{name:'Masuk ke terminal'}).click();
  await expect(page.getByRole('heading',{name:'Market overview'})).toBeVisible();
  const cookie=(await page.context().cookies()).find(c=>c.name==='sentinel_session');if(cookie)secrets.add(cookie.value);
  const res=await page.request.get('/api/v1/auth/session');const data=await res.json();secrets.add(data.csrfToken);
  // Begin evidence only after password entry; cookies/CSRF are redacted from archive after completion.
  await page.context().tracing.start({screenshots:true,snapshots:true,sources:true});traced.add(page);
});
test.afterEach(async({page},info)=>{
  await page.context().setOffline(false);
  const name=info.project.name+'-'+info.title.replace(/[^a-z0-9]+/gi,'-');
  await mkdir(evidenceDir,{recursive:true});
  if(traced.has(page))await page.context().tracing.stop({path:evidenceDir+'/'+name+'.zip'});
  const current=await page.request.get('/api/v1/auth/session');
  if(current.ok()){const data=await current.json();secrets.add(data.csrfToken);await page.request.post('/api/v1/auth/logout',{headers:{origin:testOrigin,'x-csrf-token':data.csrfToken}});}
  let prior:string[]=[];try{prior=JSON.parse(await readFile('.tmp/e2e-redact.json','utf8'));}catch{ /* first test has no prior redaction file */ }
  await writeFile('.tmp/e2e-redact.json',JSON.stringify([...new Set([...prior,...secrets])]),{mode:0o600});
});
test('live provider dashboard and audit drilldown @external',async({page},info)=>{
  await expect(page.getByRole('status')).toContainText('STREAMING');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.getByText('dex-market',{exact:true})).toBeVisible();
  await expect(page.getByText('LOCKED',{exact:true})).toBeVisible();
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-overview.png`,fullPage:true});
  await page.getByRole('link',{name:'Audit stream'}).click();
  await page.locator('.audit-row').first().click();
  await expect(page.getByRole('region',{name:'Detail audit'})).toBeVisible();
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-audit.png`,fullPage:true});
});
test('auth and CSRF rejection, disconnect and reconnect',async({page})=>{
  const reject=await page.request.post('/api/v1/system/halt',{headers:{origin:testOrigin}});expect(reject.status()).toBe(403);
  await page.context().setOffline(true);
  await expect(page.getByRole('status')).toContainText('DISCONNECTED',{timeout:25000});
  await expect(page.getByText(/DATA STALE \/ DISCONNECTED/)).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByRole('status')).toContainText('STREAMING',{timeout:25000});
  const response=await page.request.get('/api/v1/dashboard');expect(response.status()).toBe(200);
});
test('durable owner STOP and keyboard access',async({page},info)=>{
  await page.getByRole('button',{name:'STOP',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mode')).toHaveText('HALTED');
  await page.reload();await expect(page.getByTestId('mode')).toHaveText('HALTED');
  await expect(page.getByRole('status')).toContainText('STREAMING');
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-halted.png`,fullPage:true});
});
test('public watchlist validates address and copy feed has no invented signals',async({page},info)=>{
  await page.getByRole('link',{name:'Smart wallets'}).click();
  await page.getByLabel('Public wallet address Solana').fill('I'.repeat(32));
  await page.getByRole('button',{name:'Tambah pengamatan'}).click();
  await expect(page.getByRole('alert').filter({hasText:'Watchlist ditolak'})).toBeVisible();
  await page.getByRole('link',{name:'Copy feed',exact:false}).click();
  await expect(page.getByRole('heading',{name:'Mirror signal observations'})).toBeVisible();
  await expect(page.getByText('COPY EXECUTION DISABLED')).toBeVisible();
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-copy-feed.png`,fullPage:true});
});
test('eleven executed rule modules expose real veto and persisted trace',async({page},info)=>{
  await page.getByRole('link',{name:'Agent council'}).click();
  await expect(page.getByText('RULE ENGINE · AUDITED STAGES')).toBeVisible();
  await expect(page.locator('.agent')).toHaveCount(11);
  const rug=page.locator('.agent').filter({has:page.getByText('RUG CHECK',{exact:true})});
  await rug.locator('summary').click();
  await expect(rug).toContainText(/UNKNOWN|VETO|PASS/);
  await rug.getByRole('button',{name:'Lihat trace'}).click();
  const trace=page.getByRole('region',{name:'Detail audit'});
  await expect(trace).toContainText('RUG_CHECK');
  const id=(await trace.getByRole('heading').innerText()).replace('Event #','');
  const proof=await (await page.request.get('/api/v1/decisions/'+id)).json();
  expect(proof.events.find((e:{role:string})=>e.role==='GUARD').payload.output.state).toBe('VETO');
  await expect(trace).toContainText(proof.events.find((e:{role:string})=>e.role==='RUG_CHECK').payload.output.reasons[0]);
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-agents.png`,fullPage:true});
});
test('worker advances durable events after dashboard tab is closed',async({page})=>{
  const initial=await page.request.get('/api/v1/dashboard');const before=BigInt((await initial.json()).cursor);
  await page.close();
  await expect.poll(async()=>{const response=await page.request.get('/api/v1/dashboard');return BigInt((await response.json()).cursor)>before;},{timeout:40000,intervals:[1000,2000,4000]}).toBe(true);
});
test('PAPER positive buy-sell and veto persist; SHADOW never fills',async({page},info)=>{
 await page.getByRole('link',{name:'Research rules'}).click();
 await expect(page.getByRole('heading',{name:'Paper & shadow laboratory'})).toBeVisible();
 await expect(page.getByTestId('mode')).toHaveText(/^(OBSERVE|HALTED)$/);
 const reauth=page.getByLabel('Password owner untuk resume OBSERVE');
 if(await reauth.isVisible()){await reauth.fill(auth.password);await page.getByRole('button',{name:'Resume OBSERVE saja'}).click();await expect(page.getByTestId('mode')).toHaveText('OBSERVE');}
 await page.getByRole('button',{name:'Buat PAPER',exact:true}).click();
 await expect(page.getByTestId('research-cash')).toHaveText('1000');
 const sessionId=await page.getByLabel('Sesi tersimpan').inputValue();
 await page.getByRole('button',{name:'Replay BUY',exact:true}).click();await expect(page.getByTestId('research-cash')).toHaveText('898');
 await page.getByRole('button',{name:'Replay SELL',exact:true}).click();await expect(page.getByTestId('research-pnl')).toHaveText('16');
 await page.getByRole('button',{name:'Replay MISSING_SECURITY'}).click();await expect(page.locator('.research-body .audit-row').first()).toContainText('SKIP');
 await page.screenshot({path:`${evidenceDir}/${info.project.name}-paper-positive.png`,fullPage:true});
 await page.reload();await page.getByLabel('Sesi tersimpan').selectOption(sessionId);await expect(page.getByTestId('research-pnl')).toHaveText('16');
 for(const [route,title]of [['Positions','Research positions'],['Trades','Research trade history'],['Analytics','Research performance']]){
  await page.getByRole('link',{name:route,exact:false}).click();await expect(page.getByRole('heading',{name:title})).toBeVisible();
  await page.getByLabel('Sesi ledger',{exact:true}).selectOption(sessionId);await expect(page.getByTestId('ledger-state')).toHaveText('READY');
  if(route==='Positions')await expect(page.getByTestId('no-positions')).toBeVisible();
  else{await expect(page.getByRole('cell',{name:'BUY · REPLAY · PAPER',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'SELL · REPLAY · PAPER',exact:true})).toBeVisible();}
  if(route==='Analytics'){await expect(page.getByTestId('performance-scope')).toContainText('REPLAY_TEST · N=1');await expect(page.getByText('Closed-trade research metrics',{exact:true})).toBeVisible();await expect(page.getByTestId('ledger-pnl')).toHaveText('16');await expect(page.getByRole('img',{name:'Realized research PnL history'})).toBeVisible();await page.getByLabel('Ledger date from').fill('2099-01-01');await expect(page.getByText('Tidak ada titik ledger dalam rentang ini.')).toBeVisible();await page.getByLabel('Ledger date from').fill('');}
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-${route.toLowerCase()}.png`,fullPage:true});
 }
 await page.getByRole('link',{name:'Research rules'}).click();await expect(page.getByRole('heading',{name:'Paper & shadow laboratory'})).toBeVisible();
 await page.getByRole('button',{name:'Buat SHADOW',exact:true}).click();await expect(page.getByTestId('research-cash')).toHaveText('1000');
 await page.getByRole('button',{name:'Replay BUY',exact:true}).click();await expect(page.locator('.research-body .audit-row').first()).toContainText('BUY_PROPOSED');await expect(page.locator('.research-body .audit-row').first()).toContainText('NO FILL');
 await expect(page.getByTestId('research-cash')).toHaveText('1000');
 await page.getByRole('button',{name:'STOP',exact:true}).click();await expect(page.getByTestId('mode')).toHaveText('HALTED');
});
test('Phantom identity harness verifies nonce without granting trading authority',async({page},info)=>{
 const {generateKeyPairSync,sign}=await import('node:crypto');const pair=generateKeyPairSync('ed25519');const bytes=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);let n=BigInt('0x'+bytes.toString('hex')),address='';const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){address=alphabet[Number(n%58n)]+address;n/=58n;}for(const b of bytes){if(b)break;address='1'+address;}
 await page.exposeFunction('sentinelTestSignMessage',(message:number[])=>Array.from(sign(null,Buffer.from(message),pair.privateKey)));
 await page.addInitScript(({address})=>{const publicKey={toString:()=>address};const listeners:Record<string,(()=>void)[]>={};const p={isPhantom:true,publicKey,connect:async()=>({publicKey}),signMessage:async(message:Uint8Array)=>({publicKey,signature:new Uint8Array(await (window as unknown as {sentinelTestSignMessage:(message:number[])=>Promise<number[]>}).sentinelTestSignMessage(Array.from(message)))}),disconnect:async()=>{for(const fn of listeners.disconnect??[])fn();},on:(event:string,fn:()=>void)=>{(listeners[event]??=[]).push(fn);},removeListener:(event:string,fn:()=>void)=>{listeners[event]=(listeners[event]??[]).filter(value=>value!==fn);}};Object.defineProperty(window,'phantom',{value:{solana:p}});},{address});
 await page.goto('/wallets');await expect(page.getByRole('heading',{name:'Wallet ownership & native balance'})).toBeVisible();
 await page.getByRole('button',{name:'Connect & verify Phantom',exact:true}).click();await expect(page.getByTestId('wallet-proof-state')).toHaveText('VERIFIED');
 await expect(page.getByText('Verified address: '+address,{exact:true})).toBeVisible();
 const proof=await page.request.get('/api/v1/wallet');expect((await proof.json()).signerEnabled).toBe(false);
 await expect(page.getByTestId('portfolio-state')).toContainText(/AVAILABLE|UNAVAILABLE/,{timeout:45000});
 const inventory=await (await page.request.get('/api/v1/wallet/portfolio')).json();expect(inventory.signerEnabled).toBe(false);if(inventory.status==='UNAVAILABLE')expect(inventory.holdings).toBeNull();else{expect(inventory.status).toBe('AVAILABLE');expect(inventory.equityLamports).toBeNull();expect(inventory.receipts.length).toBeGreaterThan(0);}
 await page.evaluate(()=>{const label=document.createElement('p');label.textContent='TEST HARNESS — ephemeral test identity, not owner wallet or trading proof';label.style.color='#f0cb81';document.querySelector('.research-body')?.prepend(label);});
 await page.screenshot({path:`${evidenceDir}/${info.project.name}-phantom-harness.png`,fullPage:true});
 await page.getByRole('button',{name:'Disconnect wallet',exact:true}).click();await expect(page.getByTestId('wallet-proof-state')).toHaveText('NOT_CONNECTED');
 await expect(page.getByText('Dedicated trading wallet',{exact:true})).toBeVisible();await expect(page.getByText('NOT_CONFIGURED · isolated signer DISABLED · exposure cap 0. Wallet utama Phantom tidak menjadi signer unattended.',{exact:true})).toBeVisible();
});
test('setup and integration diagnostics report actual locked release state',async({page},info)=>{
 for(const [path,title]of [['/setup','Setup diagnostics'],['/settings/integrations','Integration diagnostics']]){
  await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(page.getByTestId('diagnostic-state')).toHaveText('CHECKED');
  await expect(page.getByText('DEGRADED · RELEASE_NOT_QUALIFIED',{exact:true})).toBeVisible();await expect(page.getByText('DISABLED',{exact:true})).toBeVisible();await expect(page.getByText(/INDEPENDENT_VERIFIER_SIGNER_HARNESS · PARTIAL/)).toBeVisible();await expect(page.getByText(/Tested scopes:/).first()).toBeVisible();
  await page.getByRole('button',{name:'Run diagnostics'}).click();await expect(page.getByTestId('diagnostic-state')).toHaveText('CHECKED');
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${evidenceDir}/${info.project.name}-${path==='/setup'?'setup':'integrations'}.png`,fullPage:true});
 }
});
test('autonomous PAPER worker persists entry, survives process restart, requotes exit and exposes equity trace',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL,'Requires isolated sentinel_d1_test database; fixture never runs on owner DB');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const run=promisify(execFile);
 const session=await (await page.request.get('/api/v1/auth/session')).json();
 const headers={origin:testOrigin,'x-csrf-token':session.csrfToken};
 expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);
 const worker=async(mode:string,id?:string,variant?:string)=>{const result=await run('pnpm',['exec','tsx','scripts/paper-fixture-worker.ts',mode,...(id?[id]:[]),...(variant?[variant]:[])],{env:process.env});return JSON.parse(result.stdout);};
 const initialized=await worker('init');const buy=await worker('once',initialized.id);expect(buy.detail.snapshot.cashLamports).toBe('898');expect(buy.detail.snapshot.positions).toHaveLength(1);
 await page.goto('/paper');await expect(page.getByRole('heading',{name:'Provider-driven paper engine'})).toBeVisible();await page.getByLabel('Automation session',{exact:true}).selectOption(initialized.id);await expect(page.getByTestId('automation-scope')).toContainText('REPLAY_TEST');await expect(page.getByText(/10 units · FIFO cost 102/)).toBeVisible();
 await page.screenshot({path:`${evidenceDir}/${info.project.name}-automatic-entry.png`,fullPage:true});
 const sold=await worker('once',initialized.id);expect(sold.pid).not.toBe(buy.pid);expect(sold.detail.events.map((e:{action:string})=>e.action)).toEqual(['BUY_PROPOSED','SELL_PROPOSED']);
 await expect(page.getByTestId('automatic-pnl')).toHaveText('16');await expect(page.getByTestId('automatic-equity')).toHaveText('1016');
 await page.getByRole('button').filter({hasText:'SELL_PROPOSED'}).click();await expect(page.getByRole('region',{name:'Detail audit'})).toContainText('POST_ACCOUNTING_PAPER_CASH');
 await page.screenshot({path:`${evidenceDir}/${info.project.name}-automatic-exit.png`,fullPage:true});
 const evidence=await (await page.request.get('/api/v1/paper/automations/'+initialized.id+'/evidence')).json();expect(evidence.some((e:{kind:string})=>e.kind==='QUOTE_BUY')).toBe(true);expect(evidence.some((e:{kind:string})=>e.kind==='QUOTE_SELL')).toBe(true);expect(evidence.every((e:{scope:string})=>e.scope==='REPLAY_TEST')).toBe(true);
 await page.getByRole('button',{name:'Pause automation',exact:true}).click();const protective=await worker('init');await worker('once',protective.id);const failedExit=await worker('once',protective.id,'fee-exit');expect(failedExit.detail.snapshot.positions).toHaveLength(1);expect(failedExit.detail.snapshot.equityLamports).toBeNull();expect(failedExit.detail.events.at(-1).fill).toBeNull();const exited=await worker('once',protective.id,'risk-exit');expect(exited.detail.snapshot.positions).toHaveLength(0);expect(exited.detail.snapshot.realizedPnlLamports).toBe('0');await page.getByLabel('Automation session',{exact:true}).selectOption(protective.id);await expect(page.getByTestId('automatic-equity')).toHaveText('1000');await page.getByRole('button').filter({hasText:'SELL_PROPOSED'}).click();await expect(page.getByRole('region',{name:'Detail audit'})).toContainText('EXIT_ENTRY_RISK_DOWNGRADE');await page.screenshot({path:`${evidenceDir}/${info.project.name}-protective-exit.png`,fullPage:true});
 const forged=await page.request.post('/api/v1/paper/automations',{headers,data:{mode:'MICRO_LIVE',initialCashLamports:'1000'}});expect(forged.status()).toBe(400);
 await page.getByRole('button',{name:'Pause automation',exact:true}).click();await expect(page.getByTestId('automation-scope')).toContainText('PAUSED');await page.getByRole('button',{name:'STOP',exact:true}).click();await expect(page.getByTestId('mode')).toHaveText('HALTED');
});
test('real provider automation records fresh quote and honest safety SKIP without Replay @external',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Resume requires isolated disposable runtime');
 test.setTimeout(90000);
 const {paperPolicy}=await import('../packages/engine/src/paper-policy');const session=await (await page.request.get('/api/v1/auth/session')).json();const headers={origin:testOrigin,'x-csrf-token':session.csrfToken};
 expect((await page.request.post('/api/v1/system/halt',{headers})).status()).toBe(200);
 const created=await page.request.post('/api/v1/paper/automations',{headers,data:{mode:'PAPER',policy:paperPolicy,initialCashLamports:'100000000',intervalMs:30000}});expect(created.status()).toBe(200);const id=(await created.json()).id;
 expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);
 try{
 await page.goto('/paper');await expect(page.getByRole('heading',{name:'Provider-driven paper engine'})).toBeVisible();await page.getByLabel('Automation session',{exact:true}).selectOption(id);await expect(page.getByTestId('automation-scope')).toContainText('LIVE_PROVIDER');
 await expect.poll(async()=>{const res=await page.request.get('/api/v1/paper/automations/'+id+'/evidence');return (await res.json()).some((e:{kind:string})=>e.kind==='QUOTE_BUY');},{timeout:70000,intervals:[1000,2000,4000]}).toBe(true);
 const detail=await (await page.request.get('/api/v1/research/sessions/'+id)).json();expect(detail.events.every((e:{fill:unknown;input:{inputDataClass:string}})=>e.fill===null&&e.input.inputDataClass==='LIVE_PROVIDER')).toBe(true);
 const evidence=await (await page.request.get('/api/v1/paper/automations/'+id+'/evidence')).json();expect(evidence.some((e:{kind:string})=>e.kind==='MARKET')).toBe(true);expect(evidence.some((e:{kind:string;payload:{quote?:{hash:string}}})=>e.kind==='QUOTE_BUY'&&e.payload.quote?.hash)).toBe(true);
 await expect(page.getByRole('button').filter({hasText:'SKIP'}).first()).toBeVisible();await page.getByRole('button',{name:'Load provider evidence'}).click();await expect(page.getByText('Persisted source / quote receipts',{exact:true})).toBeVisible();
 await page.screenshot({path:`${evidenceDir}/${info.project.name}-actual-provider-paper.png`,fullPage:true});
 }finally{await page.request.post('/api/v1/paper/automations/'+id,{headers,data:{enabled:false}});}
});
test('virtual capital preserves PnL, rent is refundable once and search misses do not become provider outages',async({page},info)=>{
 await page.getByLabel('Cari token atau mint').fill('REPLAY_TEST_NO_MATCH_239847');await expect(page.getByText(/NO_SEARCH_RESULTS/)).toBeVisible();await expect(page.getByText('MARKET UNAVAILABLE / STALE',{exact:true})).toHaveCount(0);await page.screenshot({path:`${evidenceDir}/${info.project.name}-no-search-results.png`,fullPage:true});
 await page.goto('/rules');await page.getByRole('button',{name:'Buat PAPER',exact:true}).click();await expect(page.getByTestId('research-cash')).toHaveText('1000');await page.getByText('Virtual capital & refundable rent',{exact:true}).click();
 await page.getByLabel('Virtual flow amount',{exact:true}).fill('200');await page.getByRole('button',{name:'Record virtual accounting event',exact:true}).click();await expect(page.getByTestId('research-cash')).toHaveText('1200');await expect(page.getByTestId('research-pnl')).toHaveText('0');await page.getByRole('button',{name:'Record virtual accounting event',exact:true}).click();await expect(page.getByTestId('capital-event-status')).toContainText('already recorded');await expect(page.getByTestId('research-cash')).toHaveText('1200');
 await page.getByLabel('Virtual operation',{exact:true}).selectOption('RENT_RESERVE');await page.getByLabel('Virtual flow amount',{exact:true}).fill('20');await page.getByRole('button',{name:'Record virtual accounting event',exact:true}).click();await expect(page.getByTestId('research-cash')).toHaveText('1180');
 const id=await page.getByLabel('Sesi tersimpan',{exact:true}).inputValue();const d=await (await page.request.get('/api/v1/research/sessions/'+id)).json();expect(d.snapshot).toMatchObject({netCapitalLamports:'1200',rentReserveLamports:'20',equityLamports:'1200',realizedPnlLamports:'0'});const key=d.capitalEvents.find((e:{kind:string})=>e.kind==='RENT_RESERVE').request_key;
 await page.getByLabel('Virtual operation',{exact:true}).selectOption('RENT_REFUND');await page.getByLabel('Rent reservation key',{exact:true}).fill(key);await page.getByRole('button',{name:'Record virtual accounting event',exact:true}).click();await expect(page.getByTestId('research-cash')).toHaveText('1200');await page.getByRole('button',{name:'Prepare another virtual event',exact:true}).click();await page.getByRole('button',{name:'Record virtual accounting event',exact:true}).click();await expect(page.getByTestId('capital-event-status')).toContainText('RENT_REFUND_EXCEEDS_RESERVATION');await expect(page.getByTestId('research-pnl')).toHaveText('0');await page.screenshot({path:`${evidenceDir}/${info.project.name}-capital-lifecycle.png`,fullPage:true});
});
test('bounded persisted history paginates and a late session response cannot replace the current ledger',async({page},info)=>{
 const session=await (await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};
 const create=async(initialCashLamports:string)=>(await (await page.request.post('/api/v1/research/sessions',{headers,data:{mode:'PAPER',initialCashLamports}})).json()).id;
 const a=await create('1111'),b=await create('2222');for(let i=0;i<55;i++)expect((await page.request.post('/api/v1/research/sessions/'+a+'/replay',{headers,data:{requestKey:crypto.randomUUID(),scenario:'MISSING_SECURITY'}})).status()).toBe(200);
 await page.goto('/rules');await page.getByLabel('Sesi tersimpan',{exact:true}).selectOption(a);await expect(page.getByText('Showing 50 of 55 decisions',{exact:true})).toBeVisible();expect(await page.locator('.audit-row').count()).toBeLessThanOrEqual(50);await page.getByRole('button',{name:'Older decisions',exact:true}).click();await expect(page.getByText('Showing 5 of 55 decisions',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Latest decisions',exact:true}).click();await expect(page.getByText('Showing 50 of 55 decisions',{exact:true})).toBeVisible();await page.screenshot({path:`${evidenceDir}/${info.project.name}-bounded-history.png`,fullPage:true});
 await page.getByLabel('Sesi tersimpan',{exact:true}).selectOption(b);await expect(page.getByTestId('research-cash')).toHaveText('2222');let release!:()=>void,intercepted!:()=>void;const gate=new Promise<void>(r=>{release=r;}),entered=new Promise<void>(r=>{intercepted=r;});await page.route('**/api/v1/research/sessions/'+a,async route=>{const response=await route.fetch();intercepted();await gate;await route.fulfill({response,status:503});});await page.getByLabel('Sesi tersimpan',{exact:true}).selectOption(a);await entered;await page.getByLabel('Sesi tersimpan',{exact:true}).selectOption(b);await expect(page.getByTestId('research-cash')).toHaveText('2222');const late=page.waitForResponse(r=>r.url().endsWith('/research/sessions/'+a));release();await late;await page.evaluate(()=>new Promise(requestAnimationFrame));await expect(page.getByTestId('research-cash')).toHaveText('2222');await expect(page.getByText('Research backend unavailable. Tidak ada hasil yang diasumsikan berhasil.',{exact:true})).toHaveCount(0);await page.unrouteAll({behavior:'wait'});
});
test('partial PAPER exits persist FIFO and remaining inventory across independent fixture-worker restarts',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Disposable fixture database required');const session=await (await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const run=promisify(execFile);const worker=async(mode:string,id?:string)=>JSON.parse((await run('pnpm',['exec','tsx','scripts/paper-fixture-worker.ts',mode,...(id?[id]:[])],{env:process.env})).stdout);
 const init=await worker('init-partial'),buy=await worker('once',init.id),partial=await worker('once',init.id);expect(partial.pid).not.toBe(buy.pid);expect(partial.detail.snapshot.positions[0]).toMatchObject({quantity:'5',costLamports:'51'});await page.goto('/paper');await page.getByLabel('Automation session',{exact:true}).selectOption(init.id);await expect(page.getByTestId('automation-scope')).toContainText('REPLAY_TEST');await expect(page.getByText(/5 units · FIFO cost 51/)).toBeVisible();await expect(page.getByTestId('automatic-equity')).toHaveText('UNKNOWN');await page.screenshot({path:`${evidenceDir}/${info.project.name}-partial-exit.png`,fullPage:true});
 for(let i=0;i<4;i++)await worker('once',init.id);await expect(page.getByTestId('automatic-pnl')).toHaveText('8');await expect(page.getByTestId('automatic-equity')).toHaveText('1008');await page.getByRole('button',{name:'Pause automation',exact:true}).click();await page.getByRole('button',{name:'STOP',exact:true}).click();await expect(page.getByTestId('mode')).toHaveText('HALTED');
});
test('actual heartbeat, provider dimensions and decision-to-ledger lineage remain distinct from event connectivity and execution authority',async({page},info)=>{
 await expect(page.getByTestId('worker-heartbeat')).toContainText('RUNNING');await expect(page.getByTestId('worker-heartbeat')).toContainText('FRESH');await expect(page.locator('.providers')).toContainText('transport');await expect(page.locator('.providers')).toContainText('response');await expect(page.locator('.providers')).toContainText('subscription');const ready=await page.request.get('/api/v1/health/ready');expect(ready.status()).toBe(503);const diagnostic=await ready.json();expect(diagnostic.software.qualified).toBe(false);expect(diagnostic.software.gates.some((g:{status:string})=>g.status!=='PASS')).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-provider-dimensions.png`,fullPage:true});
 await page.route('**/api/v1/events?*',route=>route.abort());await page.goto('/');await expect(page.getByRole('status')).toContainText('DISCONNECTED');await expect(page.getByText(/Event stream disconnected; snapshot polling/)).toBeVisible();await expect(page.getByText(/DATA STALE \/ DISCONNECTED/)).toHaveCount(0);await page.unrouteAll({behavior:'wait'});
 const session=await (await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};const s=await (await page.request.post('/api/v1/research/sessions',{headers,data:{mode:'PAPER',initialCashLamports:'1000'}})).json();expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);const result=await (await page.request.post('/api/v1/research/sessions/'+s.id+'/replay',{headers,data:{requestKey:crypto.randomUUID(),scenario:'BUY'}})).json();const trace=await (await page.request.get('/api/v1/decisions/'+result.decisionId)).json();expect(trace.lineage).toMatchObject({session_id:s.id,classification:'RESEARCH_NOT_CHAIN',chainSignature:null,fill:{sourceClass:'REPLAY'}});expect(trace.lineage.ledger_sequence).toMatch(/^[1-9]/);expect(trace.events).toHaveLength(11);
 await page.goto('/rules');await page.getByLabel('Sesi tersimpan',{exact:true}).selectOption(s.id);await page.getByRole('button').filter({hasText:'BUY_PROPOSED'}).click();await expect(page.getByRole('region',{name:'Detail audit'})).toContainText('ledger_sequence');await expect(page.getByRole('region',{name:'Detail audit'})).toContainText('diagnostics');await page.screenshot({path:`${evidenceDir}/${info.project.name}-ledger-lineage.png`,fullPage:true});await page.getByRole('button',{name:'STOP',exact:true}).click();await expect(page.getByTestId('mode')).toHaveText('HALTED');
});

test('portfolio UI bounds holdings and clears stale data on disconnect — labelled browser response fixture',async({page},info)=>{
 await page.route('**/api/v1/wallet',route=>route.fulfill({json:{status:'VERIFIED',address:'FIXTURE_PUBLIC_ADDRESS',verified_at:'fixture',proof_hash:'fixture'}}));
 await page.route('**/api/v1/wallet/balance',route=>route.fulfill({json:{status:'UNAVAILABLE',balanceLamports:null}}));
 await page.route('**/api/v1/wallet/portfolio',route=>route.fulfill({json:{status:'AVAILABLE',consistency:'BROWSER_FIXTURE_NOT_CHAIN_EVIDENCE',holdings:Array.from({length:60},(_,i)=>({mint:'FIXTURE_MINT_'+i,program:'fixture',amount:'123',decimals:6,accountLamports:'100',transferStatus:'FIXTURE_READ_ONLY'}))}}));
 await page.goto('/wallets');await expect(page.getByTestId('portfolio-state')).toContainText('AVAILABLE');
 await expect(page.locator('tbody tr')).toHaveCount(25);await page.getByRole('button',{name:'More holdings',exact:true}).click();await expect(page.getByText('FIXTURE_MINT_25',{exact:true})).toBeVisible();
 expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'More holdings',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(10);await expect(page.getByRole('button',{name:'More holdings',exact:true})).toBeDisabled();
 await page.screenshot({path:`${evidenceDir}/${info.project.name}-portfolio-labelled-fixture.png`,fullPage:true});
 await page.unroute('**/api/v1/wallet');await page.unroute('**/api/v1/wallet/portfolio');await page.getByRole('button',{name:'Disconnect wallet',exact:true}).click();await expect(page.getByTestId('wallet-proof-state')).toHaveText('NOT_CONNECTED');await expect(page.getByText('FIXTURE_MINT_50',{exact:true})).toHaveCount(0);
});

test('copy receipt evidence is keyboard accessible and bounded — labelled response fixture',async({page},info)=>{
 await page.route('**/api/v1/dashboard',async route=>{const res=await route.fetch();const data=await res.json();data.copyFeed=[{signature:'FIXTURE_NOT_CHAIN_SIGNATURE',wallet:'FIXTURE_PUBLIC_WALLET',slot:'0',received_at:new Date().toISOString(),payload:{status:'UNKNOWN',reason:'BROWSER_FIXTURE_NOT_CHAIN_EVIDENCE',copyAction:'SKIP',deltas:[],provenance:{receiptHash:'fixture-hash',commitment:'FIXTURE'},nativeEffects:{status:'UNKNOWN',pnlLamports:null,copyAuthority:false}}}];await route.fulfill({json:data});});
 await page.goto('/copy-feed');const summary=page.getByText('Receipt evidence & account effects',{exact:true});await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('.receipt-evidence pre')).toContainText('BROWSER_FIXTURE_NOT_CHAIN_EVIDENCE');await expect(page.locator('.receipt-evidence pre')).toContainText('fixture-hash');expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-copy-evidence-labelled-fixture.png`,fullPage:true});
});
test('persisted execution harness links eleven roles, attempt, receipt and ledger; real process crash recovers without resubmit',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Requires isolated fixture database/runtime');test.setTimeout(60000);
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');const run=promisify(execFile);const authSession=await (await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':authSession.csrfToken};expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);
 try{
  const call=async(args:string[])=>JSON.parse((await run('pnpm',['exec','tsx','scripts/execution-fixture-worker.ts',...args],{env:process.env})).stdout);
  const positive=await call(['run']);expect(positive.result).toBe('RECONCILED');expect(positive.detail.ledger.cash_after).toBe('895');expect(positive.detail.decisionTrace).toHaveLength(11);
  const veto=await call(['veto']);expect(veto.status).toBe('VETO_NO_ORDER');
  let crashed:{id:string}|undefined;try{await call(['crash']);throw new Error('Expected actual process termination');}catch(error){const e=error as {code?:number;stdout?:string};expect(e.code).toBe(88);crashed=JSON.parse(e.stdout!);}
  const recovered=await call(['recover',crashed!.id]);expect(recovered.result).toBe('RECONCILED');expect(recovered.detail.events.filter((e:{state:string})=>e.state==='BROADCASTING')).toHaveLength(1);expect(recovered.detail.mainnetReceiptVerified).toBe(false);
  const detail=await page.request.get('/api/v1/execution/orders/'+positive.id);expect(detail.status()).toBe(200);expect((await detail.json()).sourceClass).toBe('HARNESS_NOT_CHAIN');
  expect((await page.request.post('/api/v1/execution/orders',{headers,data:{mode:'MAINNET'}})).status()).toBe(404);
  await page.goto('/trades');await expect(page.getByTestId('execution-state')).toHaveText('AVAILABLE');await page.getByLabel('Persisted harness order').selectOption(positive.id);await expect(page.getByTestId('execution-detail')).toContainText('HARNESS_NOT_CHAIN');await expect(page.getByTestId('execution-detail')).toContainText('GUARD');await expect(page.getByTestId('execution-detail')).toContainText('895');expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-execution-harness-lineage.png`,fullPage:true});
 }finally{await page.request.post('/api/v1/system/halt',{headers});}
});
test('whole-session analytics retain off-page fills and reject late filtered responses — real PostgreSQL history',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Requires disposable browser database');test.setTimeout(60000);
 const session=await (await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);
 try{
  const created=await page.request.post('/api/v1/research/sessions',{headers,data:{mode:'PAPER',initialCashLamports:'1000'}}),id=(await created.json()).id;const replay=async(scenario:string)=>{expect((await page.request.post(`/api/v1/research/sessions/${id}/replay`,{headers,data:{requestKey:crypto.randomUUID(),scenario}})).status()).toBe(200);};await replay('BUY');await replay('SELL');for(let i=0;i<55;i++)await replay('MISSING_SECURITY');
  await page.goto('/analytics');await page.getByLabel('Sesi ledger',{exact:true}).selectOption(id);await expect(page.getByTestId('series-count')).toContainText('57 points from 57 matching decisions · ALL_MATCHING_POINTS · 57 decisions in entire session · 2 fills');await expect(page.getByTestId('ledger-page-count')).toContainText('50 decisions on this page');await expect(page.getByTestId('performance-scope')).toContainText('N=1');await expect(page.getByTestId('ledger-pnl')).toHaveText('16');await expect(page.getByRole('cell',{name:'BUY · REPLAY · PAPER',exact:true})).toHaveCount(0);
  const dateInput=page.getByLabel('Ledger date from');await dateInput.fill('2026-11-03');await dateInput.click({position:{x:12,y:10}});await page.keyboard.type('11032026',{delay:30});await page.keyboard.press('Tab');await expect(dateInput).toHaveValue('2026-11-03');await page.getByRole('button',{name:'Refresh ledger',exact:true}).click();await expect(dateInput).toHaveValue('2026-11-03');await dateInput.fill('');
  await page.getByRole('button',{name:'Older ledger decisions',exact:true}).click();await expect(page.getByTestId('ledger-page-count')).toContainText('7 decisions on this page');await expect(page.getByRole('cell',{name:'BUY · REPLAY · PAPER',exact:true})).toBeVisible();await expect(page.getByTestId('series-count')).toContainText('57 points');
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});await page.route(`**/api/v1/research/sessions/${id}/series?from=2099-01-01`,async route=>{const response=await route.fetch();entered();await gate;try{await route.fulfill({response});}catch{/* request may be aborted intentionally */}});
  await page.getByLabel('Ledger date from').fill('2099-01-01');await started;await page.getByLabel('Ledger date from').fill('');await expect(page.getByTestId('series-count')).toContainText('57 points');release();await page.evaluate(()=>new Promise(requestAnimationFrame));await expect(page.getByTestId('series-count')).toContainText('57 points');await page.unrouteAll({behavior:'wait'});
  const empty=await page.request.get(`/api/v1/research/sessions/${id}/series?from=2099-01-01`);expect((await empty.json()).totalDecisions).toBe(57);expect((await page.request.get(`/api/v1/research/sessions/${id}/series?from=2026-11-03&to=2026-11-01`)).status()).toBe(400);
  const {Pool}=await import('pg'),db=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});try{await db.query(`WITH template AS(SELECT j.input,j.snapshot,r.mint,r.policy_hash,r.mode FROM research_journal j JOIN agent_runs r ON r.decision_id=j.decision_id WHERE j.session_id=$1 ORDER BY j.id DESC LIMIT 1), seeds AS MATERIALIZED(SELECT gen_random_uuid() AS id,gen_random_uuid() AS request,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text) AS hash FROM generate_series(1,10000)), agents AS(INSERT INTO agent_runs(decision_id,mint,input_hash,policy_hash,mode,action) SELECT s.id,t.mint,s.hash,t.policy_hash,t.mode,'SKIP' FROM seeds s CROSS JOIN template t RETURNING decision_id) INSERT INTO research_journal(session_id,request_key,input_hash,decision_id,input,fill,snapshot) SELECT $1,s.request,s.hash,s.id,t.input||jsonb_build_object('sourceId','REPLAY_TEST_BROWSER_BULK'),NULL,t.snapshot FROM seeds s JOIN agents a ON a.decision_id=s.id CROSS JOIN template t`,[id]);}finally{await db.end();}
  await page.reload();await page.getByLabel('Sesi ledger',{exact:true}).selectOption(id);await expect(page.getByTestId('series-count')).toContainText('10057 matching decisions · BUCKET_FIRST_LAST_MIN_MAX · 10057 decisions');await expect(page.getByTestId('performance-scope')).toContainText('N=1');expect((await (await page.request.get(`/api/v1/research/sessions/${id}/series`)).json()).points.length).toBeLessThanOrEqual(10000);
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-whole-session-series.png`,fullPage:true});
 }finally{await page.request.post('/api/v1/system/halt',{headers});}
});
test('Jupiter CP swap qualification BUY and protective SELL bind eleven roles, durable receipt/FIFO and crash recovery — HARNESS_NOT_CHAIN',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Requires disposable browser database');test.setTimeout(60000);
 const session=await(await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};expect((await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}})).status()).toBe(200);
 const {spawn}=await import('node:child_process');const run=(args:string[])=>new Promise<{exit:number;rows:{id:string;status:string;buy:{decisionTrace:unknown[]};exit:{detail:{order:{id:string};swapAccounting:{snapshot:unknown}}};detail:{order:{state:string};events:{state:string}[]}}[]}>((resolve,reject)=>{const child=spawn('pnpm',['exec','tsx','scripts/swap-fixture-worker.ts',...args],{env:process.env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.resume();child.once('error',reject);child.once('exit',code=>resolve({exit:code??1,rows:output.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}));});
 try{const cycle=await run(['cycle']);expect(cycle.exit).toBe(0);const result=cycle.rows[0]!;expect(result.buy.decisionTrace).toHaveLength(11);expect(result.exit.detail.swapAccounting.snapshot).toMatchObject({cashLamports:'988',realizedPnlLamports:'-12',equityLamports:'988',sourceClass:'HARNESS_NOT_CHAIN',mode:'HARNESS',positions:[]});expect((await run(['veto'])).rows[0]!.status).toBe('VETO_NO_ORDER');const crashed=await run(['crash']);expect(crashed.exit).toBe(88);const id=String(crashed.rows[0]!.id);const recovered=await run(['recover',id]);expect(recovered.exit).toBe(0);expect(recovered.rows[0]!.detail.order.state).toBe('RECONCILED');expect(recovered.rows[0]!.detail.events.filter((e:{state:string})=>e.state==='BROADCASTING')).toHaveLength(1);
 await page.goto('/trades');await page.getByLabel('Persisted harness order').selectOption(result.exit.detail.order.id);await expect(page.getByTestId('execution-detail')).toContainText('JUPITER_CPMM_SWAP');await expect(page.getByTestId('execution-detail')).toContainText('HARNESS_NOT_CHAIN');await expect(page.getByTestId('execution-detail')).toContainText('GUARD');await expect(page.getByTestId('execution-detail')).toContainText('-12');await expect(page.getByTestId('execution-detail')).toContainText('signerJournal');await expect(page.getByTestId('execution-detail')).toContainText('guard_certificate');await expect(page.getByTestId('signing-state')).toHaveText('DISABLED');await page.getByText('Independent signer policy and durable requests',{exact:true}).click();await expect(page.getByTestId('signing-evidence')).toContainText('HARNESS_NOT_CHAIN');expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-jupiter-swap-harness.png`,fullPage:true});
 }finally{await page.request.post('/api/v1/system/halt',{headers});}
});
test('confirmed STOP supersedes a delayed pre-HALT dashboard response without refresh flooding',async({page})=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Requires isolated runtime');const session=await(await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};await page.request.post('/api/v1/system/resume-observe',{headers,data:{password:auth.password}});
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);let held=false,requests=0;await page.route('**/api/v1/dashboard',async route=>{requests++;if(!held){held=true;const response=await route.fetch();entered();await gate;try{await route.fulfill({response});}catch{/* superseded fetch is intentionally aborted */}}else await route.continue();});
 try{await page.reload();await started;await page.getByRole('button',{name:'STOP',exact:true}).click();await expect(page.getByTestId('mode')).toHaveText('HALTED');release();await expect(page.getByTestId('mode')).toHaveText('HALTED');expect(requests).toBeLessThan(5);}finally{release();await page.unrouteAll({behavior:'wait'});}
});
test('read-only mainnet swap preflight persists an honest VETO and exposes proof provenance without a signature @external',async({page},info)=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap'),{MAINNET_GENESIS}=await import('../packages/execution/src/rpc-context');const f=swapFixture(),intent={...f.intent,mode:'MAINNET',genesis:MAINNET_GENESIS,maxFee:'10000',instructions:[{...f.swap,programPins:{jupiter:{codeHash:'a'.repeat(64),reviewId:crypto.randomUUID()},cpmm:{codeHash:'b'.repeat(64),reviewId:crypto.randomUUID()}}}]},session=await(await page.request.get('/api/v1/auth/session')).json(),headers={origin:testOrigin,'x-csrf-token':session.csrfToken};const response=await page.request.post('/api/v1/execution/preflight-swap',{headers,data:{intent,transaction:f.wire.toString('base64'),minimumSlot:1}});expect(response.status()).toBe(422);const proof=await response.json();expect(proof).toMatchObject({status:'VETO',financialAuthorization:'NONE',chainSettlementVerified:false,sourceClass:'LIVE_CHAIN_RPC'});expect(typeof proof.reason).toBe('string');expect((await(await page.request.get('/api/v1/execution/orders')).json()).orders.some((o:{correlation_id:string})=>o.correlation_id===intent.correlationId)).toBe(false);
 await page.goto('/trades');await expect(page.getByTestId('swap-preflight-state')).toHaveText('AVAILABLE');await expect(page.getByTestId('swap-preflight-evidence')).toContainText(proof.id);await page.getByText('Independent read-only swap preflight evidence',{exact:true}).click();await expect(page.getByTestId('swap-preflight-evidence')).toBeVisible();const evidence=page.getByTestId('swap-preflight-evidence');const bounds=await evidence.evaluate(el=>({right:el.getBoundingClientRect().right,panelRight:el.closest('section')!.getBoundingClientRect().right,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,height:el.getBoundingClientRect().height}));expect(bounds.right).toBeLessThanOrEqual(bounds.panelRight);expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth+1);expect(bounds.height).toBeLessThanOrEqual(480);await evidence.focus();await page.keyboard.press('ArrowDown');await expect(evidence).toBeFocused();expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-actual-swap-preflight-veto.png`,fullPage:true});
 await page.goto('/setup');await expect(page.getByTestId('runtime-source-identity')).toContainText(/^[a-f0-9]{64}$/);await expect(page.getByTestId('tested-source-identity')).toHaveText(/^[a-f0-9]{64} · MATCH$/);
});

test('receipt worker proof is visible in audit with provenance; empty evidence is not service failure',async({page},info)=>{
 test.skip(!process.env.TEST_DATABASE_URL?.includes('/sentinel_d1_test'),'Requires disposable browser database');
 await page.route('**/api/v1/execution/preflights',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));await page.goto('/trades');await expect(page.getByTestId('swap-preflight-state')).toHaveText('NO_EVIDENCE');await page.unroute('**/api/v1/execution/preflights');
 const {Pool}=await import('pg'),{receiptFixture}=await import('../tests/support/swap-receipt'),{SwapPreflightStore}=await import('../packages/storage/src/swap-preflight'),{swapReceiptCycle}=await import('../apps/worker/src/swap-receipt-cycle');const db=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});let id:string;
 try{const f=await receiptFixture(),s=new SwapPreflightStore(db),preflightId=await s.save(f.record.intent,Buffer.concat([Buffer.from([1]),Buffer.alloc(64),f.record.signedWire.subarray(65)]),'REPLAY_TEST',{status:'WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED'},{verifiedAt:f.clock,context:f.context}),job=await s.enqueue(preflightId,f.record.signature),result=await swapReceiptCycle(s,f.rpc,'REPLAY_TEST',job.id);expect(result).toMatchObject({status:'RECONCILED_OBSERVATION',chainVerified:false,portfolioApplied:false,receipt:{success:true}});id=String(result.id);}finally{await db.end();}
 await page.reload();await expect(page.getByTestId('swap-receipt-state')).toHaveText('AVAILABLE');await page.getByText('Finalized swap receipt observations',{exact:true}).click();const evidence=page.getByTestId('swap-receipt-evidence');await expect(evidence).toContainText(id);await expect(evidence).toContainText('REPLAY_TEST');await expect(evidence).toContainText('RECONCILED_OBSERVATION');await expect(evidence).toContainText('feeLamports');await expect(page.getByTestId('mode')).toHaveText('HALTED');await evidence.focus();await page.keyboard.press('ArrowDown');await expect(evidence).toBeFocused();expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${evidenceDir}/${info.project.name}-swap-receipt-observation.png`,fullPage:true});
});
