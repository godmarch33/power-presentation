# Acme Jobs — getting started (synthetic fixture GS-03, `docs/`)

This folder is the source of the `file / doc` scene ("Composition" table: document scroll plus a typed excerpt;
class `files/docs`). The content is fictional and exists only so the scene has a real Markdown file to scroll.
Phase: MVP (minimal form of the scene; polish is v1).

## Install

```bash
npm install -g acmejobs   # placeholder; the package does not exist
```

## Submit your first job

```bash
export ACMEJOBS_TOKEN="<your token>"
acmejobs submit --file report.csv
acmejobs watch --last
```

## What happens

1. The file is uploaded and a job id is returned (`job_…`).
2. The job runs on the queue; `watch` streams status changes.
3. `result --last --json` prints the finished job.

<!-- typed-excerpt candidate for the file/doc scene (reading floor QA-10: >= max(1.2 s, chars/cps)): -->
> Submit a file, watch it run, read the result — three commands, no dashboard.
