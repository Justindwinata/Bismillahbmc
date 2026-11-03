'use client';
import ExecutionPanel from './execution-panel';
import Link from 'next/link';
import ResearchPanel from './research-panel';
import LedgerPanel from './ledger-panel';
import WalletPanel from './wallet-panel';
import SetupPanel from './setup-panel';
import AutomaticPaper from './automatic-paper';
import { receiptFreshness } from '../../../packages/domain/src/health';
import { useCallback,useEffect,useRef,useState } from 'react';

type Pair={pairAddress:string;dexId:string;baseToken:{name:string;symbol:string};quoteToken:{symbol:string};priceUsd?:string|null;liquidity?:{usd?:number|null}|null;volume?:{m5?:number|null;h24?:number|null}|null};
type Event={sequence:string;type:string;recorded_at:string;correlation_id:string;payload:unknown};
type Candidate={mint:string;received_at:string;source_at:string|null;data_class:string;source_hash:string;market:Pair|null;market_received_at:string|null;security?:{assessment:string;verifiedAt:string;reasons:string[]}|null};
type Snapshot={version:number;recordedAt:string;cursor:string;release:string;agents:{role:string;payload:{mint:string;decisionId:string;createdAt:string;durationMs:number;output:{state:string;reasons:string[]}}}[];system:{mode:string;signer_enabled:boolean;providers:{provider:string;status:string;observed_at:string;last_data_at:string|null;transport_status:string;response_quality:string;subscription_state:string;reason:string|null}[]};chain:{slot:string;received_at:string}|null;candidates:Candidate[];events:Event[];workers:{run_id:string;state:string;observed_at:string;progress:{marketAt:string|null;paperAt:string|null}}[];watchlist:{address:string;status:string}[];copyFeed:{signature:string;wallet:string;slot:string;received_at:string;payload:{status:string;reason:string;copyAction:string;deltas:{mint:string;delta:string}[]}}[];lag:{p50_ms:number|null;p95_ms:number|null}};
const roles=['DESK','SCOUT','FILTER','RUG CHECK','ANALYST','STRATEGY','SIZER','GUARD','EXECUTOR','LOGGER','EQUITY'];
const navigation=[['overview','Overview'],['discover','Token scanner'],['smart-wallets','Smart wallets'],['copy-feed','Copy feed'],['agents','Agent council'],['paper','Autonomous paper'],['rules','Research rules'],['positions','Positions'],['trades','Trades'],['analytics','Analytics'],['risk','Risk guard'],['wallets','Wallets'],['audit','Audit stream'],['settings/integrations','Integrations'],['setup','Setup']];
const compact=(v:number|null|undefined)=>v==null?'UNKNOWN':new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(v);
const time=(v:string)=>new Date(v).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour12:false});
const age=(v:string|null,now:number)=>v ? Math.max(0,Math.floor((now-new Date(v).getTime())/1000))+'s' : 'UNKNOWN';
export default function Dashboard({view}:{view:string}) {
  const [session,setSession]=useState<'loading'|'owner'|'login'>('loading');
  const [password,setPassword]=useState('');const [message,setMessage]=useState('');
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);const [csrf,setCsrf]=useState('');
  const [networkOffline,setNetworkOffline]=useState(false);const [connection,setConnection]=useState('CONNECTING');const [now,setNow]=useState(Date.now());
  const [watchAddress,setWatchAddress]=useState('');
  const [selected,setSelected]=useState<Event|null>(null);const [query,setQuery]=useState('');
  const traceGeneration=useRef(0);const cursor=useRef('0');const source=useRef<EventSource|null>(null);
  const refreshPending=useRef<Promise<void>|null>(null),refreshEpoch=useRef(0),refreshAbort=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(refreshPending.current)return refreshPending.current;
    const epoch=refreshEpoch.current,abort=new AbortController();refreshAbort.current=abort;
    const operation=(async()=>{try {
      const response=await fetch('/api/v1/dashboard',{cache:'no-store',signal:abort.signal});
      if(epoch!==refreshEpoch.current||abort.signal.aborted)return;
      if(response.status===401){setSession('login');source.current?.close();return;}
      if(!response.ok)throw new Error('BACKEND_UNAVAILABLE');
      const data:Snapshot=await response.json();
      if(epoch!==refreshEpoch.current||abort.signal.aborted)return;
      if(data.version!==1 || !Array.isArray(data.candidates) || !/^\d+$/.test(data.cursor))throw new Error('INVALID_SNAPSHOT');
      setSnapshot(data);if(BigInt(data.cursor)>BigInt(cursor.current))cursor.current=data.cursor;
      setMessage(current=>current.startsWith('Backend tidak tersedia.')?'':current);
    }catch{if(!abort.signal.aborted&&epoch===refreshEpoch.current){setConnection('DISCONNECTED');setMessage('Backend tidak tersedia. Snapshot terakhir tetap ditampilkan sebagai stale.');}}
    })();refreshPending.current=operation;try{await operation;}finally{if(refreshPending.current===operation){refreshPending.current=null;refreshAbort.current=null;}}
  },[]);
  const loadSession=useCallback(async()=>{
    try {const response=await fetch('/api/v1/auth/session',{cache:'no-store'});
      if(!response.ok){setSession('login');return;}
      const body=await response.json();setCsrf(body.csrfToken);setSession('owner');
    }catch{setSession('login');setMessage('API tidak tersedia. Periksa service lokal.');}
  },[]);
  useEffect(()=>{void loadSession();const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[loadSession]);
  useEffect(()=>{
    if(session!=='owner')return;
    let disposed=false;let reloadTimer:ReturnType<typeof setTimeout>|undefined;
    let reconnectTimer:ReturnType<typeof setTimeout>|undefined;
    const connect=()=>{
      if(disposed || !navigator.onLine)return;
      source.current?.close();
      const stream=new EventSource('/api/v1/events?after='+cursor.current);source.current=stream;
      stream.onopen=()=>setConnection('STREAMING');
      stream.onerror=()=>{stream.close();setConnection('DISCONNECTED');if(!disposed)reconnectTimer=setTimeout(connect,2000);};
      stream.addEventListener('heartbeat',()=>setConnection('STREAMING'));
      stream.addEventListener('update',(event)=>{
        const payload=JSON.parse((event as MessageEvent).data) as Event;
        if(BigInt(payload.sequence)<=BigInt(cursor.current))return;
        cursor.current=payload.sequence;
        if(!reloadTimer)reloadTimer=setTimeout(()=>{reloadTimer=undefined;void refresh();},250);
      });
    };
    const offline=()=>{setNetworkOffline(true);source.current?.close();clearTimeout(reconnectTimer);setConnection('DISCONNECTED');};
    const online=()=>{setNetworkOffline(false);clearTimeout(reconnectTimer);void refresh().then(connect);};
    window.addEventListener('offline',offline);window.addEventListener('online',online);
    void refresh().then(connect);
    const fallback=setInterval(()=>{void refresh();},15000);
    return()=>{disposed=true;refreshEpoch.current++;refreshAbort.current?.abort();source.current?.close();clearInterval(fallback);clearTimeout(reconnectTimer);if(reloadTimer)clearTimeout(reloadTimer);window.removeEventListener('offline',offline);window.removeEventListener('online',online);};
  },[session,refresh]);
  async function login(event:React.FormEvent){event.preventDefault();setMessage('');
    try {const res=await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});
      setPassword('');if(!res.ok){setMessage(res.status===429?'Terlalu banyak percobaan. Tunggu satu menit.':'Login ditolak. Gunakan kredensial owner lokal.');return;}await loadSession();
    }catch{setMessage('Login gagal: API tidak tersedia.');}}
  async function halt(){
    try{const res=await fetch('/api/v1/system/halt',{method:'POST',headers:{'x-csrf-token':csrf}});
      if(!res.ok||(await res.json()).mode!=='HALTED')throw new Error('HALT_NOT_CONFIRMED');
      refreshEpoch.current++;refreshAbort.current?.abort();setSnapshot(current=>current?{...current,system:{...current.system,mode:'HALTED'}}:current);
      await refreshPending.current;await refresh();
    }catch{setMessage('STOP belum terkonfirmasi. Periksa koneksi dan sesi.');}
  }
  async function traceDecision(id:string){
    const generation=++traceGeneration.current;const res=await fetch('/api/v1/decisions/'+id);if(!res.ok){if(generation===traceGeneration.current)setMessage('Trace tidak tersedia.');return;}
    const trace=await res.json();if(generation!==traceGeneration.current)return;setSelected({sequence:id,type:'AGENT_DECISION_TRACE',recorded_at:trace.run.created_at,correlation_id:id,payload:trace});
  }
  async function addWatch(event:React.FormEvent){event.preventDefault();
    const res=await fetch('/api/v1/smart-wallets',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({address:watchAddress})});
    if(!res.ok){setMessage('Watchlist ditolak: alamat tidak valid, batas 2 wallet, atau sesi tidak tersedia.');return;}
    setWatchAddress('');await refresh();
  }
  async function logout(){refreshEpoch.current++;refreshAbort.current?.abort();await fetch('/api/v1/auth/logout',{method:'POST',headers:{'x-csrf-token':csrf}});setSnapshot(null);setSession('login');}
  if(session!=='owner')return <main className="login"><div className="brandmark">S<span> / </span></div><p className="eyebrow">SOLANA SENTINEL · OWNER ACCESS</p><h1>Observasi sebelum<br/>eksekusi.</h1><p>Terminal mandiri untuk data Solana, keputusan yang dapat ditelusuri, dan kontrol risiko pemilik.</p>{session==='loading'?<p role="status">Memeriksa sesi…</p>:<form onSubmit={login}><label htmlFor="password">Password owner lokal</label><input id="password" type="password" autoComplete="current-password" minLength={12} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/><button type="submit">Masuk ke terminal <span>↗</span></button></form>}<p role="alert" className="warning">{message}</p><footer>SIGNER LOCKED · OBSERVE ONLY<br/>Tidak pernah meminta seed phrase atau private key.</footer></main>;
  const halted=snapshot?.system.mode==='HALTED';
  const dataStale=!snapshot||networkOffline||message.startsWith('Backend tidak tersedia.')||now-new Date(snapshot.recordedAt).getTime()>30000;
  const stale=!snapshot || connection!=='STREAMING' || now-new Date(snapshot.recordedAt).getTime()>30000;
  const candidates=(snapshot?.candidates ?? []).filter(c=>(c.mint+' '+(c.market?.baseToken.symbol ?? '')).toLowerCase().includes(query.toLowerCase()));
  const providers=snapshot?.system.providers ?? [];
  const worker=snapshot?.workers?.find(w=>w.state==='RUNNING'&&receiptFreshness(w.observed_at,now,15000)==='FRESH')??snapshot?.workers?.[0];
  const marketFresh=(snapshot?.candidates??[]).some(c=>c.market_received_at && now-new Date(c.market_received_at).getTime()<90000);
  return <div className="terminal"><aside><Link href="/" className="wordmark">SENTINEL<span>SOLANA INTELLIGENCE</span></Link><div className="workspace">WORKSPACE <span>01 / PERSONAL</span></div><nav aria-label="Navigasi utama">{navigation.map(([path,label],i)=><Link aria-current={view===path?'page':undefined} key={path} href={path==='overview'?'/':'/'+path}><span className="nav-index">{String(i+1).padStart(2,'0')}</span>{label}<span className="nav-arrow">↗</span></Link>)}</nav><div className="sidebar-bottom"><span className="status-dot"/> OWNER SESSION<p>LLM OFF · RULE ENGINE</p><button onClick={logout} className="text-button">Keluar ↗</button><small>NOT_LIVE_VERIFIED<br/>Dedicated signer belum aktif.</small></div></aside><div className="main-shell"><header><div className="breadcrumbs">WORKSPACE <span>/</span> {navigation.find(([p])=>p===view)?.[1]?.toUpperCase()}</div><div className="header-controls"><span className="badge">MAINNET · READ ONLY</span><span className={'badge '+(halted?'danger':'accent')} data-testid="mode">{snapshot?.system.mode ?? 'UNKNOWN'}</span><button className="stop" onClick={halt}>STOP</button></div></header><main className="content"><div className="page-title"><div><p className="eyebrow">CONTROL ROOM / 01</p><h1>{view==='overview'?'Market overview':navigation.find(([p])=>p===view)?.[1]}</h1><p>Observasi nyata. Otoritas eksekusi tetap terkunci.</p></div><div className={'stream-status '+(stale?'warning':'healthy')} role="status"><span className="status-dot"/>EVENT SYNC · {connection}<small>CURSOR {snapshot?.cursor ?? '—'} · WIB</small></div></div>{message&&<p role="alert" className="notice">{message}</p>}{halted&&<div className="notice">HALTED — entry baru diblokir. Observasi tetap berjalan. STOP tidak menarik kembali transaksi yang sudah broadcast dan tidak menjamin exit.</div>}{dataStale&&<div className="notice">DATA STALE / DISCONNECTED — jangan gunakan snapshot terakhir sebagai sinyal trading.</div>}
  {!dataStale&&connection!=='STREAMING'&&<p className="notice">Event stream disconnected; snapshot polling and provider freshness are assessed separately.</p>}
  {(view==='overview'||view==='wallets')&&<section className="metrics" aria-label="Keadaan akun"><article><p className="eyebrow">NET EQUITY / SOL</p><strong>—<span>UNKNOWN</span></strong><p>Equity belum direkonsiliasi · bukan saldo nol</p></article><article><p className="eyebrow">TRADING AUTHORITY</p><strong className="locked">LOCKED</strong><p>Exposure cap 0 lamports · signing disabled</p></article><article><p className="eyebrow">FINALIZED CHAIN SLOT</p><strong className="slot">{snapshot?.chain?.slot ?? 'UNAVAILABLE'}</strong><p>Solana RPC · diterima {age(snapshot?.chain?.received_at ?? null,now)} lalu</p></article></section>}
  {(view==='overview'||view==='discover')&&<section className="panel market-panel"><div className="section-heading"><div><p className="eyebrow">DISCOVERY / LIVE_PROVIDER</p><h2>Token & liquidity feed <span className="count">{snapshot?.candidates.length ?? '—'}</span></h2></div><label className="search"><span className="sr-only">Cari token atau mint</span><input aria-label="Cari token atau mint" placeholder="Cari ticker / mint…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="feed-meta"><span className={marketFresh?'healthy':'warning'}>{!snapshot?(connection==='DISCONNECTED'?'PROVIDER_ERROR':'LOADING'):!snapshot.candidates.length&&providers.some(p=>p.status==='DEGRADED'&&['dex-market','jupiter-tokens'].includes(p.provider))?'PROVIDER_ERROR':!snapshot.candidates.length?'EMPTY_FEED':marketFresh?'OBSERVASI TERBARU':'STALE'}</span><span>HTTP polling 30s · waktu sumber UNKNOWN · harga estimasi provider</span></div><div className="table-scroll"><table><thead><tr><th>TOKEN / MINT</th><th>PRICE USD</th><th>LIQUIDITY USD</th><th>VOLUME 5M USD</th><th>RECEIPT AGE</th><th>SECURITY</th></tr></thead><tbody>{candidates.slice(0,20).map(c=><tr key={c.mint}><td><a href={'https://explorer.solana.com/address/'+c.mint} target="_blank" rel="noreferrer"><b>{c.market?.baseToken.symbol ?? 'UNENRICHED'}</b><small>{c.mint.slice(0,7)}…{c.mint.slice(-6)} ↗</small></a></td><td>{c.market?.priceUsd ? '$'+c.market.priceUsd : 'UNKNOWN'}</td><td>{compact(c.market?.liquidity?.usd)}</td><td>{compact(c.market?.volume?.m5)}</td><td className={c.market_received_at && now-new Date(c.market_received_at).getTime()<90000?'':'warning'}>{age(c.market_received_at,now)}</td><td><span className="mini-badge" title={c.security?.reasons.join(" · ")}>{c.security?.assessment ?? "NOT CHECKED"}</span></td></tr>)}</tbody></table>{!candidates.length&&<div className="empty">{query&&snapshot?.candidates.length?'NO_SEARCH_RESULTS — tidak ada token yang cocok dengan pencarian.':!snapshot?'LOADING — menunggu snapshot.':'EMPTY_FEED — belum ada kandidat yang teramati.'}</div>}</div><div className="panel-footer">Mint adalah identitas token. Feed ini bukan rekomendasi BUY dan belum lolos pemeriksaan on-chain.</div></section>}
  {view==='smart-wallets'&&<section className="panel"><div className="section-heading"><div><p className="eyebrow">PUBLIC CHAIN OBSERVATION</p><h2>Watchlist pemilik</h2></div><span className="muted">MAKSIMUM 2 ALAMAT · READ ONLY</span></div><form className="watch-form" onSubmit={addWatch}><label htmlFor="watch-address">Public wallet address Solana</label><input id="watch-address" required minLength={32} maxLength={44} value={watchAddress} onChange={e=>setWatchAddress(e.target.value)}/><button>Tambah pengamatan</button></form><div className="providers">{snapshot?.watchlist.map(w=><div key={w.address}><b className="break-address">{w.address}</b><small>{w.status}</small></div>)}{!snapshot?.watchlist.length&&<p className="empty">Belum ada wallet publik pilihan pemilik. Tidak ada wallet atau profit buatan.</p>}</div><div className="panel-footer">Jangan masukkan seed/private key. Initial history dibatasi 20 receipt finalized; gap lebih besar memblokir pemajuan cursor.</div></section>}
  {view==='trades'&&<ExecutionPanel/>}
  {view==='copy-feed'&&<section className="panel"><div className="section-heading"><div><p className="eyebrow">FINALIZED RECEIPTS / LIVE_CHAIN</p><h2>Mirror signal observations</h2></div><span className="mini-badge">COPY EXECUTION DISABLED</span></div><div className="feed-meta"><span>BLOCK TIME → RECEIVE LAG</span><span>P50 {snapshot?.lag.p50_ms??'UNKNOWN'} ms · P95 {snapshot?.lag.p95_ms??'UNKNOWN'} ms</span></div><div className="providers">{snapshot?.copyFeed.map(e=><div key={e.wallet+e.signature}><a className="break-address" href={'https://explorer.solana.com/tx/'+e.signature} target="_blank" rel="noreferrer">{e.signature.slice(0,16)}… ↗</a><span className="warning">{e.payload.copyAction}</span><small>{e.payload.status} · {e.payload.reason}</small><small>slot {e.slot} · {time(e.received_at)} WIB · wallet {e.wallet.slice(0,8)}…</small><details className="receipt-evidence"><summary>Receipt evidence &amp; account effects</summary><pre>{JSON.stringify(e.payload,null,2)}</pre></details></div>)}{!snapshot?.copyFeed.length&&<p className="empty">Belum ada receipt wallet yang diamati. Tidak ada mirror order.</p>}</div><div className="panel-footer">Delta token bukan bukti profit. Native SOL/rent, route tidak didukung dan data owner yang tidak lengkap tetap UNKNOWN. Semua candidate memerlukan pemeriksaan independen.</div></section>}
  {view==='paper'&&<AutomaticPaper halted={halted} csrf={csrf} onTrace={traceDecision}/>}
  {['setup','settings/integrations'].includes(view)&&<SetupPanel view={view}/>}
  {view==='wallets'&&<WalletPanel csrf={csrf}/>}
  {['positions','trades','analytics'].includes(view)&&<LedgerPanel view={view} onTrace={traceDecision}/>}
  {view==='rules'&&snapshot&&<ResearchPanel csrf={csrf} halted={halted} onRefresh={refresh} onTrace={traceDecision}/>}
  {(view==='overview'||view==='agents')&&<section className="panel"><div className="section-heading"><div><p className="eyebrow">DECISION PIPELINE / DETERMINISTIC</p><h2>Agent council</h2></div><span className="muted">{snapshot?.agents.length ? 'RULE ENGINE · AUDITED STAGES' : '11 ROLE CONTRACTS · NOT_RUN'}</span></div><div className="agent-grid">{roles.map((role,i)=>{const event=snapshot?.agents.find(a=>a.role===role.replace(' ','_'))?.payload;return <details className="agent" key={role}><summary><span className="agent-number">{String(i).padStart(2,'0')}</span><b>{role}</b><small className={event?.output.state==='VETO'?'warning':''}>{event?.output.state ?? 'NOT_RUN'}</small></summary><p>{event ? event.mint.slice(0,6)+'… · '+event.durationMs.toFixed(2)+'ms' : 'Belum ada stage event'}</p>{event&&<p className="break-address">{event.output.reasons.join(' · ')}<br/>{time(event.createdAt)} WIB<br/>Decision {event.decisionId}</p>}{event&&<button className="trace-button" onClick={()=>traceDecision(event.decisionId)}>Lihat trace</button>}</details>;})}</div><div className="panel-footer">Stage di atas berasal dari evaluasi worker yang tersimpan atomik. UNKNOWN dan veto tetap menghasilkan SKIP; tanpa izin signing atau percakapan AI buatan.</div></section>}
  {(view==='overview'||view==='risk'||view==='wallets')&&<div className="lower-grid"><section className="panel"><div className="section-heading"><div><p className="eyebrow">INFRASTRUCTURE</p><h2>Provider health</h2></div><span className="mini-badge">OBSERVE</span></div><div className="providers"><div data-testid="worker-heartbeat"><b>Worker heartbeat / component progress</b><span>{worker?.state??"UNKNOWN"} · {receiptFreshness(worker?.observed_at??null,now,15000)}</span><small>Collector {receiptFreshness(worker?.progress.marketAt??null,now,120000)} · paper loop {receiptFreshness(worker?.progress.paperAt??null,now,120000)}. A live process does not grant execution authority.</small></div>{providers.map(p=><div key={p.provider}><b>{p.provider}</b><span className={p.status==='OK'&&receiptFreshness(p.last_data_at,now)==='FRESH'&&receiptFreshness(p.observed_at,now)==='FRESH'?'healthy':'warning'}>transport {p.transport_status??'UNKNOWN'} · data {receiptFreshness(p.last_data_at,now)}</span><small>{age(p.observed_at,now)} · {p.reason ?? 'Health observation'} · transport {p.transport_status??'UNKNOWN'} · response {p.response_quality??'UNKNOWN'} · data {receiptFreshness(p.last_data_at??null,now)} · subscription {p.subscription_state??'UNKNOWN'}</small></div>)}{!providers.length&&<p>UNAVAILABLE — tidak ada health record.</p>}</div></section><section className="panel guard-panel"><div className="section-heading"><div><p className="eyebrow">OWNER BOUNDARY</p><h2>{view==='wallets'?'Wallet connection':'Risk guard'}</h2></div><span className="mini-badge">SIGNER LOCKED</span></div><strong>NO EXECUTION AUTHORITY</strong><p>MODE_NOT_LIVE · ZERO_CAPS<br/>OWNER_ACTIVATION_MISSING</p><dl><dt>Main Phantom</dt><dd>VERIFY IN WALLETS</dd><dt>Trading wallet</dt><dd>NOT_CONFIGURED</dd><dt>Fee reserve</dt><dd>UNKNOWN</dd></dl><p className="muted">Verifikasi Phantom tersedia pada halaman Wallets. Deposit dan withdrawal tetap manual; jangan masukkan recovery phrase.</p></section></div>}
  {(view==='overview'||view==='audit')&&<section className="panel"><div className="section-heading"><div><p className="eyebrow">PERSISTED EVENT STREAM</p><h2>Audit activity</h2></div><span className="muted">POSTGRESQL → SSE</span></div><div className="audit-list">{snapshot?.events.slice(0,view==='audit'?50:6).map(e=><button key={e.sequence} onClick={()=>setSelected(e)} className="audit-row"><time>{time(e.recorded_at)}</time><span>{e.type.replaceAll('_',' ')}</span><small>#{e.sequence} ↗</small></button>)}{!snapshot?.events.length&&<div className="empty">Belum ada event tersimpan.</div>}</div></section>}
  {selected&&<section className="panel event-detail" aria-label="Detail audit"><div className="section-heading"><h2>Event #{selected.sequence}</h2><button onClick={()=>setSelected(null)}>Tutup</button></div><pre>{JSON.stringify(selected,null,2)}</pre></section>}
  <footer className="system-footer"><span>SIGNER DISABLED · LIVE TRADING DISABLED</span><span>NOT_LIVE_VERIFIED · {snapshot?time(snapshot.recordedAt):'UNAVAILABLE'} WIB</span></footer></main></div></div>;
}
