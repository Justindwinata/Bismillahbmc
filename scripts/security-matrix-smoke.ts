import { JupiterTokenFeed } from '../packages/connectors/src/jupiter-tokens.js';
import { MintSecurityReader,TOKEN_2022_PROGRAM } from '../packages/connectors/src/security.js';
import { WalletReadRpc } from '../packages/connectors/src/wallet.js';
import { validateBootstrap } from './runtime.js';
validateBootstrap();const tokens=await new JupiterTokenFeed().recent();const token=tokens.find(t=>t.tokenProgram===TOKEN_2022_PROGRAM);if(!token)throw new Error('NO_ACTUAL_TOKEN_2022_CANDIDATE');const result=await new MintSecurityReader(new WalletReadRpc(process.env.SOLANA_RPC_HTTP_URL??'https://api.mainnet-beta.solana.com')).screen(token.id,1000);console.log(JSON.stringify({source:'ACTUAL_PUBLIC_RPC_READ_ONLY',providerTokenId:token.id,providerUpdatedAt:token.updatedAt,result},null,2));if(result.slot===null)process.exitCode=1;
