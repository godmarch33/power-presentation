# Security policy

## Supported versions

`power-presentation` is pre-1.0: only the latest release on `main` receives fixes.

| Version | Supported |
|---|---|
| 0.3.x | yes |
| < 0.3 | no |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately through
[GitHub private vulnerability reporting](https://github.com/godmarch33/power-presentation/security/advisories/new)
(the **Security → Report a vulnerability** button on the repository). If that is not possible,
email **godmarch33@gmail.com** with `power-presentation security` in the subject.

Include what you can of: the affected version (`.claude-plugin/plugin.json`), the component
(a hook, a script, a skill or agent prompt), the steps or input that reproduce it, and the impact
you observed. You will get an acknowledgement within **5 working days** and a status update at
least every two weeks until the report is resolved. Fixed issues are disclosed through a GitHub
security advisory, crediting the reporter unless you ask otherwise.

## What is in scope

The plugin runs inside a user's Claude Code session and on their machine, so these are the
areas where a report matters most:

- **Secret or PII leaks into a video, caption, share copy or run report** — for example a capture
  that gets past the three-layer redaction and the tesseract + gitleaks gate (`scripts/record-flow.mjs`),
  or a path that sends data to the network under `--privacy local`.
- **Hooks** (`hooks/*.sh`) — anything that makes a hook run commands it should not, write outside
  `${CLAUDE_PLUGIN_DATA}` or the run workspace (`power-presentation-out/<name>/`), or install
  without the network manifest being shown first.
- **Toolchain installation** (`scripts/toolchain.mjs`) — pin bypasses, integrity problems or
  unsafe downloads.
- **Prompt injection through inspected content** — a repository, web page or document that makes
  the `/present` agents act outside the run workspace.

Out of scope: vulnerabilities in HyperFrames, Claude Code, Playwright, ffmpeg or other upstream
tools (report those upstream — see `THIRD_PARTY_NOTICES.md`), and findings that require an
already-compromised machine.
