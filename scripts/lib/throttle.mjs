import fs from 'node:fs';
import path from 'node:path';

export const NICE_VAR = 'POWER_PRESENTATION_NICE';
export const CPUSET_VAR = 'POWER_PRESENTATION_CPUSET';

export const CPUSET_RE = /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;

const tasksetMemo = new Map();
export function hasTaskset(pathVar = process.env.PATH ?? '') {
  if (tasksetMemo.has(pathVar)) return tasksetMemo.get(pathVar);
  const found = pathVar.split(path.delimiter).some((dir) => {
    if (!dir) return false;
    try { fs.accessSync(path.join(dir, 'taskset'), fs.constants.X_OK); return true; } catch { return false; }
  });
  tasksetMemo.set(pathVar, found);
  return found;
}

export function throttleSpec(env = process.env, { platform = process.platform, tasksetAvailable = () => hasTaskset(process.env.PATH ?? '') } = {}) {
  const spec = { nice: null, cpuset: null, warnings: [] };
  const n = env[NICE_VAR];
  if (n !== undefined && String(n).trim() !== '') {
    const v = Number(String(n).trim());
    if (!Number.isInteger(v) || v < 0 || v > 19) spec.warnings.push(`${NICE_VAR}=${n} ignored (expected an integer 0..19)`);
    else if (platform === 'win32') spec.warnings.push(`${NICE_VAR} ignored on Windows (no nice)`);
    else spec.nice = v;
  }
  const c = env[CPUSET_VAR];
  if (c !== undefined && String(c).trim() !== '') {
    const list = String(c).trim();
    if (!CPUSET_RE.test(list)) spec.warnings.push(`${CPUSET_VAR}=${c} ignored (expected a cpu list such as 0-7,16-23)`);
    else if (platform !== 'linux') spec.warnings.push(`${CPUSET_VAR} ignored on ${platform} (taskset is Linux-only)`);
    else if (!tasksetAvailable()) spec.warnings.push(`${CPUSET_VAR} ignored: taskset is not on PATH (util-linux)`);
    else spec.cpuset = list;
  }
  return spec;
}

export function throttled(cmd, args, spec) {
  let c = cmd;
  let a = [...args];
  const applied = [];
  if (spec?.cpuset) { a = ['-c', spec.cpuset, c, ...a]; c = 'taskset'; applied.push(`taskset -c ${spec.cpuset}`); }
  if (spec?.nice !== null && spec?.nice !== undefined) { a = ['-n', String(spec.nice), c, ...a]; c = 'nice'; applied.push(`nice -n ${spec.nice}`); }
  return { cmd: c, args: a, applied };
}

export function describeThrottle(spec) {
  const parts = [];
  if (spec?.nice !== null && spec?.nice !== undefined) parts.push(`nice ${spec.nice}`);
  if (spec?.cpuset) parts.push(`cpus ${spec.cpuset}`);
  return parts.length ? parts.join(', ') : 'off';
}
