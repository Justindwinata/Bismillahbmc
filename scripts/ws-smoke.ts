import { startReadSubscriptions } from '../packages/connectors/src/websocket.js';
import { validateBootstrap } from './runtime.js';
validateBootstrap();
await new Promise<void>(resolve=>{
  let completed=false;
  const finish=(ok:boolean,slot:string|null)=>{if(completed)return;completed=true;clearTimeout(timeout);stop();console.log(JSON.stringify({status:ok?'OBSERVED':'BLOCKED',kind:'WS_PROCESSED_SLOT_NOT_FINALITY',slot,receivedAt:new Date().toISOString()}));if(!ok)process.exitCode=1;resolve();};
  const timeout=setTimeout(()=>finish(false,null),10000);
  const stop=startReadSubscriptions(process.env.SOLANA_RPC_WS_URL || 'wss://api.mainnet-beta.solana.com',[],e=>finish(true,e.slot),()=>{});
});
