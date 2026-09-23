#!/usr/bin/env node

const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportsRoot = path.join(root, 'reports');
const effectiveBaseUrl = (process.env.BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

function utcRunName(timestamp) {
  return timestamp.replace(/[:.]/g, '-');
}

function gitRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function layerFor(testFilePath) {
  const normalizedPath = String(testFilePath ?? '').replace(/\\/g, '/');
  const match = normalizedPath.match(/(?:^|\/)tests\/(smoke|functional|negative-boundary|lifecycle|unit)\//);
  return match ? match[1] : 'other';
}

function testName(assertion) {
  return [...(assertion.ancestorTitles ?? []), assertion.title].filter(Boolean).join(' > ');
}

function normaliseJestResult(jestResult, metadata) {
  const tests = (jestResult.testResults ?? []).flatMap((suite) =>
    (suite.assertionResults ?? []).map((assertion) => {
      const result = {
        name: testName(assertion),
        layer: layerFor(suite.testFilePath ?? suite.name),
        status: assertion.status,
        durationMs: assertion.duration ?? 0,
      };
      if (assertion.status === 'failed' && assertion.failureMessages?.length) {
        result.failureEvidence = assertion.failureMessages.join('\n');
      }
      return result;
    }),
  );

  return {
    schemaVersion: 1,
    timestamp: metadata.timestamp,
    baseUrl: metadata.baseUrl,
    nodeVersion: metadata.nodeVersion,
    gitRevision: metadata.gitRevision,
    summary: {
      total: jestResult.numTotalTests ?? tests.length,
      passed: jestResult.numPassedTests ?? tests.filter((test) => test.status === 'passed').length,
      failed: jestResult.numFailedTests ?? tests.filter((test) => test.status === 'failed').length,
      pending: jestResult.numPendingTests ?? tests.filter((test) => test.status === 'pending').length,
    },
    tests,
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function renderHtmlReport(report) {
  const embeddedReport = JSON.stringify(report).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Test Report</title><style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif;background:#f6f7fb;color:#182033}body{margin:0;padding:32px;max-width:1180px;margin:auto}header{display:flex;justify-content:space-between;gap:16px;align-items:start}h1{margin:0;font-size:28px}.meta{color:#5d6472;font-size:14px;margin-top:6px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.card,.layer-section{padding:16px;border-radius:10px;background:#fff;box-shadow:0 1px 3px #1d2d5018}.number{font-size:30px;font-weight:700}.passed{color:#07884d}.failed{color:#c53636}.pending{color:#a06a00}.toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}input,select,button{padding:9px;border:1px solid #cbd1dc;border-radius:7px;background:#fff;color:#182033}.layer-section{margin:12px 0;padding:0;overflow:hidden}.layer-section>summary{cursor:pointer;padding:15px 16px;font-weight:700;display:flex;justify-content:space-between}.layer-section>summary .counts{font-weight:500;font-size:13px}.layer-table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #e4e7ed;font-size:14px}th{background:#eef1f6}tr.failed-row{background:#fff5f5}.badge{font-weight:700;font-size:12px;padding:3px 8px;border-radius:99px}.badge.passed{background:#dcf6e8}.badge.failed{background:#ffe0e0}.badge.pending{background:#fff0c7}details{max-width:680px}pre{white-space:pre-wrap;word-break:break-word;background:#141821;color:#e6edf3;padding:12px;border-radius:7px;font-size:12px}.links a{margin-left:12px}@media(max-width:650px){body{padding:18px}.cards{grid-template-columns:repeat(2,1fr)}header{display:block}.links a{margin-left:0;margin-right:12px}}
</style></head><body><header><div><h1>API Test Report</h1><div id="meta" class="meta"></div></div><div class="links"><a href="results.json">results.json</a><a href="junit.xml">junit.xml</a><a href="../../DEFECT_REPORT.md">defect report</a></div></header><section class="cards" id="cards"></section><div class="toolbar"><input id="search" placeholder="Search tests or failures"><select id="status"><option value="all">All statuses</option><option value="failed">Failed</option><option value="passed">Passed</option><option value="pending">Pending</option></select><button id="expand">Expand all</button><button id="collapse">Collapse all</button></div><main id="layers"></main><script>
const report=${embeddedReport};const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelector('#meta').textContent=\`Run: \${new Date(report.timestamp).toLocaleString()} · \${report.baseUrl} · \${report.nodeVersion}\`;
const cards=[['Total',report.summary.total,''],['Passed',report.summary.passed,'passed'],['Failed',report.summary.failed,'failed'],['Pending',report.summary.pending,'pending']];document.querySelector('#cards').innerHTML=cards.map(([l,n,c])=>\`<div class="card"><div>\${l}</div><div class="number \${c}">\${n}</div></div>\`).join('');
const titleFor={smoke:'Smoke',functional:'Functional','negative-boundary':'Negative & boundary',lifecycle:'Lifecycle',unit:'Unit'};const row=t=>\`<tr class="\${t.status==='failed'?'failed-row':''}"><td><span class="badge \${t.status}">\${esc(t.status)}</span></td><td>\${esc(t.name)}</td><td>\${t.durationMs} ms</td><td>\${t.failureEvidence?\`<details><summary>View failure</summary><pre>\${esc(t.failureEvidence)}</pre></details>\`:''}</td></tr>\`;const render=()=>{const q=document.querySelector('#search').value.toLowerCase(),s=document.querySelector('#status').value;const filtered=report.tests.filter(t=>(s==='all'||t.status===s)&&((t.name+' '+(t.failureEvidence||'')).toLowerCase().includes(q)));const groups=filtered.reduce((acc,t)=>((acc[t.layer]??=[]).push(t),acc),{});document.querySelector('#layers').innerHTML=Object.entries(groups).map(([name,tests])=>{const failed=tests.filter(t=>t.status==='failed').length;return \`<details class="layer-section" data-layer="\${esc(name)}" \${failed?'open':''}><summary><span>\${esc(titleFor[name]||name)}</span><span class="counts">\${tests.length} tests · \${failed} failed</span></summary><table class="layer-table"><thead><tr><th>Status</th><th>Test</th><th>Duration</th><th>Evidence</th></tr></thead><tbody>\${tests.map(row).join('')}</tbody></table></details>\`}).join('')||'<p>No matching tests.</p>'};document.querySelector('#search').oninput=render;document.querySelector('#status').onchange=render;document.querySelector('#expand').onclick=()=>document.querySelectorAll('.layer-section').forEach(x=>x.open=true);document.querySelector('#collapse').onclick=()=>document.querySelectorAll('.layer-section').forEach(x=>x.open=false);render();
</script></body></html>`;
}

function readJestResult(filePath, error) {
  if (existsSync(filePath)) {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      // Use the fallback below when Jest did not finish a valid JSON result.
    }
  }
  return {
    numTotalTests: 0,
    numPassedTests: 0,
    numFailedTests: 1,
    numPendingTests: 0,
    testResults: [{
      testFilePath: 'jest',
      assertionResults: [{
        ancestorTitles: ['Jest execution'],
        title: 'produced no readable JSON result',
        status: 'failed',
        duration: 0,
        failureMessages: [error ?? 'Jest produced no readable JSON result.'],
      }],
    }],
  };
}

function main() {
  const timestamp = new Date().toISOString();
  const runDirectory = path.join(reportsRoot, 'runs', utcRunName(timestamp));
  const latestDirectory = path.join(reportsRoot, 'latest');
  const rawResultPath = path.join(reportsRoot, `.jest-result-${process.pid}.json`);
  const metadata = {
    timestamp,
    baseUrl: effectiveBaseUrl,
    nodeVersion: process.version,
    gitRevision: gitRevision(),
  };

  mkdirSync(runDirectory, { recursive: true });
  mkdirSync(latestDirectory, { recursive: true });
  rmSync(rawResultPath, { force: true });

  const jestBin = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
  const child = spawnSync(process.execPath, [jestBin, '--runInBand', '--json', '--outputFile', rawResultPath, ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  const fallbackError = child.error?.message ?? (child.status === null ? `Jest exited via signal ${child.signal ?? 'unknown'}.` : undefined);
  const normalized = normaliseJestResult(readJestResult(rawResultPath, fallbackError), metadata);

  for (const directory of [latestDirectory, runDirectory]) {
    writeJson(path.join(directory, 'results.json'), normalized);
    writeJson(path.join(directory, 'run-metadata.json'), metadata);
    writeFileSync(path.join(directory, 'index.html'), renderHtmlReport(normalized));
  }

  const latestJunit = path.join(latestDirectory, 'junit.xml');
  if (existsSync(latestJunit)) copyFileSync(latestJunit, path.join(runDirectory, 'junit.xml'));
  rmSync(rawResultPath, { force: true });
  process.exit(child.status ?? 1);
}

module.exports = { layerFor, normaliseJestResult, renderHtmlReport, utcRunName };

if (require.main === module) main();
