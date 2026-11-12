/**
 * dsh-git — browser half.
 *
 * One source-control page in the main column, reached from the sidebar's global
 * panel icon. The page is a plain Module Loader plugin: `window.__ModuleLoader__`
 * hands it React, and every read or write travels over the authenticated
 * `/api/dsh-git` exact Fetch route published by the host half.
 *
 * The panel is root-scoped on purpose. It lists the profile's Workspaces itself
 * and remembers the last repository, so it stays usable while no Session is
 * selected — the same posture as the Plugins and Schedules pages.
 */

window.__ModuleLoader__.load({
  id: 'deepseek-harness-git',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const {
      useState, useEffect, useMemo, useRef, useCallback,
    } = React

    /** Locale namespace and main-panel id. Both halves must agree on the id. */
    const NS = 'dsh-git'
    const PANEL_ID = 'dsh-git'
    /** Exact route the host half registers on Connection's `/api` channel. */
    const ROUTE = '/api/dsh-git'
    const REPO_KEY = 'dsh-git.repo'
    const WORKSPACE_KEY = 'dsh-git.workspace'
    const ACTIVE_PREFIX = 'dsh-git.active:'
    const ENABLED_PREFIX = 'dsh-git.enabled:'
    const DRAFT_PREFIX = 'dsh-git.draft:'
    const MODEL_KEY = 'dsh-git.messageModel'
    /** Separator for a provider/model pair inside one <option> value. */
    const MODEL_SEPARATOR = '\t'
    /** Client-side render cap for one patch. */
    const RENDER_LINES = 1500

    //#region copy

    const EN = {
      panelTitle: 'Git',
      loading: 'Loading…',
      panelUnavailable: 'The Git panel is not connected to the Host.',
      routeUnreachable: 'The Git panel route is unreachable ({message}).',
      httpError: 'The Git panel route answered HTTP {status}.',
      refused: 'The Git panel refused this request.',
      retry: 'Retry',
      refresh: 'Refresh',
      cancel: 'Cancel',
      dismiss: 'Dismiss',
      create: 'Create',
      repository: 'Repository',
      repositories: 'Repositories',
      chooseRepository: 'Choose repository',
      chooseWorkspace: 'Choose workspace',
      workspace: 'Workspace',
      manageRepos: 'Manage repositories',
      repositoriesTitle: 'Repositories in {workspace}',
      repositoriesHint: 'Choose which repositories this panel loads. The scan walks up to four levels below the workspace and skips build directories.',
      detectedRepos: '{n} repositories detected',
      loadedRepos: 'Loaded repositories',
      noRepositoriesFound: 'No Git repositories found',
      noRepositoriesHint: 'Scan again, or initialize a repository at the workspace root.',
      noRepositoriesLoaded: 'No repositories loaded',
      loadRepositoriesHint: 'Open Manage repositories and choose at least one.',
      scanAgain: 'Scan again',
      scanning: 'Scanning repositories…',
      scanTruncated: 'The scan stopped at its directory limit; some repositories may be missing.',
      selectAll: 'Select all',
      clearSelection: 'Clear',
      close: 'Close',
      rootRepository: 'Workspace root',
      repoCount: '{n} loaded',
      noWorkspaces: 'No workspaces yet',
      noWorkspacesHint: 'Add a workspace in the sidebar, then open this panel again.',
      branch: 'Branch',
      switchBranch: 'Switch branch',
      newBranch: 'New branch',
      newBranchPlaceholder: 'branch-name',
      detachedHead: 'Detached HEAD',
      noBranches: 'No local branches yet',
      aheadCount: '{n} ahead',
      behindCount: '{n} behind',
      noUpstream: 'No upstream',
      setUpstream: 'Set upstream…',
      setUpstreamTitle: 'Set upstream',
      setUpstreamText: 'Choose the remote branch that {branch} should track.',
      remote: 'Remote',
      remoteBranch: 'Remote branch',
      noRemotes: 'No remotes are configured for this repository.',
      noRemoteBranches: 'No remote branches; fetch the remote first.',
      loadingBranches: 'Loading branches…',
      savingUpstream: 'Setting upstream…',
      upstreamSet: 'Upstream set to {upstream}.',
      save: 'Save',
      branchSwitched: 'Switched to {branch}',
      branchCreated: 'Created {branch}',
      branchRequired: 'Enter a branch name.',
      fetch: 'Fetch',
      pull: 'Pull',
      push: 'Push',
      fetchDone: 'Fetched from every remote.',
      pullDone: 'Pulled the latest changes.',
      pushDone: 'Pushed the current branch.',
      commit: 'Commit',
      commitPlaceholder: 'Message (Ctrl+Enter to commit)',
      commitMessageRequired: 'Enter a commit message.',
      nothingStaged: 'Stage a change first.',
      amend: 'Amend last commit',
      amendHint: 'Replace the previous commit with this one',
      generateMessage: 'Generate',
      generateHint: 'Generate a commit message from the changes (replaces the current message)',
      generatingMessage: 'Generating a commit message…',
      noChangesHint: 'There are no changes to describe.',
      messageEmpty: 'The model returned an empty commit message.',
      aiModel: 'AI model',
      modelDefault: 'Default (new session model)',
      modelsLoading: 'Loading models…',
      modelsUnavailable: 'No models available',
      modelHint: 'Model used for AI commit message generation',
      stageAll: 'Stage all',
      unstageAll: 'Unstage all',
      stagedCount: '{n} staged',
      commitSuccess: 'Committed {hash}',
      committing: 'Committing…',
      stage: 'Stage',
      unstage: 'Unstage',
      stagedNotice: 'Staged changes.',
      unstagedNotice: 'Unstaged changes.',
      stagedAllNotice: 'Staged all changes.',
      unstagedAllNotice: 'Unstaged all changes.',
      discard: 'Discard changes',
      discardTitle: 'Discard changes?',
      discardText: 'This permanently reverts the selected working-tree changes.',
      discardUntrackedText: 'This permanently deletes the selected untracked files.',
      discardConfirm: 'Discard',
      discarded: 'Discarded changes.',
      discarding: 'Discarding…',
      filesCount: '{n} files',
      stagedChanges: 'Staged changes',
      mergeChanges: 'Merge changes',
      changes: 'Changes',
      history: 'Recent commits',
      noStaged: 'Nothing staged.',
      noConflicts: 'No conflicts.',
      noChanges: 'Working tree clean.',
      noCommits: 'No commits yet.',
      markResolved: 'Mark resolved',
      expand: 'Expand',
      collapse: 'Collapse',
      showAll: 'Show all {n} lines',
      showLess: 'Show less',
      truncated: 'The patch was truncated.',
      selectFile: 'Select a file',
      selectFileHint: 'Choose a changed file to review its diff.',
      noDiff: 'No textual changes.',
      binaryDiff: 'Binary file — no textual diff.',
      diffFailed: 'Could not load the diff.',
      workingTree: 'Working tree',
      stagedVersion: 'Staged',
      commitDetails: 'Commit {hash}',
      filesChanged: '{n} files changed',
      backToChanges: 'Back to changes',
      notARepository: 'Not a Git repository',
      notARepositoryHint: 'This workspace has no Git repository. Initialize one to start tracking changes.',
      initRepository: 'Initialize repository',
      initializing: 'Initializing…',
      initialized: 'Repository initialized.',
      gitMissing: 'Git was not found',
      gitMissingHint: 'Install Git and make sure it is on PATH, then refresh.',
      modified: 'Modified',
      added: 'Added',
      deleted: 'Deleted',
      renamed: 'Renamed',
      copied: 'Copied',
      untracked: 'Untracked',
      conflicted: 'Conflicted',
      typeChanged: 'Type changed',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      hoursAgo: '{n} h ago',
      daysAgo: '{n} d ago',
      loadingFailed: 'Could not load the repository.',
      renderFailed: 'Git panel failed to render',
      syncDone: 'Up to date.',
    }

    const ZH = {
      panelTitle: 'Git',
      loading: '加载中…',
      panelUnavailable: 'Git 面板未连接到 Host。',
      routeUnreachable: 'Git 面板路由不可达（{message}）。',
      httpError: 'Git 面板路由返回 HTTP {status}。',
      refused: 'Git 面板拒绝了此请求。',
      retry: '重试',
      refresh: '刷新',
      cancel: '取消',
      dismiss: '关闭',
      create: '创建',
      repository: '仓库',
      repositories: '仓库',
      chooseRepository: '选择仓库',
      chooseWorkspace: '选择工作区',
      workspace: '工作区',
      manageRepos: '管理仓库',
      repositoriesTitle: '{workspace} 中的仓库',
      repositoriesHint: '选择此面板要加载的仓库。扫描最多深入工作区以下四层，并跳过构建目录。',
      detectedRepos: '检测到 {n} 个仓库',
      loadedRepos: '已加载仓库',
      noRepositoriesFound: '未找到 Git 仓库',
      noRepositoriesHint: '请重新扫描，或在工作区根目录初始化仓库。',
      noRepositoriesLoaded: '未加载仓库',
      loadRepositoriesHint: '打开“管理仓库”并至少选择一个。',
      scanAgain: '重新扫描',
      scanning: '正在扫描仓库…',
      scanTruncated: '扫描达到目录上限，部分仓库可能未显示。',
      selectAll: '全选',
      clearSelection: '清空',
      close: '关闭',
      rootRepository: '工作区根目录',
      repoCount: '已加载 {n} 个',
      noWorkspaces: '暂无工作区',
      noWorkspacesHint: '请先在侧边栏添加工作区，然后重新打开此面板。',
      branch: '分支',
      switchBranch: '切换分支',
      newBranch: '新建分支',
      newBranchPlaceholder: '分支名称',
      detachedHead: '游离 HEAD',
      noBranches: '暂无本地分支',
      aheadCount: '领先 {n} 个提交',
      behindCount: '落后 {n} 个提交',
      noUpstream: '无上游分支',
      setUpstream: '设置上游…',
      setUpstreamTitle: '设置上游',
      setUpstreamText: '选择 {branch} 要跟踪的远程分支。',
      remote: '远程仓库',
      remoteBranch: '远程分支',
      noRemotes: '这个仓库没有配置远程仓库。',
      noRemoteBranches: '没有远程分支，请先抓取远程。',
      loadingBranches: '正在加载分支…',
      savingUpstream: '正在设置上游…',
      upstreamSet: '上游已设置为 {upstream}。',
      save: '保存',
      branchSwitched: '已切换到 {branch}',
      branchCreated: '已创建 {branch}',
      branchRequired: '请输入分支名称。',
      fetch: '获取',
      pull: '拉取',
      push: '推送',
      fetchDone: '已从所有远程获取。',
      pullDone: '已拉取最新更改。',
      pushDone: '已推送当前分支。',
      commit: '提交',
      commitPlaceholder: '提交信息（Ctrl+Enter 提交）',
      commitMessageRequired: '请输入提交信息。',
      nothingStaged: '请先暂存更改。',
      amend: '修补上次提交',
      amendHint: '用本次提交替换上一次提交',
      generateMessage: 'AI 生成',
      generateHint: '根据更改生成提交信息（会替换当前内容）',
      generatingMessage: '正在生成提交信息…',
      noChangesHint: '没有可描述的更改。',
      messageEmpty: '模型返回了空的提交信息。',
      aiModel: 'AI 模型',
      modelDefault: '默认（新会话模型）',
      modelsLoading: '正在加载模型…',
      modelsUnavailable: '没有可用模型',
      modelHint: '用于 AI 生成提交信息的模型',
      stageAll: '全部暂存',
      unstageAll: '全部取消暂存',
      stagedCount: '已暂存 {n} 个',
      commitSuccess: '已提交 {hash}',
      committing: '正在提交…',
      stage: '暂存',
      unstage: '取消暂存',
      stagedNotice: '已暂存更改。',
      unstagedNotice: '已取消暂存。',
      stagedAllNotice: '已暂存全部更改。',
      unstagedAllNotice: '已取消全部暂存。',
      discard: '放弃更改',
      discardTitle: '放弃更改？',
      discardText: '此操作将永久还原所选的工作区更改。',
      discardUntrackedText: '此操作将永久删除所选的未跟踪文件。',
      discardConfirm: '放弃',
      discarded: '已放弃更改。',
      discarding: '正在放弃…',
      filesCount: '{n} 个文件',
      stagedChanges: '已暂存的更改',
      mergeChanges: '合并更改',
      changes: '更改',
      history: '最近提交',
      noStaged: '暂无已暂存的更改。',
      noConflicts: '没有冲突。',
      noChanges: '工作区干净。',
      noCommits: '暂无提交。',
      markResolved: '标记为已解决',
      expand: '展开',
      collapse: '收起',
      showAll: '显示全部 {n} 行',
      showLess: '收起',
      truncated: '补丁已被截断。',
      selectFile: '选择文件',
      selectFileHint: '选择一个更改的文件以查看差异。',
      noDiff: '没有文本差异。',
      binaryDiff: '二进制文件，无文本差异。',
      diffFailed: '无法加载差异。',
      workingTree: '工作区',
      stagedVersion: '已暂存',
      commitDetails: '提交 {hash}',
      filesChanged: '{n} 个文件更改',
      backToChanges: '返回更改',
      notARepository: '不是 Git 仓库',
      notARepositoryHint: '此工作区没有 Git 仓库。初始化后即可开始跟踪更改。',
      initRepository: '初始化仓库',
      initializing: '正在初始化…',
      initialized: '仓库已初始化。',
      gitMissing: '未找到 Git',
      gitMissingHint: '请安装 Git 并确保它在 PATH 中，然后刷新。',
      modified: '已修改',
      added: '已添加',
      deleted: '已删除',
      renamed: '已重命名',
      copied: '已复制',
      untracked: '未跟踪',
      conflicted: '冲突',
      typeChanged: '类型变更',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      daysAgo: '{n} 天前',
      loadingFailed: '无法加载仓库。',
      renderFailed: 'Git 面板渲染失败',
      syncDone: '已是最新。',
    }

    //#endregion

    //#region styles

    const CSS = `
      .dg-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45;container-type:inline-size}
      .dg-root *{box-sizing:border-box}
      .dg-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex:none;padding:16px 20px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
      .dg-heading{min-width:0;display:flex;flex-direction:column;gap:3px}
      .dg-title-row{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}
      .dg-glyph{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);flex:none}
      .dg-title{margin:0;font-size:18px;line-height:1.2;font-weight:600;letter-spacing:-0.01em}
      .dg-subtitle{margin:0;min-width:0;max-width:min(720px,60vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}
      .dg-toolbar{display:flex;align-items:center;gap:4px;flex:none;padding-top:2px}
      .dg-chip{display:inline-flex;align-items:center;gap:6px;max-width:260px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;line-height:1.5;cursor:pointer;min-width:0}
      .dg-chip:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
      .dg-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .dg-chip-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .dg-chip-meta{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none}
      .dg-chip[data-current="true"]{color:var(--dsw-alias-brand-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent)}
      .dg-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:5px 10px;font:inherit;font-size:12px;line-height:1.5;cursor:pointer;white-space:nowrap}
      .dg-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}
      .dg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .dg-btn:disabled{opacity:.45;cursor:default}
      .dg-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
      .dg-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2))}
      .dg-btn-danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border-color:var(--dsw-alias-state-error-primary)}
      .dg-btn-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
      .dg-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .dg-icon-btn{display:inline-flex;align-items:center;justify-content:center;gap:2px;width:26px;height:26px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;font:inherit;font-size:11px}
      .dg-icon-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
      .dg-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
      .dg-icon-btn:disabled{opacity:.4;cursor:default}
      .dg-badge{display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;font-variant-numeric:tabular-nums;line-height:1}
      .dg-busy{display:inline-flex;align-items:center;gap:6px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11.5px;padding:0 4px}
      .dg-banners{display:flex;flex-direction:column;gap:6px;flex:none;padding:8px 20px 0}
      .dg-banner{display:flex;align-items:flex-start;gap:8px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:7px;padding:6px 9px;font-size:12px;line-height:1.5}
      .dg-banner-text{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
      .dg-banner-ok{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}
      .dg-banner-error{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary)}
      .dg-banner-warn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent);color:var(--dsw-alias-state-warn-primary)}
      .dg-banner .dg-icon-btn{width:20px;height:20px;margin:-2px -2px 0 0}
      .dg-body{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);flex:1;min-height:0}
      .dg-body-single{display:flex;align-items:stretch;justify-content:stretch}
      .dg-side{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-right:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
      .dg-side-scroll{flex:1;min-height:0;overflow:auto}
      .dg-commit{display:flex;flex-direction:column;gap:7px;flex:none;padding:12px 12px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
      .dg-textarea{width:100%;min-height:64px;max-height:180px;resize:vertical;border:0.5px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1.5;padding:7px 9px}
      .dg-textarea::placeholder{color:var(--dsw-alias-label-secondary)}
      .dg-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;border-color:transparent}
      .dg-model-row{display:flex;align-items:center;gap:6px;min-width:0}
      .dg-model-label{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;flex:none}
      .dg-model-select{flex:1;min-width:0;height:24px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;padding:0 5px}
      .dg-model-select:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
      .dg-model-select:disabled{opacity:.55;cursor:not-allowed}
      .dg-commit-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px}
      .dg-check{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-size:11.5px;cursor:pointer;user-select:none}
      .dg-check input{margin:0;accent-color:var(--dsw-alias-brand-primary)}
      .dg-commit-count{color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums}
      .dg-commit-actions{display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}
      .dg-section{border-bottom:0.5px solid var(--dsw-alias-border-l1)}
      .dg-section-head{display:flex;align-items:center;gap:4px;padding:5px 8px 5px 12px;position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base)}
      .dg-section-toggle{display:flex;align-items:center;gap:6px;flex:1;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:600;letter-spacing:.045em;text-transform:uppercase;text-align:left;padding:3px 0;cursor:pointer}
      .dg-section-toggle:hover{color:var(--dsw-alias-label-primary)}
      .dg-section-toggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:4px}
      .dg-section-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-count{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:16px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:600;letter-spacing:0;font-variant-numeric:tabular-nums}
      .dg-section-empty{padding:4px 12px 10px;color:var(--dsw-alias-label-secondary);font-size:11.5px}
      .dg-file{display:flex;align-items:center;gap:1px;padding-right:6px}
      .dg-file[data-active="true"]{background:var(--dsw-alias-bg-layer-2)}
      .dg-file:hover{background:var(--dsw-alias-bg-layer-2)}
      .dg-file-main{display:flex;align-items:center;gap:7px;flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:3px 6px 3px 12px;cursor:pointer}
      .dg-file-main:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .dg-status{display:inline-flex;align-items:center;justify-content:center;width:13px;flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;font-weight:700}
      .dg-status[data-s="M"]{color:var(--dsw-alias-state-warn-primary)}
      .dg-status[data-s="A"],.dg-status[data-s="U"]{color:var(--dsw-alias-state-success-primary)}
      .dg-status[data-s="D"],.dg-status[data-s="!"]{color:var(--dsw-alias-state-error-primary)}
      .dg-status[data-s="R"],.dg-status[data-s="C"]{color:var(--dsw-alias-brand-primary)}
      .dg-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
      .dg-dir{color:var(--dsw-alias-label-secondary)}
      .dg-file-orig{margin-left:6px;color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:45%}
      .dg-file-actions{display:flex;align-items:center;gap:1px;flex:none;opacity:0}
      .dg-file:hover .dg-file-actions,.dg-file:focus-within .dg-file-actions{opacity:1}
      .dg-file-actions .dg-icon-btn{width:22px;height:22px}
      .dg-commit-row-button{display:flex;flex-direction:column;gap:1px;width:100%;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:5px 12px;cursor:pointer}
      .dg-commit-row-button:hover{background:var(--dsw-alias-bg-layer-2)}
      .dg-commit-row-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .dg-commit-line{display:flex;align-items:baseline;gap:7px;min-width:0;width:100%}
      .dg-hash{flex:none;color:var(--dsw-alias-brand-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
      .dg-subject{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
      .dg-commit-meta{color:var(--dsw-alias-label-secondary);font-size:10.5px;padding-left:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-diff{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}
      .dg-diff-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;min-height:45px;padding:8px 16px;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
      .dg-diff-title{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
      .dg-diff-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
      .dg-diff-actions{display:flex;align-items:center;gap:4px;flex:none}
      .dg-diff-sub{color:var(--dsw-alias-label-secondary);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-seg{display:inline-flex;align-items:center;padding:2px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l1);flex:none}
      .dg-seg-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:1.5;padding:2px 8px;border-radius:4px;cursor:pointer}
      .dg-seg-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
      .dg-seg-btn[data-on="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.08)}
      .dg-seg-btn:disabled{opacity:.4;cursor:default}
      .dg-diff-body{flex:1;min-height:0;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:20px}
      .dg-commit-detail{display:flex;flex-direction:column;gap:2px;padding:8px 16px;border-bottom:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none}
      .dg-commit-detail-subject{font-size:13px;font-weight:600;overflow-wrap:anywhere}
      .dg-commit-detail-meta{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-file-block{border-bottom:0.5px solid var(--dsw-alias-border-l1)}
      .dg-file-block-head{display:flex;align-items:center;gap:8px;padding:6px 12px;position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1);border-bottom:0.5px solid var(--dsw-alias-border-l1);font-family:inherit}
      .dg-file-block-path{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
      .dg-file-block-orig{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px}
      .dg-tag{display:inline-flex;align-items:center;border:0.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 7px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.6;white-space:nowrap}
      .dg-line{display:flex;min-width:max-content}
      .dg-ln{flex:none;width:46px;padding-right:8px;text-align:right;color:var(--dsw-alias-label-secondary);opacity:.7;user-select:none;font-size:11px}
      .dg-sign{flex:none;width:18px;text-align:center;user-select:none;color:var(--dsw-alias-label-secondary)}
      .dg-code{white-space:pre;padding-right:18px;min-width:0}
      .dg-line-add{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 13%, transparent)}
      .dg-line-add .dg-sign{color:var(--dsw-alias-state-success-primary)}
      .dg-line-del{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}
      .dg-line-del .dg-sign{color:var(--dsw-alias-state-error-primary)}
      .dg-line-ctx .dg-code{color:var(--dsw-alias-label-primary)}
      .dg-hunk-row{padding:2px 12px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-size:11.5px;white-space:pre;min-width:max-content}
      .dg-meta-row{padding:1px 12px;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:pre;min-width:max-content}
      .dg-diff-more{display:flex;justify-content:center;padding:8px 12px}
      .dg-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;flex:1;min-height:0;height:100%;padding:40px 24px;text-align:center;color:var(--dsw-alias-label-secondary)}
      .dg-empty-glyph{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:13px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
      .dg-empty-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
      .dg-empty-text{font-size:12px;line-height:1.6;max-width:360px}
      .dg-empty-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-menu-anchor{position:relative;display:inline-flex;min-width:0}
      .dg-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:50;min-width:250px;max-width:min(460px,70vw);max-height:340px;overflow:auto;padding:4px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 28px rgba(0,0,0,.2)}
      .dg-menu-item{display:flex;align-items:flex-start;gap:7px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;padding:6px 8px;border-radius:5px;cursor:pointer}
      .dg-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}
      .dg-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .dg-menu-item[data-current="true"]{color:var(--dsw-alias-brand-primary)}
      .dg-menu-check{display:inline-flex;align-items:center;justify-content:center;width:14px;height:18px;flex:none;color:var(--dsw-alias-brand-primary)}
      .dg-menu-item-main{display:flex;flex-direction:column;gap:1px;min-width:0}
      .dg-menu-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-menu-item-path{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}
      .dg-menu-label{padding:6px 8px 2px;color:var(--dsw-alias-label-secondary);font-size:10.5px;font-weight:600;letter-spacing:.045em;text-transform:uppercase}
      .dg-menu-empty{padding:4px 8px 8px;color:var(--dsw-alias-label-secondary);font-size:11.5px}
      .dg-menu-sep{height:0.5px;background:var(--dsw-alias-border-l1);margin:4px 0}
      .dg-menu-input-row{display:flex;align-items:center;gap:6px;padding:3px 6px 6px}
      .dg-input{flex:1;min-width:0;border:0.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;padding:4px 7px}
      .dg-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;border-color:transparent}
      .dg-modal-backdrop{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb, #000 38%, transparent)}
      .dg-modal{width:min(430px,100%);display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 44px rgba(0,0,0,.28)}
      .dg-modal-title{font-size:14px;font-weight:600}
      .dg-modal-text{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6}
      .dg-modal-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
      .dg-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
      .dg-field{display:flex;flex-direction:column;gap:4px}
      .dg-field-label{font-size:11px;color:var(--dsw-alias-label-secondary)}
      .dg-select{flex:none;height:28px;padding:0 6px}
      .dg-modal-error{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-state-error-primary);word-break:break-word}
      .dg-modal-wide{width:min(600px,100%)}
      .dg-manager-meta{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;min-height:18px}
      .dg-repo-list{display:flex;flex-direction:column;gap:1px;max-height:min(360px,50vh);overflow:auto;padding:4px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base)}
      .dg-repo-row{display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}
      .dg-repo-row:hover{background:var(--dsw-alias-bg-layer-2)}
      .dg-repo-row input{margin:3px 0 0;accent-color:var(--dsw-alias-brand-primary);flex:none}
      .dg-repo-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
      .dg-repo-name{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-repo-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dg-manager-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px}
      .dg-manager-spacer{flex:1}
      .dg-spin{animation:dg-spin .9s linear infinite}
      @keyframes dg-spin{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion: reduce){.dg-spin{animation:none}}
      @media (max-width:900px){
        .dg-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(260px,42%) minmax(0,1fr)}
        .dg-side{border-right:0;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
        .dg-subtitle{max-width:60vw}
      }
      @container (max-width:820px){
        .dg-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(260px,42%) minmax(0,1fr)}
        .dg-side{border-right:0;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
      }
      @container (max-width:600px){
        .dg-busy{display:none}
        .dg-subtitle{display:none}
      }
    `

    //#endregion

    //#region helpers

    function cx(...values) {
      return values.filter(Boolean).join(' ')
    }

    function readLocal(key) {
      try {
        return window.localStorage.getItem(key)
      } catch {
        return null
      }
    }

    function writeLocal(key, value) {
      try {
        if (value === null || value === undefined || value === '') window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, String(value))
      } catch {
        /* storage can be unavailable in a hardened page; drafts are optional */
      }
    }

    /** Persisted model override for AI commit messages; null means "default". */
    function readModelSelection() {
      const raw = readLocal(MODEL_KEY)
      if (raw === null || raw === '') return null
      try {
        const parsed = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object'
          && typeof parsed.provider === 'string' && parsed.provider !== ''
          && typeof parsed.model === 'string' && parsed.model !== '') {
          return { provider: parsed.provider, model: parsed.model }
        }
      } catch {
        /* fall through to the default */
      }
      return null
    }

    function writeModelSelection(selection) {
      if (selection === null) {
        writeLocal(MODEL_KEY, null)
        return
      }
      writeLocal(MODEL_KEY, JSON.stringify({ provider: selection.provider, model: selection.model }))
    }

    function modelKey(provider, model) {
      return `${provider}${MODEL_SEPARATOR}${model}`
    }

    function parseModelKey(value) {
      if (typeof value !== 'string') return null
      const index = value.indexOf(MODEL_SEPARATOR)
      if (index <= 0 || index === value.length - 1) return null
      return { provider: value.slice(0, index), model: value.slice(index + 1) }
    }

    /** Persisted repository selection for one Workspace: null when never saved. */
    function readEnabledList(workspace) {
      if (typeof workspace !== 'string' || workspace === '') return null
      const raw = readLocal(ENABLED_PREFIX + workspace)
      if (raw === null) return null
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : null
      } catch {
        return null
      }
    }

    function writeEnabledList(workspace, list) {
      if (typeof workspace !== 'string' || workspace === '') return
      writeLocal(ENABLED_PREFIX + workspace, JSON.stringify(list))
    }

    function readActiveRepo(workspace) {
      if (typeof workspace !== 'string' || workspace === '') return null
      return readLocal(ACTIVE_PREFIX + workspace)
    }

    function writeActiveRepo(workspace, repoPath) {
      if (typeof workspace !== 'string' || workspace === '') return
      writeLocal(ACTIVE_PREFIX + workspace, repoPath)
    }

    function samePath(left, right) {
      if (typeof left !== 'string' || typeof right !== 'string') return false
      const a = left.replace(/\\/g, '/').replace(/\/+$/, '')
      const b = right.replace(/\\/g, '/').replace(/\/+$/, '')
      const windows = left.includes('\\') || right.includes('\\')
        || /^[A-Za-z]:\//.test(a) || /^[A-Za-z]:\//.test(b)
      return windows ? a.toLowerCase() === b.toLowerCase() : a === b
    }

    function baseName(value) {
      const text = String(value ?? '').replace(/[\\/]+$/, '')
      const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
      return index === -1 ? text : text.slice(index + 1)
    }

    function splitPath(value) {
      const text = String(value ?? '')
      const index = text.lastIndexOf('/')
      return index === -1
        ? { dir: '', base: text }
        : { dir: text.slice(0, index + 1), base: text.slice(index + 1) }
    }

    /** A rename touches two pathspecs; every mutation must carry both. */
    function entryPaths(entry) {
      if (entry === null || entry === undefined) return []
      const paths = [entry.path]
      if (typeof entry.originalPath === 'string' && entry.originalPath !== '' && entry.originalPath !== entry.path) {
        paths.push(entry.originalPath)
      }
      return paths
    }

    function statusKey(status) {
      switch (status) {
        case 'M': return 'modified'
        case 'A': return 'added'
        case 'D': return 'deleted'
        case 'R': return 'renamed'
        case 'C': return 'copied'
        case 'U': return 'untracked'
        case '!': return 'conflicted'
        case 'T': return 'typeChanged'
        default: return 'modified'
      }
    }

    function relativeTime(iso, t) {
      if (!iso) return ''
      const time = Date.parse(iso)
      if (Number.isNaN(time)) return String(iso)
      const seconds = Math.max(0, Math.round((Date.now() - time) / 1000))
      if (seconds < 60) return t('justNow')
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return t('minutesAgo', { n: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return t('hoursAgo', { n: hours })
      const days = Math.round(hours / 24)
      if (days < 30) return t('daysAgo', { n: days })
      try {
        return new Date(time).toLocaleDateString()
      } catch {
        return String(iso)
      }
    }

    function summarizePatch(diff) {
      if (diff === null || diff === undefined) return null
      const files = Array.isArray(diff.files) ? diff.files : []
      let added = 0
      let removed = 0
      for (const file of files) {
        const lines = Array.isArray(file.lines) ? file.lines : []
        for (const line of lines) {
          if (line.kind === 'add') added += 1
          if (line.kind === 'del') removed += 1
        }
      }
      return { files: files.length, added, removed }
    }

    //#endregion

    //#region icons

    function makeIcon(children) {
      return function Icon({ size = 14, className }) {
        return h('svg', {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          className,
          style: { display: 'block', flex: 'none' },
        }, ...children)
      }
    }

    const GitMark = makeIcon([
      h('circle', { key: 'a', cx: 4, cy: 3.5, r: 1.7 }),
      h('circle', { key: 'b', cx: 4, cy: 12.5, r: 1.7 }),
      h('circle', { key: 'c', cx: 12, cy: 6, r: 1.7 }),
      h('path', { key: 'd', d: 'M4 5.2v5.6' }),
      h('path', { key: 'e', d: 'M12 7.7v1.1a3.2 3.2 0 0 1-3.2 3.2H5.7' }),
    ])
    const ChevronDown = makeIcon([h('path', { key: 'a', d: 'M4 6l4 4 4-4' })])
    const ChevronRight = makeIcon([h('path', { key: 'a', d: 'M6 3.5l4.5 4.5L6 12.5' })])
    const RefreshIcon = makeIcon([
      h('path', { key: 'a', d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.8' }),
      h('path', { key: 'b', d: 'M13.2 2.6v3.2H10' }),
    ])
    const PlusIcon = makeIcon([h('path', { key: 'a', d: 'M8 3v10M3 8h10' })])
    const MinusIcon = makeIcon([h('path', { key: 'a', d: 'M3 8h10' })])
    const TrashIcon = makeIcon([
      h('path', { key: 'a', d: 'M3 4.8h10' }),
      h('path', { key: 'b', d: 'M6.4 4.8V3.3h3.2v1.5' }),
      h('path', { key: 'c', d: 'M4.6 4.8l.6 8.2h5.6l.6-8.2' }),
    ])
    const UndoIcon = makeIcon([
      h('path', { key: 'a', d: 'M3.4 6.6h5.2a3.2 3.2 0 1 1 0 6.4H5.8' }),
      h('path', { key: 'b', d: 'M3.4 6.6l2.7-2.7M3.4 6.6l2.7 2.7' }),
    ])
    const CloudIcon = makeIcon([
      h('path', { key: 'a', d: 'M4.4 11.4a2.9 2.9 0 0 1 .2-5.8 3.6 3.6 0 0 1 6.9.9 2.5 2.5 0 0 1 .1 4.9' }),
      h('path', { key: 'b', d: 'M8 7.2v4.6M6.1 9.9L8 11.8l1.9-1.9' }),
    ])
    const ArrowDownIcon = makeIcon([
      h('path', { key: 'a', d: 'M8 2.8v10.4' }),
      h('path', { key: 'b', d: 'M4.4 9.6L8 13.2l3.6-3.6' }),
    ])
    const ArrowUpIcon = makeIcon([
      h('path', { key: 'a', d: 'M8 13.2V2.8' }),
      h('path', { key: 'b', d: 'M4.4 6.4L8 2.8l3.6 3.6' }),
    ])
    const CheckIcon = makeIcon([h('path', { key: 'a', d: 'M3.2 8.4l3 3 6.6-6.8' })])
    const FolderIcon = makeIcon([
      h('path', { key: 'a', d: 'M2.4 4.4h4l1.3 1.6h5.9v6.6h-11.2z' }),
    ])
    const WarningIcon = makeIcon([
      h('path', { key: 'a', d: 'M8 2.4l6 11.2H2z' }),
      h('path', { key: 'b', d: 'M8 6.2v3.4M8 11.3v.1' }),
    ])
    const CommitIcon = makeIcon([
      h('circle', { key: 'a', cx: 8, cy: 8, r: 2.7 }),
      h('path', { key: 'b', d: 'M2.2 8h3.1M10.7 8h3.1' }),
    ])
    const FileIcon = makeIcon([
      h('path', { key: 'a', d: 'M4 2.4h5l3 3v8.2H4z' }),
      h('path', { key: 'b', d: 'M9 2.4v3h3' }),
    ])
    const ListIcon = makeIcon([
      h('path', { key: 'a', d: 'M2.5 4h11M2.5 8h11M2.5 12h11' }),
    ])
    const SparklesIcon = makeIcon([
      h('path', { key: 'a', d: 'M8 2.2l1.2 3.2 3.2 1.2-3.2 1.2L8 11l-1.2-3.2L3.6 6.6l3.2-1.2z' }),
      h('path', { key: 'b', d: 'M12.6 10.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z' }),
    ])
    const CloseIcon = makeIcon([h('path', { key: 'a', d: 'M4 4l8 8M12 4l-8 8' })])

    //#endregion

    //#region primitives

    function Spinner({ size = 14 }) {
      return h('span', { className: 'dg-spin', style: { display: 'inline-flex' } }, h(RefreshIcon, { size }))
    }

    function IconButton({
      title, onClick, disabled, children, className, ariaLabel,
    }) {
      return h('button', {
        type: 'button',
        className: cx('dg-icon-btn', className),
        title,
        'aria-label': ariaLabel ?? title,
        onClick,
        disabled,
      }, children)
    }

    function Button({
      variant = 'default', onClick, disabled, children, title, type = 'button',
    }) {
      return h('button', {
        type,
        className: cx('dg-btn', variant === 'primary' && 'dg-btn-primary', variant === 'ghost' && 'dg-btn-ghost', variant === 'danger' && 'dg-btn-danger'),
        onClick,
        disabled,
        title,
      }, children)
    }

    function StatusBadge({ status, title }) {
      return h('span', { className: 'dg-status', 'data-s': status, title }, status)
    }

    function Menu({
      open, onClose, children, align = 'left', role = 'menu', label,
    }) {
      const ref = useRef(null)
      useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (ref.current !== null && !ref.current.contains(event.target)) onClose()
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open, onClose])
      if (!open) return null
      return h('div', {
        ref,
        className: 'dg-menu',
        role,
        'aria-label': label,
        style: align === 'right' ? { left: 'auto', right: 0 } : undefined,
      }, children)
    }

    function EmptyState({ icon, title, text, children }) {
      return h('div', { className: 'dg-empty' },
        h('span', { className: 'dg-empty-glyph' }, icon ?? h(GitMark, { size: 22 })),
        h('span', { className: 'dg-empty-title' }, title),
        text !== undefined && text !== null ? h('span', { className: 'dg-empty-text' }, text) : null,
        children)
    }

    //#endregion

    //#region diff

    const HIDDEN_META = /^(diff --git |diff --cc |diff --combined |index |--- |\+\+\+ |similarity index )/

    function DiffLine({ line }) {
      if (line.kind === 'hunk') {
        return h('div', { className: 'dg-hunk-row' }, line.text)
      }
      if (line.kind === 'meta' || line.kind === 'note') {
        return h('div', { className: 'dg-meta-row' }, line.text)
      }
      const sign = line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
      return h('div', { className: cx('dg-line', `dg-line-${line.kind}`) },
        h('span', { className: 'dg-ln' }, line.oldLine === undefined ? '' : line.oldLine),
        h('span', { className: 'dg-ln' }, line.newLine === undefined ? '' : line.newLine),
        h('span', { className: 'dg-sign' }, sign),
        h('span', { className: 'dg-code' }, line.text))
    }

    function DiffFile({ file, t, showHeader }) {
      const [expanded, setExpanded] = useState(false)
      const source = Array.isArray(file.lines) ? file.lines : []
      const visible = useMemo(
        () => source.filter((line) => !(line.kind === 'meta' && HIDDEN_META.test(line.text))),
        [source],
      )
      const limited = !expanded && visible.length > RENDER_LINES
      const shown = limited ? visible.slice(0, RENDER_LINES) : visible
      const hasBody = visible.length > 0
      return h('div', { className: 'dg-file-block' },
        showHeader
          ? h('div', { className: 'dg-file-block-head' },
            h(FileIcon, { size: 13 }),
            h('span', { className: 'dg-file-block-path', title: file.path }, file.path),
            file.originalPath !== null && file.originalPath !== undefined && file.originalPath !== file.path
              ? h('span', { className: 'dg-file-block-orig' }, `← ${file.originalPath}`)
              : null,
            file.binary ? h('span', { className: 'dg-tag' }, t('binaryDiff')) : null)
          : null,
        file.binary
          ? h('div', { className: 'dg-meta-row' }, t('binaryDiff'))
          : hasBody
            ? shown.map((line, index) => h(DiffLine, { key: index, line }))
            : h('div', { className: 'dg-meta-row' }, t('noDiff')),
        limited
          ? h('div', { className: 'dg-diff-more' },
            h(Button, {
              variant: 'ghost',
              onClick: () => setExpanded(true),
            }, t('showAll', { n: visible.length })))
          : null)
    }

    function DiffPane({
      t, selected, bothGroups, snapshot, diff, diffPhase, diffError,
      busy, onSelectGroup, onStage, onUnstage, onRefresh, onBack,
    }) {
      const isCommit = selected !== null && selected.kind === 'commit'
      const title = isCommit
        ? t('commitDetails', { hash: selected.hash.slice(0, 7) })
        : selected !== null ? selected.path : t('selectFile')
      const summary = useMemo(() => summarizePatch(diff), [diff])
      const canToggle = !isCommit && bothGroups.unstaged && bothGroups.staged
      const bodyRef = useRef(null)

      useEffect(() => {
        if (bodyRef.current !== null) {
          bodyRef.current.scrollTop = 0
          bodyRef.current.scrollLeft = 0
        }
      }, [selected])

      let body
      if (selected === null) {
        body = h(EmptyState, {
          icon: h(GitMark, { size: 22 }),
          title: t('selectFile'),
          text: t('selectFileHint'),
        })
      } else if (diffPhase === 'loading' && diff === null) {
        body = h(EmptyState, { icon: h(Spinner, { size: 20 }), title: t('loading') })
      } else if (diffPhase === 'error') {
        body = h('div', { style: { padding: '16px' } },
          h('div', { className: 'dg-banner dg-banner-error' },
            h(WarningIcon, { size: 14 }),
            h('span', { className: 'dg-banner-text' }, diffError ?? t('diffFailed')),
            h(Button, { variant: 'ghost', onClick: onRefresh }, t('retry'))))
      } else if (diff === null) {
        body = h(EmptyState, { icon: h(Spinner, { size: 20 }), title: t('loading') })
      } else {
        const files = Array.isArray(diff.files) ? diff.files : []
        body = h('div', null,
          files.length === 0
            ? h(EmptyState, {
              icon: h(FileIcon, { size: 20 }),
              title: t('noDiff'),
            })
            : files.map((file, index) => h(DiffFile, {
              key: `${file.path}:${index}`,
              file,
              t,
              showHeader: isCommit || files.length > 1,
            })),
          diff.truncated ? h('div', { className: 'dg-meta-row' }, t('truncated')) : null)
      }

      return h('section', { className: 'dg-diff' },
        h('div', { className: 'dg-diff-head' },          h('div', { className: 'dg-diff-title' },
            isCommit
              ? h(CommitIcon, { size: 14 })
              : selected !== null
                ? h(StatusBadge, {
                  status: selected.status ?? 'M',
                  title: t(statusKey(selected.status ?? 'M')),
                })
                : h(FileIcon, { size: 14 }),
            h('span', { className: 'dg-diff-path', title }, title),
            !isCommit && selected !== null && summary !== null && summary.added + summary.removed > 0
              ? h('span', { className: 'dg-diff-sub' }, `+${summary.added} −${summary.removed}`)
              : null,
            canToggle
              ? h('div', { className: 'dg-seg', role: 'group' },
                h('button', {
                  type: 'button',
                  className: 'dg-seg-btn',
                  'data-on': selected.group === 'unstaged',
                  onClick: () => onSelectGroup('unstaged'),
                }, t('workingTree')),
                h('button', {
                  type: 'button',
                  className: 'dg-seg-btn',
                  'data-on': selected.group === 'staged',
                  onClick: () => onSelectGroup('staged'),
                }, t('stagedVersion')))
              : null),
          h('div', { className: 'dg-diff-actions' },
            isCommit
              ? h(Button, { variant: 'ghost', onClick: onBack }, t('backToChanges'))
              : selected !== null
                ? (selected.group === 'staged'
                  ? h(Button, {
                    onClick: () => onUnstage(entryPaths(selected)),
                    disabled: Boolean(busy),
                    title: t('unstage'),
                  }, h(MinusIcon, { size: 12 }), t('unstage'))
                  : h(Button, {
                    onClick: () => onStage(entryPaths(selected)),
                    disabled: Boolean(busy),
                    title: selected.group === 'conflicts' ? t('markResolved') : t('stage'),
                  }, h(PlusIcon, { size: 12 }), selected.group === 'conflicts' ? t('markResolved') : t('stage')))
                : null,
            h(IconButton, {
              title: t('refresh'),
              onClick: onRefresh,
              disabled: Boolean(busy),
            }, busy ? h(Spinner, { size: 13 }) : h(RefreshIcon, { size: 13 })))),
        isCommit && diff !== null && diff.commit !== undefined
          ? h('div', { className: 'dg-commit-detail' },
            h('span', { className: 'dg-commit-detail-subject' }, diff.commit.subject),
            h('span', { className: 'dg-commit-detail-meta' },
              `${diff.commit.author} · ${relativeTime(diff.commit.date, t)} · ${diff.commit.short}`))
          : null,
        h('div', { className: 'dg-diff-body', ref: bodyRef }, body))
    }

    //#endregion

    //#region lists

    function FileRow({
      t, entry, group, active, onSelect, onStage, onUnstage, onDiscard, busy,
    }) {
      const { dir, base } = splitPath(entry.path)
      return h('div', { className: 'dg-file', 'data-active': active ? 'true' : 'false' },
        h('button', {
          type: 'button',
          className: 'dg-file-main',
          onClick: () => onSelect(entry, group),
          title: entry.path,
        },
        h(StatusBadge, { status: entry.status, title: t(statusKey(entry.status)) }),
        h('span', { className: 'dg-file-name' },
          dir !== '' ? h('span', { className: 'dg-dir' }, dir) : null,
          base),
        entry.originalPath !== null && entry.originalPath !== undefined && entry.originalPath !== entry.path
          ? h('span', { className: 'dg-file-orig', title: entry.originalPath }, `← ${entry.originalPath}`)
          : null),
        h('div', { className: 'dg-file-actions' },
          group === 'staged'
            ? h(IconButton, {
              title: t('unstage'),
              onClick: () => onUnstage(entryPaths(entry)),
              disabled: Boolean(busy),
            }, h(MinusIcon, { size: 12 }))
            : h(IconButton, {
              title: group === 'conflicts' ? t('markResolved') : t('stage'),
              onClick: () => onStage(entryPaths(entry)),
              disabled: Boolean(busy),
            }, h(PlusIcon, { size: 12 })),
          group === 'unstaged'
            ? h(IconButton, {
              title: t('discard'),
              onClick: () => onDiscard([entry]),
              disabled: Boolean(busy),
            }, h(UndoIcon, { size: 12 }))
            : null))
    }

    function FileSection({
      t, title, entries, open, onToggle, emptyText, actionIcon, actionTitle, onAction,
      group, selected, onSelect, onStage, onUnstage, onDiscard, busy,
    }) {
      return h('section', { className: 'dg-section' },
        h('div', { className: 'dg-section-head' },
          h('button', {
            type: 'button',
            className: 'dg-section-toggle',
            'aria-expanded': open,
            onClick: onToggle,
          },
          open ? h(ChevronDown, { size: 11 }) : h(ChevronRight, { size: 11 }),
          h('span', { className: 'dg-section-title' }, title),
          h('span', { className: 'dg-count' }, entries.length)),
          actionIcon !== undefined
            ? h(IconButton, {
              title: actionTitle,
              onClick: onAction,
              disabled: entries.length === 0 || Boolean(busy),
            }, actionIcon)
            : null),
        open
          ? (entries.length === 0
            ? h('div', { className: 'dg-section-empty' }, emptyText)
            : entries.map((entry) => h(FileRow, {
              key: `${group}:${entry.path}`,
              t,
              entry,
              group,
              active: selected !== null && selected.kind === 'file' && selected.group === group && selected.path === entry.path,
              onSelect,
              onStage,
              onUnstage,
              onDiscard,
              busy,
            })))
          : null)
    }

    function HistorySection({
      t, commits, open, onToggle, selected, onSelect,
    }) {
      return h('section', { className: 'dg-section' },
        h('div', { className: 'dg-section-head' },
          h('button', {
            type: 'button',
            className: 'dg-section-toggle',
            'aria-expanded': open,
            onClick: onToggle,
          },
          open ? h(ChevronDown, { size: 11 }) : h(ChevronRight, { size: 11 }),
          h('span', { className: 'dg-section-title' }, t('history')),
          h('span', { className: 'dg-count' }, commits.length))),
        open
          ? (commits.length === 0
            ? h('div', { className: 'dg-section-empty' }, t('noCommits'))
            : commits.map((commitEntry) => h('button', {
              key: commitEntry.hash,
              type: 'button',
              className: 'dg-commit-row-button',
              'data-active': selected !== null && selected.kind === 'commit' && selected.hash === commitEntry.hash ? 'true' : 'false',
              style: selected !== null && selected.kind === 'commit' && selected.hash === commitEntry.hash
                ? { background: 'var(--dsw-alias-bg-layer-2)' }
                : undefined,
              onClick: () => onSelect(commitEntry),
            },
            h('span', { className: 'dg-commit-line' },
              h('span', { className: 'dg-hash' }, commitEntry.short),
              h('span', { className: 'dg-subject', title: commitEntry.subject }, commitEntry.subject)),
            h('span', { className: 'dg-commit-meta' },
              `${commitEntry.author} · ${relativeTime(commitEntry.date, t)}`))))
          : null)
    }

    //#endregion

    //#region panel

    function CommitBox({
      t, message, onMessage, amend, onAmend, stagedCount, unstagedCount,
      canCommit, canGenerate, generating, busy, onCommit, onStageAll, onGenerate, textareaRef,
      modelCatalog, modelSelection, modelError, onModelChange,
    }) {
      const onKeyDown = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          onCommit()
        }
      }
      const models = Array.isArray(modelCatalog?.models) ? modelCatalog.models : []
      const providers = Array.isArray(modelCatalog?.providers) ? modelCatalog.providers : []
      const selectedKey = modelSelection === null ? '' : modelKey(modelSelection.provider, modelSelection.model)
      const defaultSelection = modelCatalog?.default ?? null
      const defaultModel = defaultSelection === null
        ? null
        : models.find((model) => model.provider === defaultSelection.provider && model.model === defaultSelection.model) ?? null
      const defaultLabel = defaultModel === null
        ? t('modelDefault')
        : `${t('modelDefault')} · ${defaultModel.name}`
      const modelDisabled = modelCatalog === null || models.length === 0
      const modelTitle = modelError !== null && modelError !== undefined
        ? t('modelsUnavailable')
        : modelCatalog === null
          ? t('modelsLoading')
          : models.length === 0 ? t('modelsUnavailable') : t('modelHint')
      return h('div', { className: 'dg-commit' },
        h('div', { className: 'dg-model-row' },
          h('span', { className: 'dg-model-label' }, t('aiModel')),
          h('select', {
            className: 'dg-model-select',
            value: selectedKey,
            disabled: modelDisabled,
            title: modelTitle,
            'aria-label': t('aiModel'),
            onChange: (event) => {
              const value = event.target.value
              if (value === '') {
                onModelChange(null)
                return
              }
              const parsed = parseModelKey(value)
              if (parsed !== null) onModelChange(parsed)
            },
          },
          h('option', { value: '' }, defaultLabel),
          providers.map((provider) => {
            const group = models.filter((model) => model.provider === provider.id)
            if (group.length === 0) return null
            return h('optgroup', { key: provider.id, label: provider.name },
              group.map((model) => h('option', {
                key: modelKey(provider.id, model.model),
                value: modelKey(provider.id, model.model),
              }, model.name)))
          }))),
        h('textarea', {
          ref: textareaRef,
          className: 'dg-textarea',
          value: message,
          placeholder: t('commitPlaceholder'),
          'aria-label': t('commitPlaceholder'),
          rows: 3,
          spellCheck: false,
          onChange: (event) => onMessage(event.target.value),
          onKeyDown,
        }),
        h('div', { className: 'dg-commit-row' },
          h('label', { className: 'dg-check', title: t('amendHint') },
            h('input', {
              type: 'checkbox',
              checked: amend,
              onChange: (event) => onAmend(event.target.checked),
            }),
            t('amend')),
          h('span', { className: 'dg-commit-count' }, t('stagedCount', { n: stagedCount }))),
        h('div', { className: 'dg-commit-actions' },
          h(Button, {
            variant: 'ghost',
            onClick: onGenerate,
            disabled: generating || Boolean(busy) || !canGenerate,
            title: generating
              ? t('generatingMessage')
              : canGenerate ? t('generateHint') : t('noChangesHint'),
          },
          generating ? h(Spinner, { size: 12 }) : h(SparklesIcon, { size: 12 }),
          t('generateMessage')),
          unstagedCount > 0
            ? h(Button, {
              variant: 'ghost',
              onClick: onStageAll,
              disabled: Boolean(busy),
              title: t('stageAll'),
            }, t('stageAll'))
            : null,
          h(Button, {
            variant: 'primary',
            onClick: onCommit,
            disabled: !canCommit,
            title: stagedCount === 0
              ? t('nothingStaged')
              : message.trim() === '' ? t('commitMessageRequired') : undefined,
          }, busy === t('committing') ? h(Spinner, { size: 12 }) : h(CommitIcon, { size: 12 }), t('commit'))))
    }

    function DiscardDialog({ t, targets, onCancel, onConfirm, busy }) {
      const cancelRef = useRef(null)
      useEffect(() => {
        cancelRef.current?.focus?.()
      }, [])
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [onCancel])
      const untracked = targets.some((entry) => entry.untracked === true)
      return h('div', {
        className: 'dg-modal-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onCancel()
        },
      },
      h('div', {
        className: 'dg-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('discardTitle'),
      },
      h('span', { className: 'dg-modal-title' }, t('discardTitle')),
      h('span', { className: 'dg-modal-text' }, untracked ? t('discardUntrackedText') : t('discardText')),
      h('span', { className: 'dg-modal-path' },
        targets.length === 1 ? targets[0].path : t('filesCount', { n: targets.length })),
      h('div', { className: 'dg-modal-actions' },
        h('button', {
          type: 'button',
          ref: cancelRef,
          className: 'dg-btn',
          onClick: onCancel,
        }, t('cancel')),
        h('button', {
          type: 'button',
          className: 'dg-btn dg-btn-danger',
          onClick: onConfirm,
          disabled: Boolean(busy),
        }, t('discardConfirm')))))
    }

    function UpstreamDialog({
      t, repo, remotes, remote, branch, branches, phase, error, busy,
      onRemote, onBranch, onCancel, onSave,
    }) {
      const cancelRef = useRef(null)
      useEffect(() => {
        cancelRef.current?.focus?.()
      }, [])
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [onCancel])
      const canSave = remote !== '' && branch !== '' && branches.includes(branch) && phase === 'ready' && !busy
      return h('div', {
        className: 'dg-modal-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onCancel()
        },
      },
      h('div', {
        className: 'dg-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('setUpstreamTitle'),
      },
      h('span', { className: 'dg-modal-title' }, t('setUpstreamTitle')),
      h('span', { className: 'dg-modal-text' }, t('setUpstreamText', { branch: repo?.branch ?? '' })),
      remotes.length === 0
        ? h('span', { className: 'dg-modal-text' }, t('noRemotes'))
        : h(React.Fragment, null,
          h('label', { className: 'dg-field' },
            h('span', { className: 'dg-field-label' }, t('remote')),
            h('select', {
              className: 'dg-input dg-select',
              value: remote,
              disabled: Boolean(busy),
              onChange: (event) => onRemote(event.target.value),
            },
            remotes.map((entry) => h('option', { key: entry.name, value: entry.name },
              entry.url ? `${entry.name} — ${entry.url}` : entry.name)))),
          h('label', { className: 'dg-field' },
            h('span', { className: 'dg-field-label' }, t('remoteBranch')),
            h('select', {
              className: 'dg-input dg-select',
              value: branch,
              disabled: Boolean(busy) || phase === 'loading' || branches.length === 0,
              onChange: (event) => onBranch(event.target.value),
            },
            phase === 'loading'
              ? h('option', { value: '' }, t('loadingBranches'))
              : branches.length === 0
                ? h('option', { value: '' }, t('noRemoteBranches'))
                : branches.map((name) => h('option', { key: name, value: name }, name))))),
      error !== null ? h('span', { className: 'dg-modal-error' }, error) : null,
      h('div', { className: 'dg-modal-actions' },
        h('button', {
          type: 'button',
          ref: cancelRef,
          className: 'dg-btn',
          onClick: onCancel,
        }, t('cancel')),
        h('button', {
          type: 'button',
          className: 'dg-btn dg-btn-primary',
          onClick: onSave,
          disabled: !canSave,
        }, busy === t('savingUpstream') ? h(Spinner, { size: 12 }) : null, t('save')))))
    }

    function RepoManager({
      t, workspaceTitle, workspacePath, discovered, enabled, scanPhase, scanError, scanTruncated,
      onToggle, onSelectAll, onClear, onRescan, onClose,
    }) {
      const closeRef = useRef(null)
      useEffect(() => {
        closeRef.current?.focus?.()
      }, [])
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [onClose])
      const selected = enabled ?? []
      return h('div', {
        className: 'dg-modal-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose()
        },
      },
      h('div', {
        className: 'dg-modal dg-modal-wide',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('repositoriesTitle', { workspace: workspaceTitle }),
      },
      h('span', { className: 'dg-modal-title' }, t('repositoriesTitle', { workspace: workspaceTitle })),
      h('span', { className: 'dg-modal-text' }, t('repositoriesHint')),
      h('div', { className: 'dg-manager-meta' },
        h('span', null, t('detectedRepos', { n: discovered.length })),
        scanPhase === 'loading' ? h(Spinner, { size: 12 }) : null),
      scanPhase === 'loading' && discovered.length === 0
        ? h('div', { className: 'dg-repo-list' },
          h('div', { className: 'dg-repo-row' }, h(Spinner, { size: 14 }), h('span', { className: 'dg-repo-name' }, t('scanning'))))
        : discovered.length === 0
          ? h('div', { className: 'dg-repo-list' },
            h('div', { className: 'dg-repo-row' }, h('span', { className: 'dg-repo-name' }, t('noRepositoriesFound'))))
          : h('div', { className: 'dg-repo-list' },
            discovered.map((repoEntry) => h('label', { key: repoEntry.path, className: 'dg-repo-row' },
              h('input', {
                type: 'checkbox',
                checked: selected.some((path) => samePath(path, repoEntry.path)),
                onChange: () => onToggle(repoEntry),
              }),
              h('span', { className: 'dg-repo-main' },
                h('span', { className: 'dg-repo-name' },
                  repoEntry.relativePath === '.' ? t('rootRepository') : repoEntry.name),
                h('span', { className: 'dg-repo-path', title: repoEntry.path },
                  repoEntry.relativePath === '.' ? workspacePath : repoEntry.relativePath))))),
      scanTruncated ? h('span', { className: 'dg-manager-meta' }, t('scanTruncated')) : null,
      scanError !== null
        ? h('span', { className: 'dg-banner dg-banner-error' }, h('span', { className: 'dg-banner-text' }, scanError))
        : null,
      h('div', { className: 'dg-manager-actions' },
        h(Button, { onClick: onRescan, disabled: scanPhase === 'loading' }, t('scanAgain')),
        h(Button, { onClick: onSelectAll, disabled: discovered.length === 0 || scanPhase === 'loading' }, t('selectAll')),
        h(Button, { onClick: onClear, disabled: selected.length === 0 }, t('clearSelection')),
        h('span', { className: 'dg-manager-spacer' }),
        h('button', {
          type: 'button',
          ref: closeRef,
          className: 'dg-btn dg-btn-primary',
          onClick: onClose,
        }, t('close')))))
    }

    function GitPanel({ t, call, getLocaleId }) {
      const [repos, setRepos] = useState(null)
      const [reposNonce, setReposNonce] = useState(0)
      const [workspacePath, setWorkspacePath] = useState(() => readLocal(WORKSPACE_KEY) ?? readLocal(REPO_KEY))
      const [discovered, setDiscovered] = useState([])
      const [scanPhase, setScanPhase] = useState('idle')
      const [scanError, setScanError] = useState(null)
      const [scanTruncated, setScanTruncated] = useState(false)
      const [scanNonce, setScanNonce] = useState(0)
      const [enabled, setEnabled] = useState(null)
      const [activeRepoPath, setActiveRepoPath] = useState(null)
      const [managerOpen, setManagerOpen] = useState(false)
      const [snapshot, setSnapshot] = useState(null)
      const [phase, setPhase] = useState('loading')
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(null)
      const [selected, setSelected] = useState(null)
      const [diff, setDiff] = useState(null)
      const [diffPhase, setDiffPhase] = useState('idle')
      const [diffError, setDiffError] = useState(null)
      const [diffNonce, setDiffNonce] = useState(0)
      const [message, setMessage] = useState('')
      const [generatingMessage, setGeneratingMessage] = useState(false)
      const [amend, setAmend] = useState(false)
      const [menu, setMenu] = useState(null)
      const [branchDraft, setBranchDraft] = useState('')
      const [discardTargets, setDiscardTargets] = useState(null)
      const [openSections, setOpenSections] = useState({ conflicts: true, staged: true, changes: true, history: true })
      const [modelCatalog, setModelCatalog] = useState(null)
      const [modelSelection, setModelSelection] = useState(readModelSelection)
      const [modelError, setModelError] = useState(null)
      const [upstreamOpen, setUpstreamOpen] = useState(false)
      const [upstreamRemote, setUpstreamRemote] = useState('')
      const [upstreamBranch, setUpstreamBranch] = useState('')
      const [upstreamBranches, setUpstreamBranches] = useState([])
      const [upstreamPhase, setUpstreamPhase] = useState('idle')
      const [upstreamError, setUpstreamError] = useState(null)

      const busyRef = useRef(null)
      busyRef.current = busy
      const stateSeq = useRef(0)
      const statePending = useRef(0)
      const diffSeq = useRef(0)
      const sideRef = useRef(null)
      const messageRef = useRef(null)
      const messageSeq = useRef(0)
      const enabledRef = useRef(enabled)
      enabledRef.current = enabled
      const activeRepoRef = useRef(activeRepoPath)
      activeRepoRef.current = activeRepoPath
      const scannedWorkspaceRef = useRef(null)

      /** A persisted model is usable only while the catalog still offers it. */
      const effectiveModel = useMemo(() => {
        if (modelSelection === null) return null
        const models = Array.isArray(modelCatalog?.models) ? modelCatalog.models : null
        if (models === null) return null
        return models.some((model) => model.provider === modelSelection.provider && model.model === modelSelection.model)
          ? modelSelection
          : null
      }, [modelCatalog, modelSelection])

      const changeModel = useCallback((selection) => {
        setModelSelection(selection)
        writeModelSelection(selection)
      }, [])

      useEffect(() => {
        if (sideRef.current !== null) sideRef.current.scrollTop = 0
      }, [activeRepoPath])

      const loadState = useCallback(async ({ quiet = false } = {}) => {
        if (!activeRepoPath) return null
        if (quiet && statePending.current > 0) return null
        const seq = ++stateSeq.current
        statePending.current += 1
        if (!quiet) setPhase((current) => (current === 'ready' ? current : 'loading'))
        try {
          const value = await call('state', { cwd: activeRepoPath })
          if (seq !== stateSeq.current) return null
          setSnapshot(value)
          setPhase('ready')
          if (!quiet) setError(null)
          return value
        } catch (failure) {
          if (seq !== stateSeq.current) return null
          const message = failure?.message ?? String(failure)
          if (quiet) {
            console.warn('[dsh-git] background refresh failed:', message)
            return null
          }
          setPhase('error')
          setError(message)
          return null
        } finally {
          statePending.current -= 1
        }
      }, [call, activeRepoPath])

      // 1. Read the Workspace roster once, then pick the remembered workspace.
      useEffect(() => {
        let alive = true
        call('repos', {}).then((value) => {
          if (!alive) return
          const list = Array.isArray(value?.workspaces) ? value.workspaces : []
          setRepos(list)
          setWorkspacePath((current) => {
            const remembered = current === null ? undefined : list.find((repo) => samePath(repo.path, current))
            return remembered !== undefined ? remembered.path : (list[0]?.path ?? null)
          })
        }).catch((failure) => {
          if (!alive) return
          setRepos([])
          setPhase('error')
          setError(failure?.message ?? String(failure))
        })
        return () => { alive = false }
      }, [call, reposNonce])

      useEffect(() => {
        if (workspacePath) writeLocal(WORKSPACE_KEY, workspacePath)
      }, [workspacePath])

      // 1b. Read the model catalog used by the commit-message picker.
      useEffect(() => {
        let alive = true
        call('models', {}).then((value) => {
          if (!alive) return
          setModelCatalog(value !== null && typeof value === 'object' ? value : null)
          setModelError(null)
        }).catch((failure) => {
          if (!alive) return
          setModelCatalog(null)
          setModelError(failure?.message ?? String(failure))
        })
        return () => { alive = false }
      }, [call])

      // 1c. Load the remote branches while the upstream dialog is open.
      useEffect(() => {
        if (!upstreamOpen || !activeRepoPath || upstreamRemote === '') return undefined
        let alive = true
        setUpstreamPhase('loading')
        setUpstreamError(null)
        call('remoteBranches', { cwd: activeRepoPath, remote: upstreamRemote }).then((value) => {
          if (!alive) return
          const list = Array.isArray(value?.branches)
            ? value.branches.filter((name) => typeof name === 'string' && name !== '')
            : []
          setUpstreamBranches(list)
          setUpstreamPhase('ready')
          setUpstreamBranch((current) => {
            if (current !== '' && list.includes(current)) return current
            const currentBranch = snapshot?.repo?.branch
            if (typeof currentBranch === 'string' && list.includes(currentBranch)) return currentBranch
            return list[0] ?? ''
          })
        }).catch((failure) => {
          if (!alive) return
          setUpstreamBranches([])
          setUpstreamPhase('error')
          setUpstreamError(failure?.message ?? String(failure))
        })
        return () => { alive = false }
      }, [activeRepoPath, call, snapshot?.repo?.branch, upstreamOpen, upstreamRemote])

      // 2a. Reset the page when the Workspace changes and restore its selection.
      useEffect(() => {
        setSnapshot(null)
        setSelected(null)
        setDiff(null)
        setDiffPhase('idle')
        setDiffError(null)
        setAmend(false)
        setMenu(null)
        setDiscardTargets(null)
        setManagerOpen(false)
        setDiscovered([])
        setScanPhase('idle')
        setScanError(null)
        setScanTruncated(false)
        setEnabled(readEnabledList(workspacePath))
        setActiveRepoPath(readActiveRepo(workspacePath))
        messageSeq.current += 1
        setGeneratingMessage(false)
        if (!workspacePath) {
          setPhase('ready')
          return
        }
        setPhase('loading')
      }, [workspacePath])

      // 2b. Read the active repository.
      useEffect(() => {
        setSnapshot(null)
        setSelected(null)
        setDiff(null)
        setDiffPhase('idle')
        setDiffError(null)
        setAmend(false)
        setMenu(null)
        setDiscardTargets(null)
        messageSeq.current += 1
        setGeneratingMessage(false)
        if (!activeRepoPath) {
          setPhase('ready')
          return
        }
        setMessage(readLocal(DRAFT_PREFIX + activeRepoPath) ?? '')
        setPhase('loading')
        void loadState()
      }, [activeRepoPath, loadState])

      // 2c. Discover the repositories below the selected Workspace.
      useEffect(() => {
        if (!workspacePath) return undefined
        let alive = true
        setScanPhase('loading')
        setScanError(null)
        call('scan', { cwd: workspacePath }).then((value) => {
          if (!alive) return
          const list = Array.isArray(value?.repos) ? value.repos : []
          const sameWorkspace = scannedWorkspaceRef.current === workspacePath
          const saved = sameWorkspace ? enabledRef.current : readEnabledList(workspacePath)
          const nextEnabled = saved === null
            ? list.map((repo) => repo.path)
            : saved.filter((candidate) => list.some((repo) => samePath(repo.path, candidate)))
          setDiscovered(list)
          setScanTruncated(value?.truncated === true)
          setScanPhase('ready')
          setEnabled(nextEnabled)
          writeEnabledList(workspacePath, nextEnabled)
          const savedActive = sameWorkspace ? activeRepoRef.current : readActiveRepo(workspacePath)
          const nextActive = savedActive !== null && nextEnabled.some((candidate) => samePath(candidate, savedActive))
            ? savedActive
            : (nextEnabled[0] ?? null)
          setActiveRepoPath(nextActive)
          writeActiveRepo(workspacePath, nextActive)
          scannedWorkspaceRef.current = workspacePath
        }).catch((failure) => {
          if (!alive) return
          setScanPhase('error')
          setScanError(failure?.message ?? String(failure))
        })
        return () => { alive = false }
      }, [workspacePath, scanNonce, call])

      // 3. Keep a quiet poll while the page is visible, and refresh on focus.
      useEffect(() => {
        if (!activeRepoPath) return undefined
        const timer = setInterval(() => {
          if (document.visibilityState !== 'visible' || busyRef.current) return
          void loadState({ quiet: true })
        }, 5000)
        return () => clearInterval(timer)
      }, [activeRepoPath, loadState])

      useEffect(() => {
        if (!activeRepoPath) return undefined
        const onFocus = () => {
          if (!busyRef.current) void loadState({ quiet: true })
        }
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
      }, [activeRepoPath, loadState])

      // 4. Read the selected patch; the nonce lets the refresh control repeat it.
      useEffect(() => {
        if (selected === null || !activeRepoPath) {
          setDiff(null)
          setDiffPhase('idle')
          setDiffError(null)
          return
        }
        const seq = ++diffSeq.current
        setDiffPhase('loading')
        setDiffError(null)
        const request = selected.kind === 'commit'
          ? call('show', { cwd: activeRepoPath, hash: selected.hash })
          : call('diff', {
            cwd: activeRepoPath,
            path: selected.path,
            group: selected.group,
            originalPath: selected.originalPath ?? null,
          })
        request.then((value) => {
          if (seq !== diffSeq.current) return
          setDiff(value)
          setDiffPhase('ready')
        }).catch((failure) => {
          if (seq !== diffSeq.current) return
          setDiffError(failure?.message ?? String(failure))
          setDiffPhase('error')
        })
      }, [selected, activeRepoPath, call, diffNonce])

      // 5. Keep the selection on the same file when it moves between groups.
      useEffect(() => {
        if (selected === null || selected.kind !== 'file' || snapshot === null) return
        const listOf = (group) => (
          group === 'staged'
            ? (snapshot.staged ?? [])
            : group === 'conflicts'
              ? (snapshot.conflicts ?? [])
              : (snapshot.unstaged ?? [])
        )
        if (listOf(selected.group).some((entry) => entry.path === selected.path)) return
        for (const group of ['staged', 'unstaged', 'conflicts']) {
          if (group === selected.group) continue
          const match = listOf(group).find((entry) => entry.path === selected.path)
          if (match !== undefined) {
            setSelected({
              kind: 'file',
              group,
              path: match.path,
              originalPath: match.originalPath ?? null,
              status: match.status,
            })
            return
          }
        }
        setSelected(null)
      }, [snapshot, selected])

      useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(null), 5000)
        return () => clearTimeout(timer)
      }, [notice])

      const run = useCallback(async (label, action, successText) => {
        setBusy(label)
        busyRef.current = label
        setError(null)
        try {
          const value = await action()
          const next = await loadState()
          if (successText !== undefined && successText !== null) {
            setNotice({
              kind: 'ok',
              text: typeof successText === 'function' ? successText(value, next) : successText,
            })
          }
          return value
        } catch (failure) {
          setNotice(null)
          setError(failure?.message ?? String(failure))
          return undefined
        } finally {
          setBusy(null)
          busyRef.current = null
        }
      }, [loadState])

      const repo = snapshot?.repo ?? null
      const staged = snapshot?.staged ?? []
      const unstaged = snapshot?.unstaged ?? []
      const conflicts = snapshot?.conflicts ?? []
      const branches = snapshot?.branches ?? []
      const commits = snapshot?.commits ?? []
      const stagedCount = staged.length
      const unstagedCount = unstaged.length
      const canGenerate = stagedCount + unstagedCount + conflicts.length > 0
      const canCommit = stagedCount > 0 && message.trim() !== '' && busy === null && !generatingMessage

      const workspaceEntry = (repos ?? []).find((entry) => samePath(entry.path, workspacePath))
      const workspaceTitle = workspaceEntry?.title ?? baseName(workspacePath ?? '')
      const loadedRepos = discovered.filter((entry) => (
        (enabled ?? []).some((path) => samePath(path, entry.path))
      ))
      const activeEntry = discovered.find((entry) => samePath(entry.path, activeRepoPath))
      const activeLabel = activeEntry !== undefined
        ? (activeEntry.relativePath === '.' ? t('rootRepository') : activeEntry.relativePath)
        : (repo?.name ?? baseName(activeRepoPath ?? ''))
      const repoRoot = repo?.root ?? activeRepoPath ?? workspacePath ?? ''

      const openUpstream = useCallback(() => {
        setMenu(null)
        const remotes = Array.isArray(snapshot?.remotes) ? snapshot.remotes : []
        const preferred = remotes.find((entry) => entry.name === 'origin') ?? remotes[0] ?? null
        const currentUpstream = typeof repo?.upstream === 'string' ? repo.upstream : null
        const separator = currentUpstream === null ? -1 : currentUpstream.indexOf('/')
        const currentRemote = separator > 0 ? currentUpstream.slice(0, separator) : ''
        const currentBranch = separator > 0 ? currentUpstream.slice(separator + 1) : ''
        const knownRemote = remotes.some((entry) => entry.name === currentRemote)
        setUpstreamRemote(knownRemote ? currentRemote : (preferred?.name ?? ''))
        setUpstreamBranch(knownRemote ? currentBranch : '')
        setUpstreamBranches([])
        setUpstreamPhase('idle')
        setUpstreamError(null)
        setUpstreamOpen(true)
      }, [repo, snapshot])

      const saveUpstream = useCallback(async () => {
        if (
          !activeRepoPath
          || repo === null
          || repo.branch === null
          || upstreamRemote === ''
          || upstreamBranch === ''
        ) return
        const value = await run(
          t('savingUpstream'),
          () => call('setUpstream', {
            cwd: activeRepoPath,
            branch: repo.branch,
            remote: upstreamRemote,
            remoteBranch: upstreamBranch,
          }),
          (result) => t('upstreamSet', { upstream: result?.upstream ?? `${upstreamRemote}/${upstreamBranch}` }),
        )
        if (value !== undefined) {
          setUpstreamOpen(false)
          await loadState({ quiet: true })
        }
      }, [activeRepoPath, call, loadState, repo, run, t, upstreamBranch, upstreamRemote])

      const selectFile = useCallback((entry, group) => {
        setSelected({
          kind: 'file',
          group,
          path: entry.path,
          originalPath: entry.originalPath ?? null,
          status: entry.status,
        })
      }, [])

      const selectCommit = useCallback((entry) => {
        setSelected({ kind: 'commit', hash: entry.hash, short: entry.short })
      }, [])

      const selectGroup = useCallback((group) => {
        if (selected === null || selected.kind !== 'file') return
        const list = group === 'staged' ? staged : unstaged
        const entry = list.find((candidate) => candidate.path === selected.path)
        if (entry !== undefined) selectFile(entry, group)
      }, [selected, staged, unstaged, selectFile])

      const stagePaths = useCallback((paths) => run(
        t('stage'),
        () => call('stage', { cwd: activeRepoPath, paths }),
        t('stagedNotice'),
      ), [activeRepoPath, call, run, t])

      const stageAll = useCallback(() => run(
        t('stageAll'),
        () => call('stage', { cwd: activeRepoPath, paths: unstaged.flatMap(entryPaths) }),
        t('stagedAllNotice'),
      ), [activeRepoPath, call, run, t, unstaged])

      const unstagePaths = useCallback((paths) => run(
        t('unstage'),
        () => call('unstage', { cwd: activeRepoPath, paths }),
        t('unstagedNotice'),
      ), [activeRepoPath, call, run, t])

      const unstageAll = useCallback(() => run(
        t('unstageAll'),
        () => call('unstage', { cwd: activeRepoPath, paths: staged.flatMap(entryPaths) }),
        t('unstagedAllNotice'),
      ), [activeRepoPath, call, run, t, staged])

      const askDiscard = useCallback((entries) => {
        setDiscardTargets(entries)
      }, [])

      const confirmDiscard = useCallback(async () => {
        const targets = discardTargets
        if (targets === null) return
        const paths = targets.flatMap(entryPaths)
        setDiscardTargets(null)
        const value = await run(
          t('discarding'),
          () => call('discard', { cwd: activeRepoPath, paths }),
          t('discarded'),
        )
        if (value !== undefined && selected !== null && selected.kind === 'file' && paths.includes(selected.path)) {
          setSelected(null)
        }
      }, [activeRepoPath, call, discardTargets, run, selected, t])

      const commitChanges = useCallback(async () => {
        if (message.trim() === '') {
          setError(t('commitMessageRequired'))
          return
        }
        if (stagedCount === 0) {
          setError(t('nothingStaged'))
          return
        }
        const value = await run(
          t('committing'),
          () => call('commit', {
            cwd: activeRepoPath,
            message,
            amend,
          }),
          (result) => t('commitSuccess', { hash: result?.hash ?? '' }),
        )
        if (value !== undefined) {
          setMessage('')
          writeLocal(DRAFT_PREFIX + activeRepoPath, '')
          setAmend(false)
        }
      }, [activeRepoPath, amend, call, message, run, stagedCount, t])

      const generateMessage = useCallback(async () => {
        if (!activeRepoPath || generatingMessage) return
        const seq = ++messageSeq.current
        setGeneratingMessage(true)
        setError(null)
        try {
          const locale = typeof getLocaleId === 'function'
            ? getLocaleId()
            : ((typeof navigator !== 'undefined' && navigator.language) || 'en')
          const payload = { cwd: activeRepoPath, locale }
          if (effectiveModel !== null) {
            payload.provider = effectiveModel.provider
            payload.model = effectiveModel.model
          }
          const value = await call('message', payload)
          if (seq !== messageSeq.current || activeRepoPath !== activeRepoRef.current) return
          const text = String(value?.message ?? '').trim()
          if (text === '') throw new Error(t('messageEmpty'))
          setMessage(text)
          writeLocal(DRAFT_PREFIX + activeRepoPath, text)
          setTimeout(() => messageRef.current?.focus?.(), 0)
        } catch (failure) {
          if (seq !== messageSeq.current || activeRepoPath !== activeRepoRef.current) return
          setError(failure?.message ?? String(failure))
        } finally {
          if (seq === messageSeq.current) setGeneratingMessage(false)
        }
      }, [activeRepoPath, call, effectiveModel, generatingMessage, getLocaleId, t])

      const switchBranch = useCallback(async (branch) => {
        setMenu(null)
        const value = await run(
          t('switchBranch'),
          () => call('checkout', { cwd: activeRepoPath, branch }),
          t('branchSwitched', { branch }),
        )
        if (value !== undefined) setSelected(null)
      }, [activeRepoPath, call, run, t])

      const makeBranch = useCallback(async () => {
        const name = branchDraft.trim()
        if (name === '') {
          setError(t('branchRequired'))
          return
        }
        setMenu(null)
        setBranchDraft('')
        const value = await run(
          t('newBranch'),
          () => call('createBranch', { cwd: activeRepoPath, branch: name }),
          t('branchCreated', { branch: name }),
        )
        if (value !== undefined) setSelected(null)
      }, [activeRepoPath, branchDraft, call, run, t])

      const sync = useCallback((endpoint, label, success) => run(
        label,
        () => call(endpoint, { cwd: activeRepoPath }),
        success,
      ), [activeRepoPath, call, run])

      const initialize = useCallback(async () => {
        const value = await run(
          t('initializing'),
          () => call('init', { cwd: workspacePath }),
          t('initialized'),
        )
        if (value !== undefined) setScanNonce((current) => current + 1)
      }, [call, run, t, workspacePath])

      const rescan = useCallback(() => setScanNonce((current) => current + 1), [])

      const refreshAll = useCallback(() => {
        void loadState()
        setDiffNonce((value) => value + 1)
      }, [loadState])

      const retry = useCallback(() => {
        if (repos === null || repos.length === 0) {
          setPhase('loading')
          setReposNonce((value) => value + 1)
          return
        }
        if (scanPhase === 'error' || discovered.length === 0 || activeRepoPath === null) {
          setScanNonce((value) => value + 1)
          return
        }
        void loadState()
      }, [activeRepoPath, discovered.length, loadState, repos, scanPhase])

      const toggleSection = useCallback((key) => {
        setOpenSections((current) => ({ ...current, [key]: !current[key] }))
      }, [])

      const onMessage = useCallback((value) => {
        setMessage(value)
        if (activeRepoPath) writeLocal(DRAFT_PREFIX + activeRepoPath, value)
      }, [activeRepoPath])

      const toggleRepo = useCallback((repoEntry) => {
        if (!workspacePath) return
        const current = enabledRef.current ?? []
        const isEnabled = current.some((path) => samePath(path, repoEntry.path))
        const next = isEnabled
          ? current.filter((path) => !samePath(path, repoEntry.path))
          : [...current, repoEntry.path]
        setEnabled(next)
        writeEnabledList(workspacePath, next)
        const active = activeRepoRef.current
        if (active === null || !next.some((path) => samePath(path, active))) {
          const pick = next[0] ?? null
          setActiveRepoPath(pick)
          writeActiveRepo(workspacePath, pick)
        }
      }, [workspacePath])

      const selectAllRepos = useCallback(() => {
        if (!workspacePath) return
        const next = discovered.map((entry) => entry.path)
        setEnabled(next)
        writeEnabledList(workspacePath, next)
        const active = activeRepoRef.current
        if (active === null || !next.some((path) => samePath(path, active))) {
          const pick = next[0] ?? null
          setActiveRepoPath(pick)
          writeActiveRepo(workspacePath, pick)
        }
      }, [discovered, workspacePath])

      const clearRepos = useCallback(() => {
        if (!workspacePath) return
        setEnabled([])
        writeEnabledList(workspacePath, [])
        setActiveRepoPath(null)
        writeActiveRepo(workspacePath, null)
      }, [workspacePath])

      const chooseRepo = useCallback((path) => {
        setActiveRepoPath(path)
        if (workspacePath) writeActiveRepo(workspacePath, path)
        setMenu(null)
      }, [workspacePath])

      const chooseWorkspace = useCallback((path) => {
        setWorkspacePath(path)
        setMenu(null)
      }, [])

      const selectedEntry = useMemo(() => {
        if (selected === null || selected.kind !== 'file') return null
        const list = selected.group === 'staged' ? staged : unstaged
        return list.find((entry) => entry.path === selected.path) ?? null
      }, [selected, staged, unstaged])

      const bothGroups = useMemo(() => ({
        staged: selected !== null && selected.kind === 'file' && staged.some((entry) => entry.path === selected.path),
        unstaged: selected !== null && selected.kind === 'file' && unstaged.some((entry) => entry.path === selected.path),
      }), [selected, staged, unstaged])

      const workspaceMenuOpen = menu === 'workspace'
      const repoMenuOpen = menu === 'repo'
      const branchMenuOpen = menu === 'branch'
      const closeMenu = useCallback(() => setMenu(null), [])

      // ---- render ---------------------------------------------------------

      if (repos !== null && repos.length === 0 && error === null) {
        return h('div', { className: 'dg-root' },
          h(EmptyState, {
            icon: h(GitMark, { size: 22 }),
            title: t('noWorkspaces'),
            text: t('noWorkspacesHint'),
          }))
      }

      const header = h('header', { className: 'dg-header' },
        h('div', { className: 'dg-heading' },
          h('div', { className: 'dg-title-row' },
            h('span', { className: 'dg-glyph' }, h(GitMark, { size: 18 })),
            h('h1', { className: 'dg-title' }, t('panelTitle')),
            h('span', { className: 'dg-menu-anchor' },
              h('button', {
                type: 'button',
                className: 'dg-chip',
                'aria-haspopup': 'menu',
                'aria-expanded': workspaceMenuOpen,
                title: workspacePath ?? '',
                onClick: () => setMenu(workspaceMenuOpen ? null : 'workspace'),
              },
              h(FolderIcon, { size: 12 }),
              h('span', { className: 'dg-chip-text' }, workspaceTitle || t('chooseWorkspace')),
              h(ChevronDown, { size: 11 })),
              h(Menu, { open: workspaceMenuOpen, onClose: closeMenu },
                h('div', { className: 'dg-menu-label' }, t('workspace')),
                (repos ?? []).map((entry) => h('button', {
                  key: entry.path,
                  type: 'button',
                  role: 'menuitem',
                  className: 'dg-menu-item',
                  'data-current': samePath(entry.path, workspacePath) ? 'true' : 'false',
                  onClick: () => chooseWorkspace(entry.path),
                },
                h('span', { className: 'dg-menu-check' },
                  samePath(entry.path, workspacePath) ? h(CheckIcon, { size: 12 }) : null),
                h('span', { className: 'dg-menu-item-main' },
                  h('span', { className: 'dg-menu-item-title' }, entry.title || baseName(entry.path)),
                  h('span', { className: 'dg-menu-item-path', title: entry.path }, entry.path)))))),
            h('span', { className: 'dg-menu-anchor' },
              h('button', {
                type: 'button',
                className: 'dg-chip',
                'aria-haspopup': 'menu',
                'aria-expanded': repoMenuOpen,
                title: activeRepoPath ?? workspacePath ?? '',
                onClick: () => setMenu(repoMenuOpen ? null : 'repo'),
              },
              h(GitMark, { size: 12 }),
              h('span', { className: 'dg-chip-text' }, activeLabel || t('noRepositoriesLoaded')),
              h(ChevronDown, { size: 11 })),
              h(Menu, { open: repoMenuOpen, onClose: closeMenu },
                h('div', { className: 'dg-menu-label' }, t('loadedRepos')),
                loadedRepos.length === 0
                  ? h('div', { className: 'dg-menu-empty' }, t('noRepositoriesLoaded'))
                  : loadedRepos.map((entry) => h('button', {
                    key: entry.path,
                    type: 'button',
                    role: 'menuitem',
                    className: 'dg-menu-item',
                    'data-current': samePath(entry.path, activeRepoPath) ? 'true' : 'false',
                    onClick: () => chooseRepo(entry.path),
                  },
                  h('span', { className: 'dg-menu-check' },
                    samePath(entry.path, activeRepoPath) ? h(CheckIcon, { size: 12 }) : null),
                  h('span', { className: 'dg-menu-item-main' },
                    h('span', { className: 'dg-menu-item-title' },
                      entry.relativePath === '.' ? t('rootRepository') : entry.relativePath),
                    h('span', { className: 'dg-menu-item-path', title: entry.path }, entry.path)))),
                h('div', { className: 'dg-menu-sep' }),
                h('button', {
                  type: 'button',
                  className: 'dg-menu-item',
                  onClick: () => {
                    setManagerOpen(true)
                    setMenu(null)
                  },
                },
                h('span', { className: 'dg-menu-check' }),
                h('span', { className: 'dg-menu-item-main' },
                  h('span', { className: 'dg-menu-item-title' }, t('manageRepos')))))),
            repo !== null
              ? h('span', { className: 'dg-menu-anchor' },
                h('button', {
                  type: 'button',
                  className: 'dg-chip',
                  'aria-haspopup': 'dialog',
                  'aria-expanded': branchMenuOpen,
                  title: repo.branch ?? t('detachedHead'),
                  onClick: () => setMenu(branchMenuOpen ? null : 'branch'),
                },
                h(GitMark, { size: 12 }),
                h('span', { className: 'dg-chip-text' }, repo.branch ?? t('detachedHead')),
                repo.ahead > 0 ? h('span', { className: 'dg-chip-meta', title: t('aheadCount', { n: repo.ahead }) }, `↑${repo.ahead}`) : null,
                repo.behind > 0 ? h('span', { className: 'dg-chip-meta', title: t('behindCount', { n: repo.behind }) }, `↓${repo.behind}`) : null,
                h(ChevronDown, { size: 11 })),
                h(Menu, {
                  open: branchMenuOpen,
                  onClose: closeMenu,
                  role: 'dialog',
                  label: t('switchBranch'),
                },
                  h('div', { className: 'dg-menu-label' }, t('switchBranch')),
                  branches.length === 0
                    ? h('div', { className: 'dg-menu-empty' }, t('noBranches'))
                    : branches.map((branch) => h('button', {
                      key: branch.name,
                      type: 'button',
                      className: 'dg-menu-item',
                      'data-current': branch.current ? 'true' : 'false',
                      onClick: () => {
                        if (branch.current) setMenu(null)
                        else void switchBranch(branch.name)
                      },
                    },
                    h('span', { className: 'dg-menu-check' }, branch.current ? h(CheckIcon, { size: 12 }) : null),
                    h('span', { className: 'dg-menu-item-main' },
                      h('span', { className: 'dg-menu-item-title' }, branch.name),
                      h('span', { className: 'dg-menu-item-path' },
                        branch.upstream ?? t('noUpstream'))))),
                  repo.branch !== null
                    ? h('button', {
                      type: 'button',
                      className: 'dg-menu-item',
                      onClick: openUpstream,
                    },
                    h('span', { className: 'dg-menu-check' }),
                    h('span', { className: 'dg-menu-item-main' },
                      h('span', { className: 'dg-menu-item-title' }, t('setUpstream')),
                      h('span', { className: 'dg-menu-item-path' },
                        repo.upstream ?? t('noUpstream'))))
                    : null,
                  h('div', { className: 'dg-menu-sep' }),
                  h('div', { className: 'dg-menu-label' }, t('newBranch')),
                  h('div', { className: 'dg-menu-input-row' },
                    h('input', {
                      className: 'dg-input',
                      value: branchDraft,
                      placeholder: t('newBranchPlaceholder'),
                      'aria-label': t('newBranchPlaceholder'),
                      onChange: (event) => setBranchDraft(event.target.value),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void makeBranch()
                        }
                      },
                    }),
                    h(Button, {
                      variant: 'primary',
                      onClick: () => void makeBranch(),
                      disabled: branchDraft.trim() === '' || Boolean(busy),
                    }, t('create')))))
              : null),
          h('p', { className: 'dg-subtitle', title: repoRoot }, repoRoot)),
        h('div', { className: 'dg-toolbar' },
          repo !== null
            ? h(IconButton, {
              title: t('fetch'),
              onClick: () => void sync('fetch', t('fetch'), t('fetchDone')),
              disabled: Boolean(busy),
            }, h(CloudIcon, { size: 14 }))
            : null,
          repo !== null
            ? h(IconButton, {
              title: t('pull'),
              onClick: () => void sync('pull', t('pull'), t('pullDone')),
              disabled: Boolean(busy),
            }, h(ArrowDownIcon, { size: 14 }),
            repo.behind > 0 ? h('span', { className: 'dg-badge' }, repo.behind) : null)
            : null,
          repo !== null
            ? h(IconButton, {
              title: t('push'),
              onClick: () => void sync('push', t('push'), t('pushDone')),
              disabled: Boolean(busy),
            }, h(ArrowUpIcon, { size: 14 }),
            repo.ahead > 0 ? h('span', { className: 'dg-badge' }, repo.ahead) : null)
            : null,
          busy !== null
            ? h('span', { className: 'dg-busy', title: busy }, h(Spinner, { size: 12 }), h('span', null, busy))
            : null,
          h(IconButton, {
            title: t('manageRepos'),
            onClick: () => setManagerOpen(true),
            disabled: Boolean(busy),
          }, h(ListIcon, { size: 14 })),
          h(IconButton, {
            title: t('refresh'),
            onClick: refreshAll,
            disabled: Boolean(busy),
          }, busy ? h(Spinner, { size: 13 }) : h(RefreshIcon, { size: 14 }))))

      const banners = []
      if (error !== null && snapshot !== null) {
        banners.push(h('div', { key: 'error', className: 'dg-banner dg-banner-error' },
          h(WarningIcon, { size: 14 }),
          h('span', { className: 'dg-banner-text' }, error),
          h(IconButton, {
            title: t('dismiss'),
            onClick: () => setError(null),
          }, h(CloseIcon, { size: 12 }))))
      }
      if (scanError !== null && discovered.length > 0) {
        banners.push(h('div', { key: 'scan-error', className: 'dg-banner dg-banner-error' },
          h(WarningIcon, { size: 14 }),
          h('span', { className: 'dg-banner-text' }, scanError),
          h(Button, { variant: 'ghost', onClick: rescan }, t('scanAgain'))))
      }
      if (notice !== null) {
        banners.push(h('div', { key: 'notice', className: 'dg-banner dg-banner-ok' },
          h(CheckIcon, { size: 14 }),
          h('span', { className: 'dg-banner-text' }, notice.text)))
      }

      let body
      if (scanPhase === 'loading' && discovered.length === 0) {
        body = h(EmptyState, { icon: h(Spinner, { size: 20 }), title: t('scanning') })
      } else if (scanPhase === 'error' && discovered.length === 0) {
        body = h(EmptyState, {
          icon: h(WarningIcon, { size: 22 }),
          title: t('loadingFailed'),
          text: scanError ?? '',
          children: h(Button, { onClick: rescan }, t('scanAgain')),
        })
      } else if (scanPhase === 'ready' && discovered.length === 0) {
        body = h(EmptyState, {
          icon: h(GitMark, { size: 22 }),
          title: t('noRepositoriesFound'),
          text: t('noRepositoriesHint'),
          children: h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
            h('span', { className: 'dg-empty-path', title: workspacePath ?? '' }, workspacePath ?? ''),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              h(Button, { onClick: rescan }, t('scanAgain')),
              h(Button, {
                variant: 'primary',
                onClick: () => void initialize(),
                disabled: Boolean(busy),
              }, t('initRepository')))),
        })
      } else if (discovered.length > 0 && (enabled ?? []).length === 0) {
        body = h(EmptyState, {
          icon: h(GitMark, { size: 22 }),
          title: t('noRepositoriesLoaded'),
          text: t('loadRepositoriesHint'),
          children: h(Button, {
            variant: 'primary',
            onClick: () => setManagerOpen(true),
          }, t('manageRepos')),
        })
      } else if (snapshot === null) {
        body = phase === 'error'
          ? h(EmptyState, {
            icon: h(WarningIcon, { size: 22 }),
            title: t('loadingFailed'),
            text: error ?? '',
            children: h(Button, { onClick: retry }, t('retry')),
          })
          : h(EmptyState, { icon: h(Spinner, { size: 20 }), title: t('loading') })
      } else if (repo === null) {
        body = h(EmptyState, {
          icon: h(WarningIcon, { size: 22 }),
          title: t('notARepository'),
          text: t('notARepositoryHint'),
          children: h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
            h('span', { className: 'dg-empty-path', title: repoRoot }, repoRoot),
            h(Button, { onClick: rescan }, t('scanAgain'))),
        })
      } else {
        body = h('div', { className: 'dg-body' },
          h('aside', { className: 'dg-side' },
            h(CommitBox, {
              t,
              message,
              onMessage,
              amend,
              onAmend: setAmend,
              stagedCount,
              unstagedCount,
              canCommit,
              canGenerate,
              generating: generatingMessage,
              busy,
              onCommit: () => void commitChanges(),
              onStageAll: () => void stageAll(),
              onGenerate: () => void generateMessage(),
              textareaRef: messageRef,
              modelCatalog,
              modelSelection: effectiveModel,
              modelError,
              onModelChange: changeModel,
            }),
            h('div', { className: 'dg-side-scroll', ref: sideRef },
              h(FileSection, {
                t,
                title: t('mergeChanges'),
                entries: conflicts,
                open: openSections.conflicts,
                onToggle: () => toggleSection('conflicts'),
                emptyText: t('noConflicts'),
                group: 'conflicts',
                selected,
                onSelect: selectFile,
                onStage: stagePaths,
                onUnstage: unstagePaths,
                onDiscard: askDiscard,
                busy,
              }),
              h(FileSection, {
                t,
                title: t('stagedChanges'),
                entries: staged,
                open: openSections.staged,
                onToggle: () => toggleSection('staged'),
                emptyText: t('noStaged'),
                actionIcon: h(MinusIcon, { size: 12 }),
                actionTitle: t('unstageAll'),
                onAction: () => void unstageAll(),
                group: 'staged',
                selected,
                onSelect: selectFile,
                onStage: stagePaths,
                onUnstage: unstagePaths,
                onDiscard: askDiscard,
                busy,
              }),
              h(FileSection, {
                t,
                title: t('changes'),
                entries: unstaged,
                open: openSections.changes,
                onToggle: () => toggleSection('changes'),
                emptyText: t('noChanges'),
                actionIcon: h(PlusIcon, { size: 12 }),
                actionTitle: t('stageAll'),
                onAction: () => void stageAll(),
                group: 'unstaged',
                selected,
                onSelect: selectFile,
                onStage: stagePaths,
                onUnstage: unstagePaths,
                onDiscard: askDiscard,
                busy,
              }),
              h(HistorySection, {
                t,
                commits,
                open: openSections.history,
                onToggle: () => toggleSection('history'),
                selected,
                onSelect: selectCommit,
              }))),
          h(DiffPane, {
            t,
            selected,
            bothGroups,
            snapshot,
            diff,
            diffPhase,
            diffError,
            busy,
            onSelectGroup: selectGroup,
            onStage: stagePaths,
            onUnstage: unstagePaths,
            onRefresh: refreshAll,
            onBack: () => setSelected(null),
          }))
      }

      return h('div', { className: 'dg-root' },
        header,
        banners.length > 0 ? h('div', { className: 'dg-banners' }, banners) : null,
        body,
        discardTargets !== null
          ? h(DiscardDialog, {
            t,
            targets: discardTargets,
            onCancel: () => setDiscardTargets(null),
            onConfirm: () => void confirmDiscard(),
            busy,
          })
          : null,
        upstreamOpen
          ? h(UpstreamDialog, {
            t,
            repo,
            remotes: Array.isArray(snapshot?.remotes) ? snapshot.remotes : [],
            remote: upstreamRemote,
            branch: upstreamBranch,
            branches: upstreamBranches,
            phase: upstreamPhase,
            error: upstreamError,
            busy,
            onRemote: (value) => {
              setUpstreamRemote(value)
              setUpstreamBranch('')
            },
            onBranch: setUpstreamBranch,
            onCancel: () => setUpstreamOpen(false),
            onSave: () => void saveUpstream(),
          })
          : null,
        managerOpen
          ? h(RepoManager, {
            t,
            workspaceTitle,
            workspacePath,
            discovered,
            enabled,
            scanPhase,
            scanError,
            scanTruncated,
            onToggle: toggleRepo,
            onSelectAll: selectAllRepos,
            onClear: clearRepos,
            onRescan: rescan,
            onClose: () => setManagerOpen(false),
          })
          : null)
    }

    //#endregion

    //#region registration

    /**
     * Keep a render defect visible instead of leaving the main column blank.
     *
     * The slot registry removes an entry whose component throws; a boundary at
     * the registration root turns that blank page into the message and a retry.
     */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        console.error('[dsh-git] panel render failed', error, info)
      }

      render() {
        if (this.state.error === null) return h(GitPanel, this.props)
        let title = 'Git panel failed to render'
        let retry = 'Retry'
        try {
          const translated = this.props.t?.('renderFailed')
          if (typeof translated === 'string' && translated !== '') title = translated
          const retryText = this.props.t?.('retry')
          if (typeof retryText === 'string' && retryText !== '') retry = retryText
        } catch {
          /* the translator itself may be the failing dependency */
        }
        return h('div', { className: 'dg-root' },
          h(EmptyState, {
            icon: h(WarningIcon, { size: 22 }),
            title,
            text: String(this.state.error?.message ?? this.state.error),
            children: h(Button, {
              onClick: () => this.setState({ error: null }),
            }, retry),
          }))
      }
    }

    /** Sidebar rail icon; the owner supplies the button, label, and active state. */
    function PanelIcon({ size = 20, active }) {
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? 'var(--dsw-alias-brand-primary)' : 'inherit',
        },
      }, h(GitMark, { size }))
    }

    function apply(ctx) {
      const translate = (key, params) => {
        const locale = ctx.get('locale')
        if (locale !== undefined) {
          try {
            const value = locale.bind(NS)(key, params)
            if (typeof value === 'string' && value !== key) return value
          } catch {
            /* fall through to the bundled dictionary */
          }
        }
        const template = EN[key] ?? key
        if (params === undefined || params === null) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (
          params[name] === undefined || params[name] === null ? match : String(params[name])
        ))
      }

      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-git'
        tag.dataset.pluginCss = `${NS}/client.css`
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'dsh-git: stylesheet')

      ctx.inject(['locale'], (localeCtx) => {
        const locale = localeCtx.locale
        const disposers = []
        try {
          disposers.push(locale.register(NS, 'en', EN))
        } catch { /* a duplicate registration is harmless */ }
        try {
          disposers.push(locale.register(NS, 'zh', ZH))
        } catch { /* see above */ }
        return () => {
          for (const dispose of disposers) {
            try { dispose() } catch { /* already disposed */ }
          }
        }
      })

      const currentLocaleId = () => {
        try {
          const locale = ctx.get('locale')
          const snapshot = locale?.getLocale?.() ?? locale?.getSnapshot?.()
          if (typeof snapshot?.id === 'string' && snapshot.id !== '') return snapshot.id
          if (typeof snapshot?.locale === 'string' && snapshot.locale !== '') return snapshot.locale
        } catch {
          /* fall through to the browser language */
        }
        return (typeof navigator !== 'undefined' && navigator.language) || 'en'
      }

      const call = async (endpoint, payload) => {
        if (ctx.get('connection') === undefined) throw new Error(translate('panelUnavailable'))
        let response
        try {
          response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint, payload: payload ?? {} }),
          })
        } catch (failure) {
          throw new Error(translate('routeUnreachable', { message: String(failure?.message ?? failure) }))
        }
        if (!response.ok) throw new Error(translate('httpError', { status: response.status }))
        const result = await response.json().catch(() => null)
        if (result?.ok === true) return result.value
        throw new Error(result?.error?.message ?? translate('refused'))
      }

      const face = () => ({ t: translate, call, getLocaleId: currentLocaleId })

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 5,
        label: () => translate('panelTitle'),
        locale: NS,
        inject: face,
      }, PanelIcon))

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: face,
      }, PanelBoundary))
    }

    return { inject: ['slots', 'connection'], apply }
  },
})
