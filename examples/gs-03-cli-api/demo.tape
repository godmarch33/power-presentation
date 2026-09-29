Output demo.mp4
Output frames/

Set Shell "bash"
Set Width 1920
Set Height 1080
Set FontSize 28
Set Padding 40
Set TypingSpeed 50ms
Set Theme "Catppuccin Mocha"

Env ACMEJOBS_TOKEN "fixture-token-not-a-secret"
Env ACMEJOBS_API "https://api.acme-jobs.example/v1"
Env ACMEJOBS_BIN "__REPO__/bin"

Hide
Type 'export PATH="$ACMEJOBS_BIN:$PATH"' Enter
Type "export PS1='$ '" Enter
Type "clear" Enter
Show

Type "acmejobs submit --file report.csv"
Sleep 300ms
Enter
Wait+Screen /job_[a-z0-9]+ queued/
Sleep 1.5s

Type "acmejobs watch --last"
Sleep 300ms
Enter
Wait+Screen /status: running/
Sleep 2s
Wait+Screen /status: done/
Sleep 1.5s

Type "acmejobs result --last --json | head -n 12"
Sleep 300ms
Enter
Wait+Screen /"status": "done"/
Sleep 3s
