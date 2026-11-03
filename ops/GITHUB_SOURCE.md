# GitHub source publication

The public repository contains source, lockfile, configuration templates, migrations, tests, requirements/runbooks and the small source-bound readiness attestations. Raw browser traces/screenshots, local authentication files, databases, encrypted backups, dependencies, builds and generated audit ZIPs are not uploaded. Historical local development/audit commits are retained locally, separately from the curated GitHub history. Some historical status links therefore refer to local audit evidence, not files published on GitHub.

Run `python3 ops/publish-source.py` from a clean committed checkout to prepare a filtered source commit. Review `git diff --stat origin/main codex/github-source` when a remote main exists, then run `python3 ops/publish-source.py --push` to publish. This uses a normal fast-forward push to the explicitly configured repository; it does not push local audit history or force-replace remote commits. Do not push the historical development branch directly to main.

Fresh-clone setup and separate QA database commands are in DEVELOPMENT.md. Raw audit evidence and actual runtime databases are local-only. Readiness remains RELEASE_NOT_QUALIFIED; publishing source does not qualify trading or enable signing.
