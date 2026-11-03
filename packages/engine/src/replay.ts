// Explicit regression replay. Never a LIVE_PROVIDER or LIVE_CHAIN observation.
import { researchPolicy,WSOL } from './research.js';
export const replayPolicy=researchPolicy.parse({version:'REPLAY-research-v1',minLiquidityUsd:10000,minVolume5mUsd:100,entryVolumeRatio:2,marketMaxAgeMs:90000,chainMaxAgeMs:90000,quoteMaxAgeMs:10000,maxPositionLamports:'100',maxExposureLamports:'300',reserveLamports:'20',maxDailyLossLamports:'150',maxDailyFeesLamports:'20',maxSlippageBps:100,maxPriceImpactBps:100,maxOpenPositions:2,maxTradesPerHour:5,cooldownMs:0,takeProfitBps:1000,stopLossBps:500,maxHoldMs:60000});
export function replayInput(scenario:'BUY'|'SELL'|'MISSING_SECURITY'|'STALE_QUOTE',now=Date.now()){
  const at=new Date(now).toISOString();
  const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  return {mint,sourceId:'REPLAY:REGRESSION:'+scenario,sourceHash:'a'.repeat(64),receivedAt:at,sourceAt:null,mode:'PAPER' as const,inputDataClass:'REPLAY' as const,
    market:{liquidityUsd:100000,volume5mUsd:1000,volume24hUsd:10000},
    security:scenario==='MISSING_SECURITY'?null:{mintAuthority:null,freezeAuthority:null,tokenProgram:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',extensions:[],holderOwnershipVerified:true},
    chainEvidence:{mint,slot:'1',verifiedAt:at,hash:'b'.repeat(64),commitment:'finalized' as const},
    poolEvidence:{mint,pool:mint,slot:'1',verifiedAt:at,hash:'d'.repeat(64),assessment:'PASS' as const,exitSafe:true},transferEvidence:{mint,slot:'1',verifiedAt:at,hash:'b'.repeat(64),transferSafe:true},
    quote:{poolHash:'d'.repeat(64),inputMint:scenario==='SELL'?mint:WSOL,outputMint:scenario==='SELL'?WSOL:mint,inputAmount:scenario==='SELL'?'10':'100',outputAmount:scenario==='SELL'?'120':'10',feeLamports:'2',receivedAt:new Date(now-(scenario==='STALE_QUOTE'?20000:0)).toISOString(),hash:'c'.repeat(64),fillable:true,slippageBps:50,priceImpactBps:20},
    balanceLamports:'1000',requestedSide:scenario==='SELL'?'SELL' as const:'BUY' as const};
}
