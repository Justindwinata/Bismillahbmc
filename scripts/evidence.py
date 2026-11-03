"""Run one command, retaining exact output and exit code without environment values."""
from pathlib import Path
from datetime import datetime, timezone
import subprocess, sys, json, hashlib
folder, label, *command = sys.argv[1:]
root = Path(folder); root.mkdir(parents=True, exist_ok=True)
started = datetime.now(timezone.utc).isoformat()
result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
log = root / (label + '-' + datetime.now(timezone.utc).strftime('%H%M%S%f') + '.txt'); log.write_text(result.stdout)
entry = dict(command=command, started_utc=started, ended_utc=datetime.now(timezone.utc).isoformat(), exit_code=result.returncode, output=str(log), output_sha256=hashlib.sha256(log.read_bytes()).hexdigest())
with (root/'commands.jsonl').open('a') as file: file.write(json.dumps(entry)+'\n')
print(result.stdout)
print('EXIT_CODE='+str(result.returncode))
sys.exit(result.returncode)
