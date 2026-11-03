import { setTimeout as pause } from 'node:timers/promises';
import { WalletReadRpc } from '../../../packages/connectors/src/wallet.js';
import { startReadSubscriptions } from '../../../packages/connectors/src/websocket.js';
import type { Store } from '../../../packages/storage/src/index.js';
export async function walletCycle(store:Store,rpc:WalletReadRpc){
  for(const wallet of await store.watchlists()){
    try{const window=await rpc.backfill(wallet.address,wallet.last_signature);await store.walletWindow(wallet.address,window.observations,window.cursor,window.initial,wallet.last_signature);await store.health('wallet-rpc','OK',null);}
    catch(error){const reason=error instanceof Error&&/^(BACKFILL_GAP_REQUIRES_REVIEW|BACKFILL_ORDER_DISAGREEMENT|FINALIZED_RECEIPT_UNAVAILABLE|FINALIZED_RECEIPT_INCOMPLETE|SIGNATURE_DISAGREEMENT|SLOT_DISAGREEMENT|RECEIPT_ERROR_DISAGREEMENT|RECEIPT_TIME_DISAGREEMENT|WALLET_CURSOR_CONFLICT|WALLET_RECEIPT_CONFLICT|UNSUPPORTED_TRANSACTION_VERSION|RPC_METHOD_UNSUPPORTED|RPC_DATA_UNAVAILABLE|RPC_NODE_UNHEALTHY|RPC_ERROR)$/.test(error.message)?error.message:'BACKFILL_OR_RECEIPT_UNVERIFIED';await store.health('wallet-rpc','DEGRADED',reason);}
  }
}
export async function monitorWallets(store:Store,httpUrl:string|undefined,wsUrl:string|undefined,signal:AbortSignal){
  const rpc=httpUrl?new WalletReadRpc(httpUrl):null;
  let stopSocket:(()=>void)|undefined;let key='';let dirty=true;let lastBackfill=0;let lastHealth=0;let lastStatus='';
  try{
    while(!signal.aborted){
      const wallets=await store.watchlists();const nextKey=wallets.map(w=>w.address).join(',');
      if(wsUrl&&(!stopSocket||nextKey!==key)){
        stopSocket?.();key=nextKey;
        stopSocket=startReadSubscriptions(wsUrl,wallets.map(w=>w.address),event=>{if(event.kind==='WALLET')dirty=true;},(status,reason)=>{
          const current=status+':'+reason;if(current!==lastStatus||Date.now()-lastHealth>10000){lastStatus=current;lastHealth=Date.now();if(status==='DEGRADED'||reason==='SUBSCRIPTIONS_ACKNOWLEDGED')dirty=true;void store.health('solana-ws',status,reason).catch(()=>{stopSocket?.();});}
        });
      }
      if(!wsUrl&&lastHealth===0){await store.health('solana-ws','NOT_CONFIGURED','WS_ENDPOINT_REQUIRED');lastHealth=Date.now();}
      if(rpc&&(dirty||Date.now()-lastBackfill>30000)){
        dirty=false;lastBackfill=Date.now();await walletCycle(store,rpc);
      }
      try{await pause(1000,undefined,{signal});}catch{break;}
    }
  }finally{stopSocket?.();}
}
