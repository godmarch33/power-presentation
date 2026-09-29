import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ID = 'power-presentation';

export const DATA_DIR_CANDIDATES = [PLUGIN_ID, `${PLUGIN_ID}-inline`];

export function pluginRoot(env = process.env) {
  const fromEnv = env.CLAUDE_PLUGIN_ROOT;
  if (fromEnv && fromEnv.trim() !== '') return path.resolve(fromEnv);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function pluginData(env = process.env, home = os.homedir()) {
  for (const key of ['CLAUDE_PLUGIN_DATA', 'POWER_PRESENTATION_DATA']) {
    const v = env[key];
    if (v && v.trim() !== '') return path.resolve(v);
  }
  const base = path.join(home, '.claude', 'plugins', 'data');
  let names = [...DATA_DIR_CANDIDATES];
  try {
    for (const n of fs.readdirSync(base)) {
      if (n.startsWith(`${PLUGIN_ID}-`) && !names.includes(n)) names.push(n);
    }
  } catch { }
  for (const n of names) {
    if (fs.existsSync(path.join(base, n, 'toolchain', 'toolchain.json'))) return path.join(base, n);
  }
  return path.join(base, PLUGIN_ID);
}

export function toolchainDir(env = process.env, home = os.homedir()) {
  return path.join(pluginData(env, home), 'toolchain');
}

export function vendorDir(env = process.env) {
  return path.join(pluginRoot(env), 'vendor');
}

export function userSkillsDir(env = process.env, home = os.homedir()) {
  const cfg = env.CLAUDE_CONFIG_DIR;
  const claudeHome = cfg && cfg.trim() !== '' ? path.resolve(cfg) : path.join(home, '.claude');
  return path.join(claudeHome, 'skills');
}

export function projectRoot(env = process.env, cwd = process.cwd()) {
  const fromEnv = env.CLAUDE_PROJECT_DIR;
  if (fromEnv && fromEnv.trim() !== '') return path.resolve(fromEnv);
  return path.resolve(cwd);
}
