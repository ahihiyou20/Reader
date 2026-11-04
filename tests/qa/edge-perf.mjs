// frame_p95_ms metric on real hardware. Headless Chromium in WSL has no GPU, so blur and glass are
// emulated on the CPU and frame timing there says nothing about devices. This serves out/ on port 4174,
// runs tests/qa/edge-perf-probe.mjs with Windows node (installed Edge on the Windows GPU), writes
// test-results/qa/edge-perf.json and prints the worst gesture p95 in ms. It prints 9999 (fail) when the
// probe cannot run, a gesture has a long task over 50 ms, or the rotation has one over 80 ms.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const server = spawn('node', ['scripts/serve.mjs', 'out'], { cwd: root, env: { ...process.env, PORT: '4174' }, stdio: 'ignore' });
const fail = (why) => {
  server.kill();
  console.error(`edge-perf: ${why}`);
  console.log(9999);
  process.exit(0);
};
await new Promise((r) => setTimeout(r, 1200));
try {
  const probe = `\\\\wsl.localhost\\Ubuntu${path.join(root, 'tests/qa/edge-perf-probe.mjs').replaceAll('/', '\\')}`;
  const r = spawnSync('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-Command', `node '${probe}' http://localhost:4174/`], { encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '').replace(/\r/g, '');
  let flows;
  try {
    flows = JSON.parse(out).filter((f) => f.name);
  } catch {
    fail(`probe output unreadable: ${(r.stderr || out).slice(0, 300)}`);
  }
  fs.mkdirSync(path.join(root, 'test-results/qa'), { recursive: true });
  fs.writeFileSync(path.join(root, 'test-results/qa/edge-perf.json'), JSON.stringify(flows, null, 2));
  const rotation = flows.find((f) => f.name.startsWith('rotation'));
  const gestures = flows.filter((f) => f !== rotation);
  if (!rotation || gestures.length < 4) fail('missing flows');
  if (gestures.some((f) => f.maxLongTask > 50)) fail('gesture long task over 50 ms');
  if (rotation.maxLongTask > 80) fail('rotation long task over 80 ms');
  console.log(Math.max(...gestures.map((f) => f.p95)));
} finally {
  server.kill();
}
