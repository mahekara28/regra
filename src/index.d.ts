export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type Case = { id?: string; name: string; args: JsonValue[] } & ({ expect: JsonValue; throws?: never } | { throws: string; expect?: never });
export interface Spec { project: string; entry: string; title: string; repro: Case; checks: Case[]; }
export type ScopedSpec = Omit<Spec, 'project'> & { project?: string };
export type VerificationStatus = 'verified' | 'rejected' | 'inconclusive';
export type Observation = { repeat: number; id: string } & ({ kind: 'return'; value: JsonValue } | { kind: 'throw'; name: string; message: string } | { kind: 'invalid'; detail: string });
export type CaseResult = Case & { id: string; valid: boolean; passes: number; repeats: number; stable: boolean; passed: boolean; observations: Observation[] };
export interface Gate { name: string; passed: boolean; detail: string; }
export interface Run {
  id: string; createdAt: string; status: VerificationStatus; summary: string; spec: Spec;
  before: string; after: string; beforeHash: string; afterHash: string;
  runtime: string; platform: string; repeats: number; memoryCount: number;
  beforeResults: CaseResult[]; afterResults: CaseResult[]; gates: Gate[]; lessonId?: string;
}
export interface Lesson extends Spec { id: string; createdAt: string; evidenceRun: string; beforeHash: string; afterHash: string; runtime: string; }
export interface CheckResult {
  project: string; entry: string; status: VerificationStatus; passed: boolean; canProceed: boolean;
  summary: string; results: CaseResult[]; sourceHash: string; runtime: string; repeats: number;
}
export interface LessonFilter { entry?: string; query?: string; limit?: number; }
export interface LessonPage { project: string; total: number; truncated: boolean; lessons: Lesson[]; }
export interface Context extends LessonPage { instructions: string; scope: string; contracts: Array<{ lessonId: string; entry: string; title: string; repro: Case; checks: Case[] }>; }
export interface RegraStatus { project: string; directory: string; lessons: number; runs: number; verified: number; rejected: number; runtime: string; }
export interface RunSummary {
  id: string; status: VerificationStatus; canProceed: boolean; summary: string;
  project: string; entry: string; title: string; createdAt: string; runtime: string;
  beforeHash: string; afterHash: string; caseHash: string; caseCount: number; repeats: number;
  lessonId: string | null; gates: Gate[]; failures: CaseResult[]; scope: string;
}
export interface Regra {
  readonly project: string;
  readonly directory: string;
  verify(request: { spec: ScopedSpec; before: string; after: string }): Promise<Run>;
  check(request: { source: string; entry?: string; spec?: ScopedSpec }): Promise<CheckResult>;
  lessons(filter?: LessonFilter): Promise<LessonPage>;
  context(filter?: LessonFilter): Promise<Context>;
  evidence(id: string): Promise<Run>;
  status(): Promise<RegraStatus>;
}
export function createRegra(options: { project: string; directory?: string }): Regra;
export function verify(request: { spec: Spec; before: string; after: string; lessons?: Lesson[] }): Promise<Run>;
export function validateSpec(value: unknown): Spec;
export function summarizeRun(run: Run): RunSummary;

export interface RepositoryIssue { code: string; detail: string; }
export interface RepositoryRevision { ref: string; commit: string; tree: string; fileCount: number; }
export interface RepositorySelection { root?: string; baseline: string; candidate?: string; }
export interface RepositoryPlan {
  kind: 'regra-repository-plan'; version: 1; root: string; adapter: 'node-test';
  baseline: RepositoryRevision; candidate: RepositoryRevision; testScript: string | null;
  testFiles: string[]; contractFiles: Array<{ path: string; oid: string; mode: string }>;
  changedFiles: string[]; addedTestFiles: string[]; contractHash: string; planHash: string;
  dependencyFingerprint: string; dependencies: string[]; hasLockfile: boolean;
  dirty: boolean; warnings: string[]; blockers: RepositoryIssue[]; ready: boolean;
  repeats: number; requiresTrust: true; scope: string;
}
export interface RepositoryInspection {
  kind: 'regra-repository-inspection'; root: string; revision: RepositoryRevision; adapter: 'node-test';
  packageName: string | null; testScript: string | null; testFiles: string[]; contractFiles: string[];
  dependencies: string[]; hasLockfile: boolean; supported: boolean; blockers: RepositoryIssue[];
  dirty: boolean; next: string; scope: string;
}
export interface RepositoryError { name?: string; code?: string; message: string; failureType?: string; actual?: string; expected?: string; operator?: string; cause: RepositoryError | null; }
export interface RepositoryTestResult {
  name: string; file: string | null; line: number | null; column: number | null; nesting: number;
  type?: string; passed: boolean; skipped: boolean; todo: boolean; fileWrapper: boolean; error: RepositoryError | null;
}
export interface RepositoryTestRun {
  repeat: number; results: RepositoryTestResult[];
  summary?: { success: boolean; counts: { tests: number; passed: number; failed: number; skipped: number; todo: number; cancelled: number; suites: number; topLevel: number }; duration_ms: number } | null;
  exitCode: number | null; signal: string | null; timedOut: boolean; outputLimit: boolean;
  error: string | null; workerError?: RepositoryError | null; durationMs: number; stderr: string; log?: string; truncated?: boolean;
}
export interface RepositoryOptions extends RepositorySelection {
  trusted: true; installDependencies?: boolean; timeoutMs?: number; expectedPlanHash?: string;
  onProgress?: (progress: { side: 'before' | 'after'; repeat: number; repeats: number }) => void;
}
export interface RepositoryProof {
  kind: 'regra-repository-proof'; version: 1; id: string; createdAt: string; completedAt: string;
  mode: 'repair' | 'check'; status: VerificationStatus; canProceed: boolean; summary: string;
  reason: RepositoryIssue; findings: RepositoryIssue[]; plan: RepositoryPlan; repeats: number;
  beforeRuns: RepositoryTestRun[]; afterRuns: RepositoryTestRun[]; proofPath: string; scope: string;
  environment: { node: string; git: string; npm: string | null; platform: string; arch: string; regra: string; workerHash: string; dependencyFingerprint: string; environmentPolicy: string };
  execution: { executable: string; arguments: string[]; input: { files: string[] }; runnerOptions: { concurrency: number; isolation: 'process' }; timeoutMs: number; dependencyInstall: string[] | null };
  installations: Array<{ side: string; repeat: number; exitCode: number | null; timedOut: boolean; durationMs: number; log: string }>;
}
export function inspectRepository(options?: { root?: string; revision?: string }): Promise<RepositoryInspection>;
export function planRepository(options: RepositorySelection): Promise<RepositoryPlan>;
export function verifyRepository(options: RepositoryOptions): Promise<RepositoryProof>;
export function checkRepository(options: RepositoryOptions): Promise<RepositoryProof>;
export function readRepositoryProof(options: { root?: string; id: string }): Promise<RepositoryProof>;
