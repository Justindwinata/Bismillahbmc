import { it,expect } from 'vitest';
import { execFileSync } from 'node:child_process';
it('optimized export scan preserves exact secret detection, including overlapping hex windows and nonhex credentials',()=>{
 const result=execFileSync('python3',['-c',`import runpy,json
Matcher=runpy.run_path('scripts/export-safety.py')['SecretMatcher']
fixture='1'*64
m=Matcher([fixture,'fixture-nonhex-token:secret','',None])
print(json.dumps([m.contains(fixture.encode()),m.contains(('a'+fixture+'b').encode()),m.contains(('f'*64).encode()),m.contains(b'prefix fixture-nonhex-token:secret suffix'),Matcher([]).contains(fixture.encode()),Matcher(['fixture-only']).contains(b'fixture-only')]))`]).toString();
 expect(JSON.parse(result)).toEqual([true,true,false,true,false,true]);
});
