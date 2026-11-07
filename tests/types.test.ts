import { createRegra, verify, summarizeRun, type ScopedSpec, type VerificationStatus } from '@mahekara28/regra';
import { inspectRepository, planRepository, verifyRepository, checkRepository, readRepositoryProof, type RepositoryProof } from '@mahekara28/regra';
const spec: ScopedSpec = {
  entry: 'average', title: 'Empty input', repro: { name: 'Empty', args: [[]], expect: 0 },
  checks: [{ name: 'Values', args: [[2, 4]], expect: 3 }]
};
async function consumer() {
  const regra = createRegra({ project: 'sample', directory: '.regra' });
  const run = await regra.verify({ spec, before: 'function average(x) { return 1; }', after: 'function average(x) { return 0; }' });
  const status: VerificationStatus = run.status;
  const decision: boolean = summarizeRun(run).canProceed;
  await regra.check({ source: run.after, spec });
  await regra.check({ source: run.after, entry: 'average' });
  await regra.context({ entry: 'average', limit: 5 });
  await regra.evidence(run.id);
  await verify({ spec: { ...spec, project: 'sample' }, before: run.before, after: run.after });
  return { status, decision };
}
// @ts-expect-error An expected return and an expected error cannot both be specified.
const ambiguous: ScopedSpec = { ...spec, repro: { name: 'Bad', args: [], expect: null, throws: 'Error' } };
// @ts-expect-error A project key is required to create a scoped service.
createRegra({ directory: '.regra' });
void consumer; void ambiguous;
async function repositoryConsumer() {
  const selection = { root: '/project', baseline: 'main', candidate: 'HEAD' };
  const inspection = await inspectRepository({ root: selection.root });
  const plan = await planRepository(selection);
  const proof: RepositoryProof = await verifyRepository({ ...selection, trusted: true, expectedPlanHash: plan.planHash });
  await checkRepository({ ...selection, trusted: true, installDependencies: false, onProgress: event => { const side: 'before' | 'after' = event.side; void side; } });
  await readRepositoryProof({ root: selection.root, id: proof.id });
  return { inspection, accepted: proof.canProceed };
}
// @ts-expect-error Running a repository requires explicit trusted-code acknowledgment.
void verifyRepository({ baseline: 'main' });
void repositoryConsumer;
