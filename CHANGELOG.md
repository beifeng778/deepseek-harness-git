# Changelog

## 1.2.1

- Fixed the commit box's amend row overlapping the staged count: the row shared the `dg-commit-row` class with history rows and inherited their block layout.
- Added a committer filter to **Recent commits**: it matches a name or email, its picker lists the loaded committers with their emails and commit counts, and the section badge shows the matched count.

## 1.2.0

- Added a tree/list toggle for the change groups; the choice is remembered in the browser.
- Commit details now list the changed files with their statuses; selecting one focuses that file's patch.

## 1.1.0

- Staged, unstaged, and conflicted changes now render as a collapsible directory tree, with single-child folders compacted and expansion state kept per section.

## 1.0.1

- CI: publish future releases through npm trusted publishing (OIDC).

## 1.0.0

- Initial release of `deepseek-harness-git`, the Git source-control page for the DeepSeek Harness Web GUI.
- Workspace-scoped repository discovery with per-workspace selection of the repositories to load.
- Merge, staged, and working-tree groups with per-file stage, unstage, and discard.
- Unified diffs with old/new line numbers, hunk headers, binary and truncated notices, rename support, and conflict combined diffs.
- Commit box with per-repository drafts, amend, stage-all, `Ctrl`/`Cmd`+`Enter`, and AI message generation through the profile's default model.
- AI model picker for commit-message generation: defaults to the new-session model and can pin another provider/model for the browser.
- Local branch switching and creation, recent commits with details, and fetch/pull/push.
- Delete a merged local branch from the branch menu (safe `git branch -d`).
- Publish a branch without an upstream: push it and set the upstream in one action.
- Manage remote repositories: add or remove a remote, list its URL, and fetch all remotes.
- Set upstream from the branch menu, with the configured remotes and their fetched branches listed in the dialog.
- English and Chinese UI, display metadata, and an original icon for the Plugin Manager.
- Host-side safety: workspace/symlink admission, no shell, bounded scans, diffs, and network verbs.
