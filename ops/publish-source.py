"""Publish a curated source snapshot without uploading local audit/runtime Git history.
Default prepares a local commit only. --push explicitly publishes to the configured origin.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, runpy, subprocess, tempfile

ROOT = Path(__file__).resolve().parent.parent
TARGET = 'https://github.com/Justindwinata/Bismillahbmc.git'
DIRS = {'apps', 'packages', 'scripts', 'ops', 'config', 'tests', 'e2e', 'docs', 'references', '.github'}
ROOT_FILES = {'.env.example', '.gitignore', '.node-version', '.npmrc', 'package.json',
              'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.build.json',
              'eslint.config.js', 'vitest.config.ts', 'vitest.packages.config.ts',
              'playwright.config.ts', 'NEXT_ACTIONS.json'}

def git(*args, env=None, data=None):
    return subprocess.check_output(['git', *args], cwd=ROOT, env=env, input=data).decode().strip()

def selected_files():
    tracked = git('ls-files', '-z').split('\0')
    selected = {p for p in tracked if p and (Path(p).parts[0] in DIRS or
                p in ROOT_FILES or ('/' not in p and p.endswith('.md')))}
    # Readiness needs the actual source-bound attestations, not screenshots or raw traces.
    manifest = json.loads((ROOT / 'evidence/software-gates.json').read_text())
    selected.add('evidence/software-gates.json')
    for proof in manifest['proofs']:
        for source in proof['sources']:
            if source not in selected:
                raise RuntimeError('Missing gate source: ' + source)
        for artifact in proof['artifacts']:
            p = artifact['path']
            if not p.startswith('evidence/') or not p.endswith('.json') or '..' in Path(p).parts:
                raise RuntimeError('Unsafe attestation path')
            if hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != artifact['sha256']:
                raise RuntimeError('Attestation hash mismatch')
            selected.add(p)
    return sorted(selected)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--push', action='store_true')
    args = parser.parse_args()
    if git('status', '--porcelain'):
        raise RuntimeError('Commit reviewed changes before preparing source snapshot')
    if git('remote', 'get-url', 'origin') != TARGET:
        raise RuntimeError('Origin does not match explicitly authorized repository')
    subprocess.run(['python3', 'scripts/secret-scan.py'], cwd=ROOT, check=True)
    values = []
    # Exact local credential comparison; values never appear in output or Git objects.
    for path in (ROOT / '.tmp').glob('local-auth*.json'):
        values.extend(v for v in json.loads(path.read_text()).values() if isinstance(v, str))
    redact = ROOT / '.tmp/e2e-redact.json'
    if redact.exists():
        value = json.loads(redact.read_text())
        values.extend(value.values() if isinstance(value, dict) else value)
    matcher = runpy.run_path(str(ROOT / 'scripts/export-safety.py'))['SecretMatcher'](values)
    selected = selected_files()
    for name in selected:
        path = ROOT / name
        if path.is_symlink() or path.stat().st_size > 5 * 1024 * 1024:
            raise RuntimeError('Unexpected source type/size: ' + name)
        if any(p in {'.git', '.tmp', 'node_modules', 'dist', 'secrets', '.secrets'} or
               p.startswith('.next') for p in path.relative_to(ROOT).parts):
            raise RuntimeError('Runtime/build path selected: ' + name)
        if matcher.contains(path.read_bytes()):
            raise RuntimeError('Local credential detected in: ' + name)
    remote = git('ls-remote', 'origin', 'refs/heads/main')
    parent = []
    if remote:
        expected = remote.split()[0]
        subprocess.run(['git', 'fetch', '--no-tags', 'origin', 'main'], cwd=ROOT, check=True)
        if git('rev-parse', 'FETCH_HEAD') != expected:
            raise RuntimeError('Remote changed; review and retry')
        parent = ['-p', expected]
    with tempfile.TemporaryDirectory(prefix='sentinel-source-index-') as directory:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(directory) / 'index'))
        git('read-tree', '--empty', env=env)
        subprocess.run(['git', 'update-index', '--add', '-z', '--stdin'], cwd=ROOT, env=env,
                       input=('\0'.join(selected) + '\0').encode(), check=True)
        tree = git('write-tree', env=env)
        source = git('rev-parse', 'HEAD')
        message = f'Publish curated Solana Sentinel source\n\nLocal development checkpoint: {source}\nRaw audit, runtime databases, secrets, caches and generated exports excluded.\n'
        commit = git('commit-tree', tree, *parent, data=message.encode())
    git('update-ref', 'refs/heads/codex/github-source', commit)
    result = {'sourceCommit': source, 'publishedCommit': commit, 'files': len(selected),
              'bytes': sum((ROOT / p).stat().st_size for p in selected), 'pushed': False}
    if args.push:
        # Normal fast-forward push only; never overwrite another remote history.
        subprocess.run(['git', 'push', 'origin', commit + ':refs/heads/main'], cwd=ROOT, check=True)
        if git('ls-remote', 'origin', 'refs/heads/main').split()[0] != commit:
            raise RuntimeError('Remote verification failed')
        result['pushed'] = True
    (ROOT / '.tmp').mkdir(mode=0o700, exist_ok=True)
    (ROOT / '.tmp/github-source-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
