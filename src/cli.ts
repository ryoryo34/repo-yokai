#!/usr/bin/env node
import { mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { assertNoSymlinks, inputRoot, isWithin } from './analyze.js';
import { createReport } from './report.js';
import { renderHtml } from './html.js';

const usage = 'Usage: repo-yokai --base-dir <directory> --head-dir <directory> --output-dir <directory>\nWrites report.json and report.html. Existing reports are never overwritten.\nExit codes: 0 = report complete within supported scope, 2 = incomplete coverage, 1 = fatal error.\nZero findings do not guarantee safety.';
try {
  const { values } = parseArgs({ options: { 'base-dir': { type: 'string' }, 'head-dir': { type: 'string' }, 'output-dir': { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) console.log(usage);
  else {
    if (!values['base-dir'] || !values['head-dir'] || !values['output-dir']) throw new Error(usage);
    const base = await inputRoot(values['base-dir']);
    const head = await inputRoot(values['head-dir']);
    const output = path.resolve(values['output-dir']);
    await assertNoSymlinks(output);
    if (isWithin(base, output) || isWithin(head, output) || isWithin(output, base) || isWithin(output, head)) throw new Error('Output directory must not overlap either input root.');
    const targets = ['report.json', 'report.html'].map(name => path.join(output, name));
    for (const target of targets) {
      try { await lstat(target); throw new Error('Report already exists. Choose a new output directory.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const report = await createReport(base, head);
    await mkdir(output, { recursive: true });
    await assertNoSymlinks(output);
    await writeFile(targets[0]!, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    await writeFile(targets[1]!, renderHtml(report), { flag: 'wx' });
    const counts = { new: 0, continuing: 0, resolved: 0 };
    for (const finding of report.findings) counts[finding.status]++;
    console.log(`循環入道: new=${counts.new}, continuing=${counts.continuing}, resolved=${counts.resolved}\nReports: ${output}\n${report.warning}`);
    if (report.analysisCoverage.base.incomplete || report.analysisCoverage.head.incomplete) process.exitCode = 2;
  }
} catch (error) {
  console.error(`repo-yokai: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 1;
}
