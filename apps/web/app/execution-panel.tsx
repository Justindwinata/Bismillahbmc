'use client';
import { useEffect, useState } from 'react';
type Order = {
    id: string;
    state: string;
    reason: string | null;
    mode: string;
    correlation_id: string;
    signature: string | null;
};
export default function ExecutionPanel() {
    const [signing,setSigning]=useState<unknown>(null),[signingState,setSigningState]=useState('LOADING');
    const [receipts,setReceipts]=useState<unknown[]>([]),[receiptState,setReceiptState]=useState('LOADING');
    const [preflights,setPreflights]=useState<unknown[]>([]),[preflightState,setPreflightState]=useState('LOADING');
    const [orders, setOrders] = useState<Order[]>([]), [state, setState] = useState('LOADING'), [selected, setSelected] = useState(''), [detail, setDetail] = useState<unknown>(null);
    useEffect(() => { const abort = new AbortController(); let pending = false; const load = async () => { if (pending)
        return; pending = true; try {
        const response = await fetch('/api/v1/execution/orders', { cache: 'no-store', signal: abort.signal });
        if (!response.ok)
            throw new Error();
        const data = await response.json();
        if (!abort.signal.aborted) {
            setOrders(data.orders);
            try{const proofs=await fetch('/api/v1/execution/preflights',{cache:'no-store',signal:abort.signal});if(!proofs.ok)throw new Error('PROOF_LIST_UNAVAILABLE');const proofRows=await proofs.json();if(!abort.signal.aborted){setPreflights(proofRows);setPreflightState(proofRows.length?'AVAILABLE':'NO_EVIDENCE');}}catch{if(!abort.signal.aborted)setPreflightState('UNAVAILABLE / LAST EVIDENCE STALE');}try{const response=await fetch('/api/v1/execution/receipt-observations',{cache:'no-store',signal:abort.signal});if(!response.ok)throw new Error();const rows=await response.json();if(!abort.signal.aborted){setReceipts(rows);setReceiptState(rows.length?'AVAILABLE':'NO_EVIDENCE');}}catch{if(!abort.signal.aborted)setReceiptState('UNAVAILABLE / LAST EVIDENCE STALE');setSigningState('UNAVAILABLE / LAST EVIDENCE STALE');}try{const response=await fetch('/api/v1/execution/signing-status',{cache:'no-store',signal:abort.signal});if(!response.ok)throw new Error();const value=await response.json();if(!abort.signal.aborted){setSigning(value);setSigningState(value.status);}}catch{if(!abort.signal.aborted)setSigningState('UNAVAILABLE / LAST EVIDENCE STALE');}if(!abort.signal.aborted)setState('AVAILABLE');
        }
    }
    catch {
        if (!abort.signal.aborted)
            {setState('UNAVAILABLE / last snapshot stale');setPreflightState('UNAVAILABLE / LAST EVIDENCE STALE');setReceiptState('UNAVAILABLE / LAST EVIDENCE STALE');setSigningState('UNAVAILABLE / LAST EVIDENCE STALE');}
    }
    finally {
        pending = false;
    } }; void load(); const timer = setInterval(() => void load(), 5000); return () => { abort.abort(); clearInterval(timer); }; }, []);
    useEffect(() => { setDetail(null); if (!selected)
        return; const abort = new AbortController(); let pending = false; const load = async () => { if(pending)return;pending=true;try {
        const r = await fetch('/api/v1/execution/orders/' + selected, { cache: 'no-store', signal: abort.signal });
        if (!r.ok)
            throw new Error();
        const d = await r.json();
        if (!abort.signal.aborted)
            setDetail(d);
    }
    catch {
        if (!abort.signal.aborted)
            setDetail({ error: 'Order evidence UNAVAILABLE' });
    } finally { pending=false; } }; void load(); const timer = setInterval(() => void load(), 5000); return () => { abort.abort(); clearInterval(timer); }; }, [selected]);
    return <section className="panel"><div className="section-heading"><div><p className="eyebrow">HARNESS_NOT_CHAIN · MAINNET SIGNING DISABLED</p><h2>Execution qualification</h2></div></div><div className="research-body"><p>Native/SPL transfer and Jupiter RouteV2 single Raydium CP swap qualification harness, with existing SPL/WSOL accounts and zero rent changes. Mainnet executable revision qualification, production signer and real-chain swap settlement remain blocked. Harness receipts/signatures are not blockchain fills and do not enter PAPER/SHADOW or LIVE portfolio.</p><details><summary>Independent read-only swap preflight evidence</summary><p data-testid="swap-preflight-state">{preflightState}</p><p>Verification is not authorization, signature, submission or settlement. Missing executable review remains VETO.</p><pre tabIndex={0} aria-label="Swap preflight evidence JSON" data-testid="swap-preflight-evidence">{JSON.stringify(preflights,null,2)}</pre></details><details><summary>Finalized swap receipt observations</summary><p data-testid="swap-receipt-state">{receiptState}</p><p>Read-only receipt verification; no execution authority and no portfolio mutation. REPLAY_TEST is not blockchain settlement. Supported scope: single Raydium CP, existing SPL/WSOL accounts, zero rent change. ATA creation, wrap/close and other routes are rejected.</p><pre tabIndex={0} aria-label="Swap receipt observations JSON" data-testid="swap-receipt-evidence">{JSON.stringify(receipts,null,2)}</pre></details><details><summary>Independent signer policy and durable requests</summary><p data-testid="signing-state">{signingState}</p><p>Production signing remains disabled. The persisted journal below contains non-chain HARNESS requests only; signed identity is not a transaction submission or fill.</p><pre tabIndex={0} aria-label="Signer policy journal JSON" data-testid="signing-evidence">{JSON.stringify(signing,null,2)}</pre></details><p role="status" data-testid="execution-state">{state}</p><label htmlFor="execution-order">Persisted harness order</label><select id="execution-order" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select order evidence</option>{orders.map(o => <option key={o.id} value={o.id}>{o.mode} · {o.state} · {o.id}</option>)}</select>{!orders.length && state === 'AVAILABLE' && <p>No execution harness orders recorded. No chain submission claimed.</p>}{detail !== null && <details open><summary>Order → attempt → receipt → ledger audit</summary><pre tabIndex={0} aria-label="Selected order evidence JSON" data-testid="execution-detail">{JSON.stringify(detail, null, 2)}</pre></details>}</div></section>;
}
