import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './paths.mjs';

export const HYPERFRAMES_PIN = '0.8.47';
export const HYPERFRAMES_RANGE = '0.8.x';
export const PLAYWRIGHT_PIN = '1.63.0';
export const GSAP_PIN = '3.14.2';
export const CHROME_HEADLESS_SHELL_BUILD = '152.0.7977.30';
export const FONT_PINS = Object.freeze({
  '@fontsource/inter': '5.3.0',
  '@fontsource/space-grotesk': '5.3.0',
  '@fontsource/eb-garamond': '5.3.0',
  '@fontsource/jetbrains-mono': '5.3.0',
  '@fontsource/playfair-display': '5.3.0',
  '@fontsource/source-serif-4': '5.3.0',
});
export const UPSTREAM_REPO = 'heygen-com/hyperframes';
export const VENDORED_WORKFLOW = 'product-launch-video';

export function upstreamTag(version = HYPERFRAMES_PIN) {
  return `v${String(version).replace(/^v/, '')}`;
}

export function readPluginVersion(root = pluginRoot()) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
    );
    return typeof manifest.version === 'string' && manifest.version.trim() !== ''
      ? manifest.version
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const PLUGIN_VERSION = readPluginVersion();

export function satisfiesRange(actual, range = HYPERFRAMES_RANGE) {
  if (typeof actual !== 'string') return false;
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(actual.trim());
  const r = /^(\d+)\.(\d+)\.x$/.exec(range);
  if (!m || !r) return false;
  return m[1] === r[1] && m[2] === r[2];
}
