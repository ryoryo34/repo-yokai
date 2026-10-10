import type { Report } from './types.js';

// JSON exposes newlines/control characters; entities neutralize Markdown, HTML,
// autolinks and mentions. Bound individual fields and total listed evidence.
const text = (value: string): string => {
  const short = value.length > 300 ? value.slice(0, 300) + '… [truncated]' : value;
  return Array.from(JSON.stringify(short).slice(1, -1), char => /[\p{L}\p{N} ]/u.test(char) ? char : `&#${char.codePointAt(0)};`).join('');
};
const code = (value: string): string => `<code>${text(value)}</code>`;
export function renderMarkdown(report: Report): string {
  const counts = { new: 0, continuing: 0, resolved: 0 };
  for (const finding of report.findings) counts[finding.status]++;
  const lines = ['# Repo Yokai — 循環入道 / Junkan Nyudo', '', report.warning, '',
    '| New / 出現 | Continuing / 継続 | Resolved / 解消 |', '| --- | --- | --- |',
    `| ${counts.new} | ${counts.continuing} | ${counts.resolved} |`, '', text(report.comparisonPolicy), ''];
  if (report.comparison) lines.push(`Base SHA: ${code(report.comparison.baseSha)}`, '', `Head SHA: ${code(report.comparison.headSha)}`, '');
  else lines.push('Directory comparison (no commit SHA).', '');
  lines.push('## Coverage / 解析範囲', '');
  for (const label of ['base', 'head'] as const) {
    const coverage = report.analysisCoverage[label];
    lines.push(`### ${label}: ${coverage.incomplete ? 'PARTIAL / 一部未解析' : 'Complete within supported scope'}`, '',
      `${coverage.filesParsed}/${coverage.filesDiscovered} files parsed; ${coverage.edgesResolved} edges; ${coverage.notices.length} notices.`, '');
    for (const scope of coverage.scope) lines.push(`- Scope: ${text(scope)}`);
    for (const limit of coverage.limitations) lines.push(`- Limitation: ${text(limit)}`);
    for (const notice of coverage.notices.slice(0, 20)) lines.push(`- ${notice.kind}: ${code(notice.file)}${notice.line ? ':' + notice.line : ''} — ${text(notice.message)}`);
    if (coverage.notices.length > 20) lines.push(`- ${coverage.notices.length - 20} more notices in report.json / report.html.`);
    lines.push('');
  }
  lines.push('## Findings / 遭遇記録', '');
  if (!report.findings.length) lines.push('No cycles detected in the supported scope. Zero findings do not guarantee safety.', '');
  for (const finding of report.findings.slice(0, 20)) {
    lines.push(`### ${finding.status} — 循環入道 (${finding.files.length} files)`, '', code(finding.key), '');
    for (const label of ['base', 'head'] as const) {
      for (const edge of finding.evidence[label].slice(0, 8)) lines.push(`- ${label}: ${code(edge.from)}:${edge.line} → ${code(edge.to)} (specifier ${code(edge.specifier)})`);
      if (finding.evidence[label].length > 8) lines.push(`- ${label}: ${finding.evidence[label].length - 8} more edges in full reports.`);
    }
    lines.push('');
  }
  if (report.findings.length > 20) lines.push(`${report.findings.length - 20} more findings in full reports.`, '');
  lines.push('Summary lists up to 20 findings, 8 edges per snapshot/finding, and 20 notices per snapshot; fields longer than 300 characters are truncated. Download report.json and report.html for complete evidence.', '');
  return lines.join('\n');
}
