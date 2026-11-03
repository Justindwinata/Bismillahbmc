import {randomUUID} from 'node:crypto';
import {swapFixture,WSOL} from '../../scripts/fixtures/harness-swap.js';
import {keyBytes,keyString,UPGRADE_LOADER,CPMM_PROGRAM,CPMM_AUTHORITY} from '../../packages/connectors/src/pool-security.js';
import {hash,TOKEN} from '../../packages/execution/src/verifier.js';
import {JUPITER} from '../../packages/execution/src/swap-verifier.js';
import {MAINNET_GENESIS} from '../../packages/execution/src/rpc-context.js';
export function proofFixture(mutate?:(keys:string[],accounts:{owner:string;executable:boolean;lamports:number;data:[string,'base64']}[])=>void,payer?:string){
 const f=swapFixture(payer),clock=f.context.now,keys=[keyString(Buffer.alloc(32,91)),keyString(Buffer.alloc(32,92))],programs=keys.map(address=>{const b=Buffer.alloc(36);b.writeUInt32LE(2);keyBytes(address).copy(b,4);return b;}),data=keys.map((_,i)=>{const b=Buffer.alloc(53,i+1);b.writeUInt32LE(3);b.writeBigUInt64LE(50n,4);b[12]=0;return b;});
 const pins={jupiter:{codeHash:hash(data[0]!.subarray(45)),reviewId:randomUUID()},cpmm:{codeHash:hash(data[1]!.subarray(45)),reviewId:randomUUID()}};const intent={...f.intent,mode:'MAINNET' as const,genesis:MAINNET_GENESIS,maxFee:'10000',instructions:[{...f.swap,programPins:pins}]};
 const account=(owner:string,b:Buffer,executable=false,lamports=10000)=>({owner,executable,lamports,data:[b.toString('base64'),'base64'] as [string,'base64']});let reviews=0,now=clock;
 const review=async(program:string,codeHash:string)=>{reviews++;const p=program===JUPITER?pins.jupiter:program===CPMM_PROGRAM?pins.cpmm:null;return p?.codeHash===codeHash?p.reviewId:null;};
 const rpc={read:async(method:string,params:unknown[]=[])=>{
 if(method==='getGenesisHash')return MAINNET_GENESIS;if(method==='isBlockhashValid')return {context:{slot:100},value:true};if(method==='getFeeForMessage')return {context:{slot:100},value:5000};if(method==='getAccountInfo')return {context:{slot:100},value:{owner:'11111111111111111111111111111111',executable:false,lamports:100000}};
 if(method!=='getMultipleAccounts')throw new Error('UNEXPECTED_RPC_METHOD');const requested=params[0] as string[];if(requested.length===2)return {context:{slot:100},value:programs.map(b=>account(UPGRADE_LOADER,b,true))};
 const tokens=[f.swap.source,f.swap.destination,f.swap.vaultIn,f.swap.vaultOut].map((key,i)=>{const p=f.context.tokenAccounts[key]!,b=Buffer.alloc(165);keyBytes(p.mint).copy(b,0);keyBytes(i<2?intent.payer:CPMM_AUTHORITY).copy(b,32);b.writeBigUInt64LE(BigInt(p.amount),64);b[108]=1;if(p.mint===WSOL){b.writeUInt32LE(1,109);b.writeBigUInt64LE(2n,113);}return account(TOKEN,b,false,Number(BigInt(p.amount)+2n));});
 const mints=[f.swap.mint,f.swap.outputMint].map(m=>{const b=Buffer.alloc(82);b[44]=m===WSOL?9:6;b[45]=1;return account(TOKEN,b);});const value=[account(CPMM_PROGRAM,f.context.poolAccounts![f.swap.pool]!.data),account(UPGRADE_LOADER,programs[0]!,true),account(UPGRADE_LOADER,programs[1]!,true),account(UPGRADE_LOADER,data[0]!),account(UPGRADE_LOADER,data[1]!),...tokens,...mints];mutate?.(requested,value);return {context:{slot:100},value};}};
 return {...f,intent,pins,rpc,review,reviews:()=>reviews,now:()=>now,setNow:(n:number)=>now=n};
}
