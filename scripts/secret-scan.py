"""Heuristic source scan. Does not prove absence of secrets or scan ignored local files."""
from pathlib import Path
import re, subprocess, sys
paths = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
patterns = [re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'), re.compile(r'\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}'), re.compile(r'(?:BS58_PRIVATE_KEY|PRIVATE_KEY|SEED_PHRASE)\s*=\s*[^\s#]{16,}')]
hits = []
for name in paths:
    p = Path(name)
    if not p.is_file() or p.suffix.lower() in {'.jpg','.png','.zip'}: continue
    text = p.read_text(errors='replace')
    if any(pattern.search(text) for pattern in patterns): hits.append(name)
if hits:
    print('Potential secret in: ' + ', '.join(hits)); sys.exit(1)
print('Source heuristic scan: no matching private-key/API-key patterns; ignored local secret files excluded.')
