export const meta = {
  name: 'visual-qa',
  description: 'Vision-critic vote for /present on Claude Code Workflows: contact sheet, 3 adversarial votes on the seven dimensions C1..C7, ship verdict by majority. v1 stub, not implemented.',
  whenToUse: 'v1 only, not implemented. In MVP the 3-vote vision critic runs in session on agents from /power-presentation:present-qa, so /present must not call this workflow yet; if invoked it logs a notice and returns { status: "not_implemented" } without dispatching any agent. Intended args (v1, proposed): { runDir, renderPath, previousBest, startedAt } where startedAt is an ISO timestamp passed in because the workflow runtime does not allow reading the clock.',
  phases: [
    { title: 'Contact sheet', detail: 'one agent runs scripts/wowprobe.py --sheet on the render (ffmpeg; the only producer of QA/contact-sheet.png): a 1920x1080 contact sheet (6 columns, 1 frame per second, timecodes) plus 12 frames at 960x540 taken at frame 0, +0.5 s, scene midpoints and +/-0.2 s around cuts; STORYBOARD.md, BRIEF.md and QA/wowprobe.json are attached' },
    { title: 'Votes', detail: '3 votes in parallel; each scores C1..C7 on 0..4 with the anchors and sees only the contact sheet and the cuts, never the worker explanations' },
    { title: 'Verdict', detail: 'computed in code, no agent: a vote passes at mean >= 3.0 with no dimension below 2; ship = majority of the 3 votes; the verdict is recorded in run-report.json' },
  ],
}

log('power-presentation:visual-qa is a v1 stub: not implemented')

return {
  status: 'not_implemented',
  phase: 'v1',
  message: 'NOT IMPLEMENTED: power-presentation:visual-qa (3-vote vision critic on Workflow)',
  next: 'Use the MVP path: /power-presentation:present-qa runs the 3-vote vision critic in session on the critic-* agents. Do not re-invoke this workflow and do not improvise scores or a ship verdict on its behalf.',
}
