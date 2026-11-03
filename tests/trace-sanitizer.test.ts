import { it,expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
it('trace sanitizer discovers foreign-run cookie/CSRF while preserving ordinary receipt hashes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sentinel-trace-redaction-test-')),credentials=Array.from({length:3},()=>randomBytes(32).toString('hex'));
 try{
  execFileSync('python3',['-c',`import json,zipfile,sys
with zipfile.ZipFile(sys.argv[1]+'/test.zip','w') as z:z.writestr('network.trace',json.dumps({'cookie':'sentinel_session='+sys.argv[2],'csrfToken':sys.argv[3],'headers':[{'name':'x-csrf-token','value':sys.argv[4]}],'receiptHash':'c'*64}))`,dir,...credentials]);
  execFileSync('python3',['scripts/sanitize-traces.py',dir]);
  const out=execFileSync('python3',['-c',"import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read('network.trace').decode())",join(dir,'test.zip')]).toString();
  for(const value of credentials)expect(out).not.toContain(value);expect(out).toContain('c'.repeat(64));expect(out).toContain('REDACTED_LOCAL_SESSION');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
