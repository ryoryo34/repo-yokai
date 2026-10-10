export interface Evidence { from: string; to: string; line: number; specifier: string }
export interface CoverageNotice { kind: 'excluded' | 'unsupported' | 'unresolved' | 'blocked' | 'error'; file: string; line?: number; message: string }
export interface AnalysisCoverage {
  scope: string[];
  limitations: string[];
  filesDiscovered: number;
  filesParsed: number;
  edgesResolved: number;
  incomplete: boolean;
  notices: CoverageNotice[];
}
export interface Snapshot { files: string[]; edges: Evidence[]; analysisCoverage: AnalysisCoverage }
export interface Finding {
  ruleId: 'circular-dependency';
  key: string;
  status: 'new' | 'continuing' | 'resolved';
  message: string;
  files: string[];
  evidence: { base: Evidence[]; head: Evidence[] };
  analysisCoverage: { base: AnalysisCoverage; head: AnalysisCoverage };
}
export interface Rule { id: Finding['ruleId']; detect(snapshot: Snapshot): { key: string; files: string[]; evidence: Evidence[] }[] }
export interface Report {
  schemaVersion: 1;
  comparison?: { mode: 'git'; baseSha: string; headSha: string };
  warning: string;
  comparisonPolicy: string;
  findings: Finding[];
  analysisCoverage: { base: AnalysisCoverage; head: AnalysisCoverage };
}
