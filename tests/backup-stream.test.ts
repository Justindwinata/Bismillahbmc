import {test,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createHash,randomBytes} from 'node:crypto';
import {sealBackupStream,withVerifiedBackup} from '../scripts/backup-stream.js';
import {sealBackup} from '../scripts/backup-crypto.js';
test('streaming encrypted backup exceeds old 50MiB cap with bounded chunks and exact restore digest',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sentinel-stream-')),path=join(dir,'archive.enc'),password=randomBytes(48),chunk=randomBytes(65536),expected=createHash('sha256');let total=0;
 try{await sealBackupStream(Readable.from((async function*(){for(let i=0;i<1025;i++){expected.update(chunk);yield chunk;}})()),path,password);expect((await stat(path)).mode&0o077).toBe(0);expect((await stat(path)).size).toBeGreaterThan(50*1024*1024);
  const actual=await withVerifiedBackup(path,password,async stream=>{const hash=createHash('sha256');for await(const data of stream){expect(data.length).toBeLessThanOrEqual(65536);total+=data.length;hash.update(data);}return hash.digest('hex');});expect(actual).toBe(expected.digest('hex'));expect(total).toBe(65536*1025);await expect(sealBackupStream(Readable.from(['overwrite']),path,password)).rejects.toThrow();
 }finally{password.fill(0);await rm(dir,{recursive:true,force:true});}
});
test('corruption/password/truncation fail before restore consumer runs; v1 compatibility and empty archive authenticate',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sentinel-stream-auth-')),path=join(dir,'archive.enc'),password=randomBytes(48),plain=Buffer.from('TEST_ONLY_NOT_A_DATABASE');let invoked:boolean;
 try{const consume=async(stream:Readable)=>{invoked=true;const parts=[];for await(const b of stream)parts.push(b);return Buffer.concat(parts);};await sealBackupStream(Readable.from([plain]),path,password);const valid=await readFile(path);expect(valid.includes(plain)).toBe(false);
  for(const index of [0,20,38,50,valid.length-1]){invoked=false;const altered=Buffer.from(valid);altered[index]=altered[index]!^1;await writeFile(path,altered);await expect(withVerifiedBackup(path,password,consume)).rejects.toThrow();expect(invoked).toBe(false);}
  await writeFile(path,valid.subarray(0,-1));await expect(withVerifiedBackup(path,password,consume)).rejects.toThrow();await writeFile(path,valid);invoked=false;await expect(withVerifiedBackup(path,randomBytes(48),consume)).rejects.toThrow('BACKUP_AUTHENTICATION_FAILED');expect(invoked).toBe(false);
  await writeFile(path,sealBackup(plain,password));expect(await withVerifiedBackup(path,password,consume)).toEqual(plain);await rm(path);await sealBackupStream(Readable.from([]),path,password);expect(await withVerifiedBackup(path,password,consume)).toEqual(Buffer.alloc(0));
 }finally{password.fill(0);await rm(dir,{recursive:true,force:true});}
});
