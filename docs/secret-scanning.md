# Secret scanning

GitHub Actions runs the `Secret scan` check on every push, pull request,
merge queue update, and manual dispatch. Gitleaks 8.24.2 scans all reachable
Git history with its built-in rules, returns failure on findings, and redacts
secret values from logs. There are no path exclusions or historical baselines.
The CLI runs without a Gitleaks Action license or paid service.

## Required merge gate

After the workflow is pushed and has run, configure a GitHub branch ruleset
or branch protection for every merge destination (including the default branch):
require pull requests and require the status check named `Secret scan`, sourced
from GitHub Actions. Require branches to be up to date, and prevent bypasses.
The workflow alone cannot enforce merge protection; repository settings must
require the check. Do not configure path filters or `continue-on-error`.

## Before commit (optional local setup)

Install Go and pre-commit, then run `pre-commit install` in each repository.
The checked-in configuration installs the pinned native Gitleaks hook and scans
the staged diff before each commit. On Windows, use a shell with Go and Git
available on PATH. Existing hooks must be preserved when installing.
CI remains mandatory even when a local hook is skipped or not installed.

For a manual full-history check with Gitleaks installed:

```sh
gitleaks git --redact=100 --exit-code=1 --log-opts="--all" .
```

## Local secret files

Keep credentials in ignored `.env`, `.env.*`, `.dev.vars`, `.dev.vars.*`,
`secrets/`, or private key files. Commit only secret-free `.env.example` or
`.env.*.example` templates. Context Lens also tracks `.env.pilot` as public
build configuration; never put credentials there or in any `VITE_*` value
that is bundled into the client. Ignore rules do not untrack existing files.

If a real credential is found, revoke or rotate it first, remove it from tracked
files while retaining any needed local copy, and resolve affected history before
merging. Do not add a real key to an allowlist. Review false positives individually;
any exception must target only a demonstrably synthetic fixture and be reviewed.
