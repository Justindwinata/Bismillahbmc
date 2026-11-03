import {createReadStream,createWriteStream} from 'node:fs';
import {open} from 'node:fs/promises';
import {randomBytes,pbkdf2Sync,createCipheriv,createDecipheriv} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const v1=Buffer.from('SENTINEL_BACKUP_V1\n'),v2=Buffer.from('SENTINEL_BACKUP_V2\n'),headerSize=v2.length+44;
const max=2*1024*1024*1024;
/** Bounded-memory encrypted output. File is exclusively created and remains private until caller atomically publishes it. */
export async function sealBackupStream(source:Readable,path:string,password:Buffer){
 if(password.length<32)throw new Error('BACKUP_PASSPHRASE');
 const handle=await open(path,'wx',0o600),salt=randomBytes(16),iv=randomBytes(12),key=pbkdf2Sync(password,salt,600000,32,'sha256');
 try{await handle.write(Buffer.concat([v2,salt,iv,Buffer.alloc(16)]),0,headerSize,0);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(v2);let size=0;const bound=new Transform({transform(chunk:Buffer,_encoding,done){size+=chunk.length;done(size>max?new Error('BACKUP_SIZE_LIMIT'):null,chunk);}});
  await pipeline(source,bound,cipher,createWriteStream(path,{fd:handle.fd,autoClose:false,start:headerSize}));await handle.write(cipher.getAuthTag(),0,16,v2.length+28);await handle.sync();
 }finally{key.fill(0);await handle.close();}
}
/** Two passes on one pinned file descriptor: authenticate before spawning any restore consumer. No plaintext file. */
export async function withVerifiedBackup<T>(path:string,password:Buffer,consume:(source:Readable)=>Promise<T>){
 if(password.length<32)throw new Error('BACKUP_PASSPHRASE');
 const handle=await open(path,'r');let key:Buffer|undefined;
 try{const before=await handle.stat();if(!before.isFile()||before.size<headerSize||before.size>max+headerSize)throw new Error('BACKUP_FORMAT_OR_SIZE');const header=Buffer.alloc(headerSize);if((await handle.read(header,0,headerSize,0)).bytesRead!==headerSize)throw new Error('BACKUP_HEADER_INCOMPLETE');const magic=header.subarray(0,v2.length);if(!magic.equals(v1)&&!magic.equals(v2))throw new Error('BACKUP_FORMAT');key=pbkdf2Sync(password,header.subarray(v2.length,v2.length+16),600000,32,'sha256');
  const decrypt=()=>{const decipher=createDecipheriv('aes-256-gcm',key!,header.subarray(v2.length+16,v2.length+28));decipher.setAAD(magic);decipher.setAuthTag(header.subarray(v2.length+28));return decipher;};
  const chunks=()=>before.size===headerSize?Readable.from([]):createReadStream(path,{fd:handle.fd,autoClose:false,start:headerSize,end:before.size-1,highWaterMark:65536});
  try{const verifier=decrypt();for await(const chunk of chunks())verifier.update(chunk as Buffer);verifier.final();}catch{throw new Error('BACKUP_AUTHENTICATION_FAILED');}
  const after=await handle.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw new Error('BACKUP_CHANGED_DURING_VERIFICATION');
  const plaintext=Readable.from((async function*(){const decipher=decrypt();try{for await(const chunk of chunks())yield decipher.update(chunk as Buffer);yield decipher.final();}catch{throw new Error('BACKUP_AUTHENTICATION_FAILED');}})());
  try{return await consume(plaintext);}finally{plaintext.destroy();}
 }finally{key?.fill(0);await handle.close();}
}
