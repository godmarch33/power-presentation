export const meta = {
  name: 'produce',
  description: 'Production loop for /present on Claude Code Workflows: storyboard, frame-worker x N, 4 adversarial critics on the contact sheet, then revise until gates QA-01..QA-14 pass. v1 stub, not implemented.',
  whenToUse: 'v1 only, not implemented. In MVP the same steps run on agents with the DISPATCH / WAIT pattern (story-director, frame-worker, critic-*), so /present must not call this workflow yet; if invoked it logs a notice and returns { status: "not_implemented" } without dispatching any agent. Intended args (v1, proposed): { runDir, briefPath, frameSpec, secondRound, startedAt } where startedAt is an ISO timestamp passed in because the workflow runtime does not allow reading the clock.',
  phases: [
    { title: 'Storyboard', detail: 'story-director (Opus) writes STORYBOARD.md, SCRIPT.md and claims-index.json; frame packets come from the vendor frame-packets.mjs' },
    { title: 'Frames', detail: 'frame-worker x N in parallel (Sonnet; maxTurns 40 lives in the agent frontmatter); each worker gets one frame packet: role, copy, timings, frame.md tokens, and may not edit neighbouring files' },
    { title: 'Critique', detail: 'deterministic verify chain by script (assemble, transitions, captions, hyperframes check, snapshot, wowprobe.py), then 4 adversarial critics on the contact sheet: critic-design, critic-readability, critic-pacing, critic-brand' },
    { title: 'Revise', detail: 'loop until QA-01..QA-14 pass: one revision round by default, a second only by flag and while budget_usd remains; scorecard 60-79 sends scenes to auto-fix, below 60 sends the run back to Storyboard' },
  ],
}

log('power-presentation:produce is a v1 stub: not implemented')

return {
  status: 'not_implemented',
  phase: 'v1',
  message: 'NOT IMPLEMENTED: power-presentation:produce (storyboard / frames / critics / revise loop on Workflow)',
  next: 'Use the MVP path: /present dispatches story-director, frame-worker and the critic agents directly (DISPATCH / WAIT) and runs /power-presentation:present-qa before render. Do not re-invoke this workflow and do not improvise frames or gate results on its behalf.',
}
