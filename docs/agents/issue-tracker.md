# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub Issues in
`shizhi3620/tourism_certificate`. Use the `gh` CLI for issue operations.

## Conventions

- Create: `gh issue create --title "..." --body "..."`.
- Read: `gh issue view <number> --comments`.
- List: `gh issue list --state open --json number,title,body,labels,comments`.
- Comment: `gh issue comment <number> --body "..."`.
- Apply labels: `gh issue edit <number> --add-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

Pull requests are not a request surface for triage in this repository.
