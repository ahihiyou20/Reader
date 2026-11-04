import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const metricName = (process.argv[2] || '').trim();

function fail(name, reason) {
  console.error(`Metric [${name}] failed: ${reason}`);
  if (name && (name.includes('interaction') || name.includes('coverage'))) {
    console.log(0);
  } else {
    console.log(9999);
  }
  process.exit(0);
}

if (!metricName) {
  console.error('Usage: node tests/qa/metric.mjs <metric-name>');
  console.log(9999);
  process.exit(1);
}

function getIndexMtime() {
  const indexPath = path.resolve(process.cwd(), 'out/index.html');
  if (!fs.existsSync(indexPath)) {
    fail(metricName, 'out/index.html does not exist');
  }
  return fs.statSync(indexPath).mtimeMs;
}

function checkFreshness(filePath, indexMtime) {
  if (!fs.existsSync(filePath)) {
    fail(metricName, `${filePath} does not exist`);
  }
  const fileMtime = fs.statSync(filePath).mtimeMs;
  if (fileMtime < indexMtime) {
    fail(metricName, 'stale');
  }
}

switch (metricName) {
  case 'first-load-js':
  case 'first_load_js':
  case 'first_load_js_kb': {
    const indexPath = path.resolve(process.cwd(), 'out/index.html');
    if (!fs.existsSync(indexPath)) {
      fail(metricName, 'out/index.html does not exist');
    }
    try {
      const html = fs.readFileSync(indexPath, 'utf8');
      const matches = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)];
      let totalBytes = 0;
      for (const m of matches) {
        const src = m[1].replace(/^\//, '');
        const filePath = path.join(process.cwd(), 'out', src);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath);
          const gz = zlib.gzipSync(content, { level: 9 });
          totalBytes += gz.length;
        } else {
          console.error(`Warning: Script not found on disk: ${filePath}`);
        }
      }
      const kb = (totalBytes / 1024).toFixed(1);
      console.log(kb);
    } catch (e) {
      fail(metricName, e.message);
    }
    break;
  }

  case 'interaction-coverage':
  case 'interaction_coverage':
  case 'interaction_coverage_pct': {
    const indexMtime = getIndexMtime();
    const filePath = path.resolve(process.cwd(), 'test-results/qa/interactions.json');
    checkFreshness(filePath, indexMtime);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (typeof data.total !== 'number' || !Number.isFinite(data.total) || data.total < 50) {
        fail(metricName, `interactions.json total (${data?.total}) must be >= 50`);
      }
      const val = data.pct ?? data.interaction_coverage_pct;
      if (typeof val === 'number' && Number.isFinite(val)) {
        console.log(val);
      } else {
        fail(metricName, 'Missing pct in interactions.json');
      }
    } catch (e) {
      fail(metricName, e.message);
    }
    break;
  }

  case 'frame-p95':
  case 'frame_p95':
  case 'frame_p95_ms': {
    const indexMtime = getIndexMtime();
    const filePath = path.resolve(process.cwd(), 'test-results/qa/perf.json');
    checkFreshness(filePath, indexMtime);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.flows) || data.flows.length === 0) {
        fail(metricName, 'flows array is missing or empty in perf.json');
      }
      for (const flow of data.flows) {
        if (typeof flow.p95 !== 'number' || !Number.isFinite(flow.p95) || flow.p95 <= 0) {
          fail(metricName, `Invalid flow p95 in flow "${flow?.name}": ${flow?.p95}`);
        }
      }
      if (typeof data.p95 === 'number' && Number.isFinite(data.p95) && data.p95 > 0) {
        console.log(data.p95);
      } else {
        fail(metricName, 'Missing or non-positive p95 in perf.json');
      }
    } catch (e) {
      fail(metricName, e.message);
    }
    break;
  }

  case 'rotation-wrong-frames':
  case 'rotation_wrong_frames': {
    const indexMtime = getIndexMtime();
    let totalWrongFrames = 0;
    for (let i = 1; i <= 5; i++) {
      const filePath = path.resolve(process.cwd(), `test-results/qa/rotation/scenario-${i}.json`);
      checkFreshness(filePath, indexMtime);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data.wrongFrames !== 'number' || !Number.isFinite(data.wrongFrames)) {
          fail(metricName, `Missing or invalid wrongFrames in scenario-${i}.json`);
        }
        totalWrongFrames += data.wrongFrames;
      } catch (e) {
        fail(metricName, e.message);
      }
    }
    console.log(totalWrongFrames);
    break;
  }

  default: {
    fail(metricName, `Unknown metric name: ${metricName}`);
  }
}
