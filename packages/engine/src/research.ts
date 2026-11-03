import { z } from 'zod';
import { address,baseUnits } from '../../domain/src/index.js';
const positive=baseUnits.refine(v=>BigInt(v)>0n);
const bps=z.number().int().min(0).max(10000);
export const researchPolicy=z.strictObject({version:z.string().min(1).max(40),
  minLiquidityUsd:z.number().finite().positive(),minVolume5mUsd:z.number().finite().nonnegative(),
  entryVolumeRatio:z.number().finite().positive(),marketMaxAgeMs:z.number().int().positive().max(300000),
  chainMaxAgeMs:z.number().int().positive().max(300000),quoteMaxAgeMs:z.number().int().positive().max(60000),
  maxPositionLamports:positive,maxExposureLamports:positive,reserveLamports:baseUnits,
  maxDailyLossLamports:positive,maxDailyFeesLamports:positive,maxSlippageBps:bps,maxPriceImpactBps:bps,
  maxOpenPositions:z.number().int().positive().max(100),maxTradesPerHour:z.number().int().positive().max(1000),
  exitFractionBps:z.number().int().min(1).max(10000).optional(),cooldownMs:z.number().int().nonnegative(),takeProfitBps:bps,stopLossBps:bps,maxHoldMs:z.number().int().positive(),
}).refine(p=>BigInt(p.maxPositionLamports)<=BigInt(p.maxExposureLamports),'POSITION_EXCEEDS_EXPOSURE');
export const chainEvidence=z.strictObject({mint:address,slot:baseUnits,verifiedAt:z.string().datetime(),hash:z.string().regex(/^[a-f0-9]{64}$/),commitment:z.literal('finalized')});
export const researchQuote=z.strictObject({inputMint:address,outputMint:address,inputAmount:positive,outputAmount:positive,feeLamports:baseUnits,poolHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),expiresAt:z.string().datetime().optional(),receivedAt:z.string().datetime(),hash:z.string().regex(/^[a-f0-9]{64}$/),fillable:z.boolean(),slippageBps:bps,priceImpactBps:bps});
export const researchAccount=z.strictObject({exposureLamports:baseUnits,reservedLamports:baseUnits,dailyLossLamports:baseUnits,dailyFeesLamports:baseUnits,openPositions:z.number().int().nonnegative(),tradesLastHour:z.number().int().nonnegative(),lastTradeAt:z.string().datetime().nullable()});
export const researchPosition=z.strictObject({exitCostLamports:baseUnits.optional(),mint:address,quantity:positive,costLamports:positive,openedAt:z.string().datetime()});
export const WSOL='So11111111111111111111111111111111111111112';
export const fresh=(at:string,now:number,ttl:number)=>{const age=now-Date.parse(at);return age>=0&&age<=ttl;};
export const poolEvidence=z.object({genesis:address.nullable().optional(),reasons:z.array(z.string().max(100)).max(20).optional(),revisionHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),revisionReviewId:z.uuid().optional(),mint:address,pool:address,slot:baseUnits.nullable(),verifiedAt:z.string().datetime(),hash:z.string().regex(/^[a-f0-9]{64}$/),assessment:z.enum(['PASS','VETO','UNKNOWN']),exitSafe:z.boolean()});
export const transferEvidence=z.object({mint:address,slot:baseUnits,verifiedAt:z.string().datetime(),hash:z.string().regex(/^[a-f0-9]{64}$/),transferSafe:z.boolean()});
