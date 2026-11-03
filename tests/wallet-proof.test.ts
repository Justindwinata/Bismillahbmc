import { generateKeyPairSync,sign } from 'node:crypto';
import { it,expect } from 'vitest';
import { publicKeyBytes,verifyWalletMessage,walletMessage } from '../apps/api/src/wallet-proof.js';
export function fixtureWallet(){const pair=generateKeyPairSync('ed25519');const raw=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let value=BigInt('0x'+raw.toString('hex')),encoded='';while(value){encoded=alphabet[Number(value%58n)]+encoded;value/=58n;}for(const byte of raw){if(byte!==0)break;encoded='1'+encoded;}return {address:encoded,sign:(message:string)=>sign(null,Buffer.from(message),pair.privateKey).toString('hex'),raw};}
it('Ed25519 proof binds exact message, address, domain, nonce and purpose',()=>{
 const wallet=fixtureWallet();const message=walletMessage('https://sentinel.example',wallet.address,'test-nonce','test-id','2026-11-01T00:00:00Z','2026-11-01T00:02:00Z');
 expect(publicKeyBytes(wallet.address)).toEqual(wallet.raw);expect(publicKeyBytes('11111111111111111111111111111111')).toEqual(Buffer.alloc(32));
 const signature=wallet.sign(message);expect(verifyWalletMessage(wallet.address,message,signature)).toBe(true);
 expect(message).toContain('sentinel.example requests proof');expect(message).toContain('READ'.toLowerCase()+'-only');
 for(const value of [message+' ',message.replace('sentinel.example','evil.example'),message.replace('test-nonce','other')])expect(verifyWalletMessage(wallet.address,value,signature)).toBe(false);
 expect(verifyWalletMessage(fixtureWallet().address,message,signature)).toBe(false);expect(verifyWalletMessage(wallet.address,message,'z'.repeat(128))).toBe(false);expect(verifyWalletMessage('invalid',message,signature)).toBe(false);
});
