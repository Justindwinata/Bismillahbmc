"""Redact local ephemeral session credentials; keep trace structure and market evidence."""
from pathlib import Path
import json,zipfile,io,sys,re
manifest=Path('.tmp/e2e-redact.json')
manifest.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
secrets=json.loads(manifest.read_text()) if manifest.exists() else []
if not isinstance(secrets,list) or not all(isinstance(value,str) for value in secrets):
    raise ValueError('INVALID_LOCAL_REDACTION_MANIFEST')
for path in Path(sys.argv[1] if len(sys.argv)>1 else 'evidence/R1/browser').glob('*.zip'):
    with zipfile.ZipFile(path) as source:
        items=[]
        # Discover credentials in this archive too: concurrent browser runs may have
        # different cookie/CSRF sets even when their local manifest was replaced.
        for item in source.infolist():
            if item.filename.endswith(('.png','.jpg','.jpeg')): continue
            block=source.read(item.filename)
            patterns=[rb'sentinel_session=([a-f0-9]{64})',rb'"(?:csrfToken|csrf_token)"\s*:\s*"([a-f0-9]{64})"',rb'"name"\s*:\s*"x-csrf-token"\s*,\s*"value"\s*:\s*"([a-f0-9]{64})"']
            for pattern in patterns:
                for value in re.findall(pattern,block,re.IGNORECASE):
                    secret=value.decode('ascii')
                    if secret not in secrets: secrets.append(secret)
        for item in source.infolist():
            data=source.read(item.filename)
            if not item.filename.endswith(('.png','.jpg','.jpeg')):
                for value in secrets:
                    if value: data=data.replace(value.encode(),b'REDACTED_LOCAL_SESSION')
            items.append((item,data))
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as dest:
        for item,data in items:dest.writestr(item,data)
    path.write_bytes(buffer.getvalue())
    with zipfile.ZipFile(path) as check:
        for name in check.namelist():
            data=check.read(name)
            assert not any(value and value.encode() in data for value in secrets), 'Credential remains in trace'
Path('.tmp/e2e-redact.json').write_text(json.dumps(secrets))
Path('.tmp/e2e-redact.json').chmod(0o600)
print('Traces sanitized and checked against local ephemeral password/service/session/CSRF values.')
