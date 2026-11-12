# Changelog

## 1.0.0

- Initial release of `deepseek-harness-git`, the Git source-control page for the DeepSeek Harness Web GUI.
- Workspace-scoped repository discovery with per-workspace selection of the repositories to load.
- Merge, staged, and working-tree groups with per-file stage, unstage, and discard.
- Unified diffs with old/new line numbers, hunk headers, binary and truncated notices, rename support, and conflict combined diffs.
- Commit box with per-repository drafts, amend, stage-all, `Ctrl`/`Cmd`+`Enter`, and AI message generation through the profile's default model.
- AI model picker for commit-message generation: defaults to the new-session model and can pin another provider/model for the browser.
- Local branch switching and creation, recent commits with details, and fetch/pull/push.
- Set upstream from the branch menu, with the configured remotes and their fetched branches listed in the dialog.
- English and Chinese UI, display metadata, and an original icon for the Plugin Manager.
- Host-side safety: workspace/symlink admission, no shell, bounded scans, diffs, and network verbs.
