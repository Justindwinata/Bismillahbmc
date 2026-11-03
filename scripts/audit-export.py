"""Create a local sanitized source/evidence archive. Never uploads or reads wallet material."""
from pathlib import Path
import subprocess,json,hashlib,zipfile,runpy
root=Path.cwd()
secrets=[]
for name in ['.tmp/local-auth.json','.tmp/e2e-redact.json']:
    p=Path(name)
    if p.exists():
        value=json.loads(p.read_text())
        secrets.extend(value.values() if isinstance(value,dict) else value)
matcher=runpy.run_path(str(Path(__file__).with_name('export-safety.py')))['SecretMatcher'](secrets)
paths=[Path(name) for name in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0') if name]
paths=[p for p in paths if p.is_file() and not any(part in {'.git','.tmp','node_modules','AUDIT_EXPORT','coverage','coverage-packages','dist','.next'} for part in p.parts)]
manifest={}
for p in paths:
    data=p.read_bytes()
    assert not matcher.contains(data), 'Local credential detected in export input: '+str(p)
    if p.suffix=='.zip':
        with zipfile.ZipFile(p) as trace:
            for name in trace.namelist():
                block=trace.read(name)
                assert not matcher.contains(block),'Local credential in trace: '+str(p)
    manifest[str(p)]=hashlib.sha256(data).hexdigest()
output=Path('AUDIT_EXPORT');output.mkdir(exist_ok=True)
head=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip()
state=subprocess.check_output(['git','status','--short']).decode()
(output/'MANIFEST.json').write_text(json.dumps({'sourceCommit':head,'gitStatusAtExport':state,'files':manifest},indent=2)+'\n')
(output/'GIT_LOG.txt').write_text(subprocess.check_output(['git','log','-5','--oneline']).decode())
with zipfile.ZipFile(output/'solana-sentinel-source-evidence.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for p in paths:archive.write(p)
    archive.write(output/'MANIFEST.json','EXPORT_MANIFEST.json');archive.write(output/'GIT_LOG.txt','EXPORT_GIT_LOG.txt')
print('Local sanitized export created; '+str(len(paths))+' source/evidence files; no .env, keys, DB dumps or dependencies. No upload.')
