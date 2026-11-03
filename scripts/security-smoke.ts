import { MintSecurityReader } from '../packages/connectors/src/security.js';
import { WalletReadRpc } from '../packages/connectors/src/wallet.js';
import { validateBootstrap } from './runtime.js';
validateBootstrap();
const reader=new MintSecurityReader(new WalletReadRpc('https://api.mainnet-beta.solana.com'));
const result=await reader.screen('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',1000);
console.log(JSON.stringify(result));
if(result.slot===null)process.exitCode=1;
