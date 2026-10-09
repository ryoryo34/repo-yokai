import { createHash } from 'node:crypto';
import { analyze, compareText } from './analyze.js';
import type { Finding, Report, Rule, Snapshot } from './types.js';

// Iterative Kosaraju: each SCC is reported once, not once per simple cycle.
export const circularDependency: Rule = {
  id: 'circular-dependency',
  detect(snapshot: Snapshot) {
    const forward = new Map(snapshot.files.map(file => [file, new Set<string>()]));
    const reverse = new Map(snapshot.files.map(file => [file, new Set<string>()]));
    for (const edge of snapshot.edges) { forward.get(edge.from)!.add(edge.to); reverse.get(edge.to)!.add(edge.from); }
    const visited = new Set<string>();
    const order: string[] = [];
    for (const file of snapshot.files) {
      const stack: [string, boolean][] = [[file, false]];
      while (stack.length) {
        const [node, done] = stack.pop()!;
        if (done) { order.push(node); continue; }
        if (visited.has(node)) continue;
        visited.add(node); stack.push([node, true]);
        for (const next of forward.get(node)!) if (!visited.has(next)) stack.push([next, false]);
      }
    }
    visited.clear();
    const results = [];
    for (const file of order.reverse()) {
      if (visited.has(file)) continue;
      const files: string[] = [];
      const stack = [file];
      visited.add(file);
      while (stack.length) {
        const node = stack.pop()!; files.push(node);
        for (const next of reverse.get(node)!) if (!visited.has(next)) { visited.add(next); stack.push(next); }
      }
      if (files.length === 1 && !forward.get(file)!.has(file)) continue;
      files.sort(compareText);
      const members = new Set(files);
      results.push({ key: `circular-dependency:${createHash('sha256').update(JSON.stringify(files)).digest('hex')}`, files, evidence: snapshot.edges.filter(edge => members.has(edge.from) && members.has(edge.to)) });
    }
    return results.sort((a, b) => compareText(a.key, b.key));
  },
};
export async function createReport(baseDir: string, headDir: string): Promise<Report> {
  const base = await analyze(baseDir);
  const head = await analyze(headDir);
  const before = new Map(circularDependency.detect(base).map(item => [item.key, item]));
  const after = new Map(circularDependency.detect(head).map(item => [item.key, item]));
  const analysisCoverage = { base: base.analysisCoverage, head: head.analysisCoverage };
  const findings: Finding[] = [...new Set([...before.keys(), ...after.keys()])].sort(compareText).map(key => {
    const old = before.get(key); const current = after.get(key);
    const status = old ? current ? 'continuing' : 'resolved' : 'new';
    const files = (current ?? old)!.files;
    return { ruleId: circularDependency.id, key, status, message: `循環入道: ${files.length} file(s) form a strongly connected component.`, files, evidence: { base: old?.evidence ?? [], head: current?.evidence ?? [] }, analysisCoverage };
  });
  return {
    schemaVersion: 1,
    warning: '検出ゼロは安全保証ではありません。Zero findings do not guarantee safety. Results apply only to the analyzed graph; incomplete coverage can change any status, including resolved.',
    comparisonPolicy: 'Same normalized file set = continuing. A changed set = old resolved + new appeared. Type-only edges are included; runtime cycles are not asserted.',
    findings, analysisCoverage,
  };
}
