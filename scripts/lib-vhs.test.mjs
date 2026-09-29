import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeSandboxFailure, runVhs } from './lib/vhs.mjs';

const SUID = 'could not launch browser: [launcher] Failed to get the debug url: [171600:171600:0927/154047.196214:FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I\'m aborting now.';

test('chromeSandboxFailure(): the SUID-helper and namespace refusals, nothing else', () => {
  assert.equal(chromeSandboxFailure(SUID), true);
  assert.equal(chromeSandboxFailure('No usable sandbox! Update your kernel'), true);
  assert.equal(chromeSandboxFailure('ttyd: command not found'), false);
  assert.equal(chromeSandboxFailure(''), false);
});

test('runVhs(): one retry with VHS_NO_SANDBOX=true on a sandbox refusal, reported; other failures returned as they are', () => {
  const calls = [];
  const fake = (results) => (cmd, args, opts) => { calls.push(opts.env.VHS_NO_SANDBOX ?? null); return results.shift(); };
  let r = runVhs('vhs', 't.tape', { env: {}, spawn: fake([{ status: 1, stderr: SUID, stdout: '' }, { status: 0, stderr: '', stdout: '' }]) });
  assert.deepEqual(calls, [null, 'true']);
  assert.equal(r.status, 0); assert.equal(r.noSandbox, true); assert.match(r.sandboxError, /SUID sandbox helper/);
  calls.length = 0;
  r = runVhs('vhs', 't.tape', { env: {}, spawn: fake([{ status: 1, stderr: 'ttyd: command not found', stdout: '' }]) });
  assert.deepEqual(calls, [null]); assert.equal(r.status, 1); assert.equal(r.noSandbox, false); assert.equal(r.sandboxError, null);
  calls.length = 0;
  r = runVhs('vhs', 't.tape', { env: { VHS_NO_SANDBOX: 'true' }, spawn: fake([{ status: 1, stderr: SUID, stdout: '' }]) });
  assert.deepEqual(calls, ['true']); assert.equal(r.noSandbox, true);
});
