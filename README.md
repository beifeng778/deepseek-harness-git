# deepseek-harness-git

[![CI](https://github.com/beifeng778/deepseek-harness-git/actions/workflows/ci.yml/badge.svg)](https://github.com/beifeng778/deepseek-harness-git/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deepseek-harness-git.svg)](https://www.npmjs.com/package/deepseek-harness-git)
[![license](https://img.shields.io/npm/l/deepseek-harness-git.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/beifeng778/deepseek-harness-git?style=social)](https://github.com/beifeng778/deepseek-harness-git/stargazers)

A Git source-control page for the DeepSeek Harness Web GUI, modelled on the
source-control panel people know from VS Code: repository discovery, staged and
working-tree groups, per-file staging, unified diffs, a commit box with AI
message generation, branch switching, recent history, and fetch/pull/push.

The plugin is a bundle with two halves:

- **Host** (`index.js`) runs the local `git` executable for one registered
  Workspace at a time and publishes one authenticated exact Fetch route,
  `POST /api/dsh-git`, on Connection's shared `/api` channel.
- **Client** (`client.js`) registers a main-column page keyed `dsh-git` and an
  icon in the sidebar's global panel list. Opening the icon selects the page,
  exactly like the shipped Plugins and Schedules panels.

## Features

| Area | What it does |
|---|---|
| Workspace | Lists the profile's registered Workspaces, remembers the last one, and scans it for repositories. |
| Repository discovery | Walks up to four levels below the Workspace root, recognises `.git` directories and worktree files, and skips build and dependency directories. |
| Repository selection | A **Manage repositories** dialog lists every detected repository with a checkbox; the choice is persisted per Workspace, and the header's repository chip switches the active one. |
| Changes | Merge, staged, and working-tree groups with status letters (`M`, `A`, `D`, `R`, `C`, `T`, `U`, `!`), original paths for renames, and per-row stage/unstage/discard. |
| Commit | Message box with a per-repository draft, `Ctrl`/`Cmd`+`Enter`, amend, staged count, stage-all, and AI message generation from the changes. |
| AI model | The commit box defaults to the profile's new-session model and can pin another provider/model from the profile's adapters for message generation; the choice is remembered in this browser. |
| Diff | Unified patches with old/new line numbers, hunk headers, add/remove colouring, binary and truncated notices, and a 1,500-line render cap with "show all". |
| History | The 40 most recent commits; selecting one shows its metadata and patch. |
| Branches | Local branch menu with upstream, current marker, switch, and create. |
| Sync | Fetch, pull, and push, with ahead/behind counts and a bounded 120-second network timeout. |
| Empty states | No Workspaces, no repositories found (with **Scan again** and **Initialize repository**), no repositories loaded, clean tree, no staged changes, no commits. |
| Localization | English and Chinese dictionaries, registered in the host locale namespace `dsh-git`. |

## Install

From the Harness profile that should own the panel, either install the published
package:

```
plugin_manager install_bundle  target: deepseek-harness-git@1.0.0
```

or install this checkout by absolute path:

```
plugin_manager install_bundle  target: <absolute path to this directory>
```

The bundle's `cordis.patch.yml` inserts one row:

```yaml
- insert:
    - id: deepseek-harness-git
      name: deepseek-harness-git
      config: {}
```

`config.gitPath` may override the executable name or an absolute path when
`git` is not on the Host's `PATH`:

```yaml
- insert:
    - id: deepseek-harness-git
      name: deepseek-harness-git
      config:
        gitPath: 'C:\Program Files\Git\cmd\git.exe'
```

AI message generation defaults to the profile's new-session model. The commit
box's **AI model** selector can pin another provider/model for this browser; the
optional profile config below is the fallback when no selection is stored. Set
both fields together:

```yaml
- insert:
    - id: deepseek-harness-git
      name: deepseek-harness-git
      config:
        messageProvider: magpie
        messageModel: devin/deepseek-v4-1-flash-1017
```

## Use

1. Open the sidebar's panel list and choose **Git**.
2. Pick a Workspace from the folder chip beside the title. The panel scans it
   for repositories and loads every one it finds by default.
3. Open **Manage repositories** (the list button in the toolbar, or the
   repository chip's menu) and uncheck the repositories this page should not
   load. The choice is remembered per Workspace.
4. Use the repository chip to switch the active repository, review a file, stage
   it, write a message, and commit. The **Generate** button in the commit box
   asks the selected model for a message based on the staged changes (or the
   working-tree changes when nothing is staged). The **AI model** row defaults to
   the new-session model; choose another model to pin it for this browser.
5. Switch branches from the branch chip; sync from the toolbar.

The page is root-scoped, so it remains usable with no Session selected. It
polls the active repository every five seconds while the page is visible and
refreshes on window focus.

## Host contract

One route, one JSON envelope:

```json
{ "endpoint": "state", "payload": { "cwd": "D:\\project" } }
```

The host answers `{ ok: true, value }` or
`{ ok: false, error: { code, message } }`. Endpoints:

| Endpoint | Payload | Result |
|---|---|---|
| `repos` | — | `{ workspaces: [{ id, title, path }] }` |
| `scan` | `{ cwd }` | `{ workspace, repos: [{ path, relativePath, name }], truncated }` |
| `models` | — | provider/model catalog plus the new-session default |
| `message` | `{ cwd, locale, provider?, model? }` | AI-generated commit message, model route, and file count |
| `state` | `{ cwd }` | repository head, staged/unstaged entries, branches, commits |
| `diff` | `{ cwd, path, group, originalPath? }` | one parsed patch |
| `show` | `{ cwd, hash }` | commit metadata and parsed patch |
| `stage` | `{ cwd, paths }` or `{ cwd, all: true }` | `git add` |
| `unstage` | `{ cwd, paths }` or `{ cwd, all: true }` | `git restore --staged` (unborn-HEAD fallback: `git rm --cached`) |
| `discard` | `{ cwd, paths }` | `git restore --` for tracked paths, delete for untracked |
| `commit` | `{ cwd, message, amend?, stageAll? }` | new short hash and output |
| `checkout` | `{ cwd, branch }` | `git switch` |
| `createBranch` | `{ cwd, branch }` | `git switch -c` |
| `fetch` / `pull` / `push` | `{ cwd }` | network verbs |
| `init` | `{ cwd }` | `git init -b main` |

## Safety boundaries

- **Workspace admission.** Every request names `cwd`; the host accepts a
  registered Workspace root or a directory inside one, resolves both sides with
  `fs.realpath`, and rejects a path that escapes the Workspace through a
  symlink. The route cannot be used as an arbitrary-cwd command runner.
- **Bounded discovery.** A scan walks at most four levels and 2,000 directories,
  skips symlinks, hidden directories, and build/dependency directories
  (`node_modules`, `dist`, `build`, `target`, …), and reports truncation.
- **No shell.** Commands use `execFile` with an argv array. User paths travel
  after `--`, and branch names are validated before they reach argv.
- **AI data egress.** AI message generation sends the changed-file list and a
  bounded diff (24,000 characters) to the selected model (default: the profile's
  new-session model) through `ctx.llm`; it never calls an external service
  directly.
- **Path containment.** Diff and mutation paths must be repository-relative,
  with no `..` segment or drive prefix.
- **Non-interactive.** `GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`, and pager
  suppression keep a missing credential or an editor from hanging the request.
- **Bounded.** Reads time out after 60 seconds, network verbs after 120 seconds,
  command output is capped at 4,000 characters, and patches at 6,000 lines.

## Development

The package has no build step and no runtime dependency beyond the browser's
React and the Host's Node runtime.

```
node test/host.test.mjs          # real git, temporary repositories, scan
node test/client-module.test.mjs # module-loader contract
node --check index.js client.js
```

The interaction model — staged/working-tree grouping, status letters, the
commit input, and the branch/sync vocabulary — follows the VS Code Git
extension (`extensions/git`) and SCM view (`src/vs/workbench/contrib/scm`),
which are MIT-licensed. No VS Code source is copied; the implementation here is
original and uses the Harness slot, locale, and Connection APIs.

## Publishing

The npm name `deepseek-harness-git` is available and matches the GitHub
repository name. `publishConfig.registry` points at the canonical registry, so a
plain publish works even when the local install registry is a mirror.

The **first release must be published manually**; that first upload creates the
package, and only then can npm store a Trusted Publisher for it:

```
npm publish
```

`prepublishOnly` runs `npm run check && npm test` before the upload, and
`npm pack --dry-run` lists exactly the published files.

After the package exists, configure GitHub Actions as a Trusted Publisher
(package settings on npmjs.com, or the CLI):

```
npm trust github deepseek-harness-git \
  --file publish.yml \
  --repo beifeng778/deepseek-harness-git \
  --yes
```

Allow **direct publish** (`npm publish`) for that trusted publisher. No
`NPM_TOKEN` secret is required; the workflow uses OIDC through
`permissions: id-token: write` and `--provenance`.

Create the empty GitHub repository, then push:

```
git remote add origin git@github.com:beifeng778/deepseek-harness-git.git
git push -u origin main
```

`.github/workflows/ci.yml` runs the tests on Node 20 and 22.
`.github/workflows/publish.yml` publishes on a GitHub release, or manually from
the Actions tab (`workflow_dispatch`).

## Known limitations

- One active repository per page view; the repository manager switches between
  loaded repositories but does not aggregate their changes into one list.
- Discovery stops at four levels below the Workspace and skips hidden
  directories and symlinks; a repository outside that shape is not detected.
  There is no manual path entry.
- No conflict-resolution editor: conflicted files appear in their own **Merge
  changes** group with git's combined diff and can be marked resolved once the
  markers are removed elsewhere.
- No line-level (hunk) staging or inline diff editing.
- AI message generation depends on the profile's default model; the prompt diff
  is truncated at 24,000 characters, and the message appears only after the
  model stream completes.
- No list virtualization: a repository with tens of thousands of changed files
  renders every row, and the five-second poll runs a full `git status` each
  time.
- Push relies on credentials already configured for the Host's git process;
  there is no in-app credential prompt.
- The panel is read/write through the local git CLI only; it does not use the
  Harness `worktrees` service or the agent's sandbox providers.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=beifeng778/deepseek-harness-git&type=Date)](https://star-history.com/#beifeng778/deepseek-harness-git&Date)
