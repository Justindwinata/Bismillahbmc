import { createPublicKey,verify } from 'node:crypto';
import { address } from '../../../packages/domain/src/index.js';
export function publicKeyBytes(value:string):Buffer{
 address.parse(value);const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of value)n=n*58n+BigInt(alphabet.indexOf(c));const bytes=Buffer.alloc(32);for(let i=31;i>=0;i--){bytes[i]=Number(n&255n);n>>=8n;}return bytes;
}
export function verifyWalletMessage(wallet:string,message:string,signature:string):boolean{
 try{if(!/^[a-f0-9]{128}$/.test(signature))return false;const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),publicKeyBytes(wallet)]),format:'der',type:'spki'});return verify(null,Buffer.from(message,'utf8'),key,Buffer.from(signature,'hex'));}catch{return false;}
}
export function walletMessage(origin:string,wallet:string,nonce:string,id:string,issued:string,expires:string){
 const domain=new URL(origin).host;
 return `${domain} requests proof of your Solana wallet ownership:\n${wallet}\n\nSOLANA SENTINEL: read-only identity verification. No transaction, spending permission, deposit, withdrawal, or automated signing authorization.\n\nURI: ${origin}\nVersion: 1\nChain: solana:mainnet\nNonce: ${nonce}\nIssued At: ${issued}\nExpiration Time: ${expires}\nRequest ID: ${id}`;
}
