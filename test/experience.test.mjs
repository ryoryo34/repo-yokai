import test from 'node:test';
import assert from 'node:assert/strict';
import { createReport, compareSnapshots } from '../dist/report.js';
import { renderHtml, escapeHtml } from '../dist/html.js';

const coverage = { scope: [], limitations: [], filesDiscovered: 0, filesParsed: 0, edgesResolved: 0, incomplete: false, notices: [] };
const snapshot = (files, edges) => ({ files, edges, analysisCoverage: coverage });
const edge = (from, to, line = 1) => ({ from, to, line, specifier: `./${to}` });
const empty = snapshot([], []);

test('HTML groups lifecycle states with stable permalinks without changing JSON or input order', async () => {
  const report = await createReport('fixtures/demo/base', 'fixtures/demo/head');
  const original = JSON.stringify(report);
  const html = renderHtml(report);
  const grouped = ['new', 'continuing', 'resolved'].flatMap(status => report.findings.filter(f => f.status === status));
  assert.deepEqual([...html.matchAll(/<article id="([^"]+)"/g)].map(m => m[1]), grouped.map(f => `finding-${f.key}`));
  for (const status of ['new', 'continuing', 'resolved']) {
    assert.ok(html.includes(`href="#status-${status}"`));
    assert.ok(html.includes(`id="status-${status}"`));
  }
  assert.equal(renderHtml({ ...report, findings: [...report.findings].reverse() }), html);
  assert.equal(JSON.stringify(report), original);
  for (const finding of report.findings) {
    const article = html.split(`<article id="finding-${finding.key}"`)[1].split('</article>')[0];
    const snapshots = [...article.matchAll(/<details class="evidence" (open)?><summary>(base|head)/g)];
    assert.equal(snapshots[0][2], finding.status === 'resolved' ? 'base' : 'head');
    assert.equal(snapshots[0][1], 'open');
    assert.equal(snapshots[1][1], undefined);
    assert.match(article, /<details class="finding-meta"><summary>/);
    if (finding.files.length === 1) assert.match(article, /自分自身を指すimport\/export/);
    if (finding.status === 'continuing') assert.match(article, /baseとheadの根拠を開いて/);
    if (finding.status === 'resolved') assert.match(article, /安全や完全な修正を保証するものではありません/);
  }
});

test('branched SCC and duplicate imports draw only real edges for each snapshot', () => {
  const files = ['a.ts', 'b.ts', 'c.ts'];
  const base = [edge('a.ts', 'b.ts'), edge('b.ts', 'a.ts'), edge('a.ts', 'c.ts', 2), edge('c.ts', 'a.ts')];
  const head = [...base, edge('a.ts', 'b.ts', 3), edge('b.ts', 'c.ts', 2)];
  const report = compareSnapshots(snapshot(files, base), snapshot(files, head));
  const html = renderHtml(report);
  for (const [name, edges] of Object.entries({base, head})) {
    const section = html.split(`<summary>${name} ·`)[1].split('</details>')[0];
    assert.equal((section.match(/<g data-edge-index=/g) ?? []).length, edges.length);
    edges.forEach((e, index) => {
      const row = section.split(`<g data-edge-index="${index}">`)[1].split('</g>')[0];
      assert.ok(row.includes(`<title>${escapeHtml(`${e.from}:${e.line} → ${e.to} (${e.specifier})`)}</title>`));
      assert.ok(row.includes(`>${files.indexOf(e.from) + 1}</text>`));
      assert.ok(row.includes(`>${files.indexOf(e.to) + 1}</text>`));
    });
  }
  assert.doesNotMatch(html, /<script|<link|<img|<iframe|<use|@import|url\(/i);
  assert.match(html, /default-src 'none'/);
});

test('diagram limits omit rather than truncate a large SCC, while retaining all text evidence', () => {
  for (const count of [8, 9]) {
    const files = Array.from({length: count}, (_, i) => `file-${i}.ts`);
    const edges = files.map((file, i) => edge(file, files[(i+1)%count]));
    const html = renderHtml(compareSnapshots(empty, snapshot(files, edges)));
    assert.equal(html.includes('<svg'), count === 8);
    if (count === 9) assert.match(html, /8ファイル・12エッジ/);
    for (const e of edges) assert.ok(html.includes(`<code>${e.from}:${e.line}</code>`));
  }
  for (const count of [12, 13]) {
    const edges = Array.from({length:count}, (_, i) => edge('self.ts', 'self.ts', i+1));
    const html = renderHtml(compareSnapshots(empty, snapshot(['self.ts'], edges)));
    assert.equal(html.includes('<svg'), count === 12);
    assert.ok(html.includes(`<code>self.ts:${count}</code>`));
  }
});

test('long and hostile names stay complete and escaped in SVG and text; resolved uncertainty stays local', () => {
  const name = 'nested/'.repeat(30) + '<svg onload="bad()">&.ts';
  const before = snapshot([name], [edge(name, name)]);
  const after = {...empty, analysisCoverage: {...coverage, incomplete:true, notices:[{kind:'error',file:name,line:1,message:'Parse error <script>'}]}};
  const html = renderHtml(compareSnapshots(before, after));
  assert.ok(html.includes(escapeHtml(name)));
  assert.doesNotMatch(html, /<svg onload|<script>/);
  assert.match(html, /一部未解析 \/ Partial coverage/);
  const card = html.split('<article')[1].split('</article>')[0];
  assert.match(card, /この状態は暫定的な結果/);
  assert.match(card, /base · 1 edges/);
  assert.match(card, /headの解析グラフで未検出/);
  assert.match(card, /ファイル集合の変更や解析対象の欠落でも解消/);
});
