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
