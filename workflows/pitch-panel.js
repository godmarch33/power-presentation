export const meta = {
  name: 'pitch-panel',
  description: 'Pitch round for /present on Claude Code Workflows: 5 concept generators, 3 judges with the marketing / sales / investors lenses, one recommendation. v1 stub, not implemented.',
  whenToUse: 'v1 only, not implemented. The MVP pitch round runs on agents (story-director) with the DISPATCH / WAIT pattern, so /present must not call this workflow yet; if invoked it logs a notice and returns { status: "not_implemented" } without dispatching any agent. Intended args (v1, proposed): { runDir, productProfile, captureManifest, audience, startedAt } where startedAt is an ISO timestamp passed in because the workflow runtime does not allow reading the clock.',
  phases: [
    { title: 'Generate', detail: '5 concept generators in parallel, one per path; at least 2 concepts must carry p < 0.10' },
    { title: 'Judge', detail: '3 judges in parallel, one per lens: marketing, sales, investors; each reads the matching skills/present/references/audiences/<lens>.md' },
    { title: 'Recommend', detail: 'tally in code, no agent: return the ranked concepts plus one recommendation, shown by /present as the third interview question' },
  ],
}

log('power-presentation:pitch-panel is a v1 stub: not implemented')

return {
  status: 'not_implemented',
  phase: 'v1',
  message: 'NOT IMPLEMENTED: power-presentation:pitch-panel (pitch round on Workflow)',
  next: 'Use the MVP path: /present runs the pitch round on agents (story-director) with DISPATCH / WAIT. Do not re-invoke this workflow and do not improvise concepts on its behalf.',
}
