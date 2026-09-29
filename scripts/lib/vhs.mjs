import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const probeRun = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });

export function findVhs({ run = probeRun, env = process.env, home = os.homedir() } = {}) {
  const onPath = run('vhs', ['--version']);
  if (!onPath.error && onPath.status === 0) return 'vhs';
  const data = env.CLAUDE_PLUGIN_DATA || env.POWER_PRESENTATION_DATA;
  const candidates = data ? [path.join(data, 'toolchain', 'bin', 'vhs')] : [];
  const scan = path.join(home, '.claude', 'plugins', 'data');
  if (fs.existsSync(scan)) for (const d of fs.readdirSync(scan)) if (d.startsWith('power-presentation')) candidates.push(path.join(scan, d, 'toolchain', 'bin', 'vhs'));
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    const probe = run(c, ['--version']);
    if (!probe.error && probe.status === 0) return c;
  }
  return null;
}

export const CHROME_SANDBOX_RE = /SUID sandbox helper binary was found, but is not configured correctly|No usable sandbox|setuid_sandbox_host|Failed to move to new namespace|zygote_host_impl_linux/i;

export function chromeSandboxFailure(text) {
  return CHROME_SANDBOX_RE.test(String(text ?? ''));
}

export function runVhs(vhs, tape, { cwd, env = process.env, timeoutMs = 300000, spawn = spawnSync } = {}) {
  const once = (e) => spawn(vhs, [tape], { cwd, env: e, encoding: 'utf8', timeout: timeoutMs });
  const first = once(env);
  const text = `${first.stderr ?? ''}\n${first.stdout ?? ''}`;
  if (first.status === 0 || env.VHS_NO_SANDBOX || !chromeSandboxFailure(text)) return { ...first, noSandbox: Boolean(env.VHS_NO_SANDBOX), sandboxError: null };
  const sandboxError = (text.match(/[^\n]*(?:sandbox|namespace)[^\n]*/i)?.[0] ?? '').trim().slice(0, 240);
  return { ...once({ ...env, VHS_NO_SANDBOX: 'true' }), noSandbox: true, sandboxError };
}
