/**
 * Host-half smoke test: real git, temporary repositories, no Harness runtime.
 *
 * Run from the package directory:
 *   node test/host.test.mjs
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  GitPanelError,
  apply,
  cleanCommitMessage,
  createGitService,
  parseBranchHeader,
  parsePatch,
  parseStatus,
  readDiff,
  readShow,
  readState,
  stage,
  unstage,
  discard,
  commit,
  checkout,
  createBranch,
  fetchRemote,
  pull,
  push,
  init,
} from '../index.js'

const git = 'git'
let passed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.log(`FAIL  ${name}: ${error.message}`)
  }
}

async function checkAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.log(`FAIL  ${name}: ${error.message}`)
  }
}

function run(cwd, args) {
  return execFileSync(git, ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

async function write(file, text) {
  await fs.writeFile(file, text, 'utf8')
}

async function makeRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-git-test-'))
  run(dir, ['init', '-b', 'main'])
  run(dir, ['config', 'user.email', 'test@example.com'])
  run(dir, ['config', 'user.name', 'Tester'])
  await write(path.join(dir, 'alpha.txt'), 'one\ntwo\nthree\n')
  await write(path.join(dir, 'sp ace.txt'), 'space\n')
  run(dir, ['add', '.'])
  run(dir, ['commit', '-m', 'initial commit'])
  return dir
}

async function main() {
  console.log('parseBranchHeader')
  check('plain branch', () => {
    assert.deepEqual(parseBranchHeader('main'), {
      branch: 'main', upstream: null, ahead: 0, behind: 0, detached: false, unborn: false,
    })
  })
  check('upstream and counts', () => {
    const head = parseBranchHeader('main...origin/main [ahead 2, behind 1]')
    assert.equal(head.branch, 'main')
    assert.equal(head.upstream, 'origin/main')
    assert.equal(head.ahead, 2)
    assert.equal(head.behind, 1)
  })
  check('unborn', () => {
    const head = parseBranchHeader('No commits yet on trunk')
    assert.equal(head.branch, 'trunk')
    assert.equal(head.unborn, true)
  })
  check('detached', () => {
    const head = parseBranchHeader('HEAD (no branch)')
    assert.equal(head.detached, true)
    assert.equal(head.branch, null)
  })

  console.log('parsePatch')
  check('unified patch lines', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      'index 111..222 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,4 @@',
      ' one',
      '-two',
      '+TWO',
      ' three',
      '+four',
      '',
    ].join('\n')
    const { files, truncated } = parsePatch(patch)
    assert.equal(truncated, false)
    assert.equal(files.length, 1)
    assert.equal(files[0].path, 'a.txt')
    const kinds = files[0].lines.map((line) => line.kind)
    assert.deepEqual(kinds, ['meta', 'meta', 'meta', 'hunk', 'ctx', 'del', 'add', 'ctx', 'add'])
    const add = files[0].lines.find((line) => line.kind === 'add')
    assert.equal(add.newLine, 2)
  })
  check('deleted content beginning with -- is not a header', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,1 +1,1 @@',
      '--- comment',
      '+++ replacement',
      '',
    ].join('\n')
    const { files } = parsePatch(patch)
    assert.equal(files[0].path, 'a.txt')
    assert.equal(files[0].lines.filter((line) => line.kind === 'del').length, 1)
    assert.equal(files[0].lines.filter((line) => line.kind === 'add').length, 1)
  })
  check('binary patch', () => {
    const { files } = parsePatch('diff --git a/x.bin b/x.bin\nBinary files a/x.bin and b/x.bin differ\n')
    assert.equal(files[0].binary, true)
  })
  check('combined conflict patch', () => {
    const patch = [
      'diff --cc conflict.txt',
      'index ba2906d,2299c37..0000000',
      '--- a/conflict.txt',
      '+++ b/conflict.txt',
      '@@@ -1,1 -1,1 +1,5 @@@',
      '++<<<<<<< HEAD',
      ' +main',
      '++=======',
      '+ side',
      '++>>>>>>> side',
      '',
    ].join('\n')
    const { files } = parsePatch(patch)
    assert.equal(files[0].combined, true)
    assert.equal(files[0].path, 'conflict.txt')
    const adds = files[0].lines.filter((line) => line.kind === 'add')
    assert.equal(adds.length, 5)
    assert.equal(adds[0].text, '<<<<<<< HEAD')
    assert.equal(adds[1].text, 'main')
    assert.equal(adds[3].text, 'side')
  })

  console.log('repository')
  const repo = await makeRepo()
  try {
    await checkAsync('state reports a clean tree', async () => {
      const state = await readState(git, repo)
      assert.equal(state.repo.branch, 'main')
      assert.equal(state.repo.detached, false)
      assert.equal(state.repo.unborn, false)
      assert.equal(state.staged.length, 0)
      assert.equal(state.unstaged.length, 0)
      assert.equal(state.commits.length, 1)
      assert.equal(state.commits[0].subject, 'initial commit')
      assert.equal(state.branches[0].current, true)
    })

    await write(path.join(repo, 'alpha.txt'), 'one\nTWO\nthree\nfour\n')
    await write(path.join(repo, 'new.txt'), 'new\nfile\n')
    run(repo, ['mv', 'sp ace.txt', 'renamed file.txt'])

    await checkAsync('state groups worktree, untracked, and staged rename', async () => {
      const state = await readState(git, repo)
      assert.deepEqual(state.staged.map((entry) => [entry.path, entry.status]), [['renamed file.txt', 'R']])
      const untracked = state.unstaged.find((entry) => entry.path === 'new.txt')
      assert.equal(untracked.untracked, true)
      assert.equal(untracked.status, 'U')
      const modified = state.unstaged.find((entry) => entry.path === 'alpha.txt')
      assert.equal(modified.status, 'M')
    })

    await checkAsync('unstaged diff', async () => {
      const diff = await readDiff(git, repo, { path: 'alpha.txt', group: 'unstaged' })
      const adds = diff.files[0].lines.filter((line) => line.kind === 'add').map((line) => line.text)
      const dels = diff.files[0].lines.filter((line) => line.kind === 'del').map((line) => line.text)
      assert.deepEqual(adds, ['TWO', 'four'])
      assert.deepEqual(dels, ['two'])
    })

    await checkAsync('untracked diff is synthesized', async () => {
      const diff = await readDiff(git, repo, { path: 'new.txt', group: 'unstaged' })
      assert.equal(diff.untracked, true)
      const adds = diff.files[0].lines.filter((line) => line.kind === 'add').map((line) => line.text)
      assert.deepEqual(adds, ['new', 'file'])
    })

    await checkAsync('staged diff for a rename', async () => {
      const diff = await readDiff(git, repo, {
        path: 'renamed file.txt',
        originalPath: 'sp ace.txt',
        group: 'staged',
      })
      assert.equal(diff.files[0].path, 'renamed file.txt')
      assert.equal(diff.files[0].originalPath, 'sp ace.txt')
    })

    await checkAsync('stage and unstage', async () => {
      await stage(git, repo, { paths: ['alpha.txt'] })
      let state = await readState(git, repo)
      assert.ok(state.staged.some((entry) => entry.path === 'alpha.txt'))
      await unstage(git, repo, { paths: ['alpha.txt'] })
      state = await readState(git, repo)
      assert.ok(!state.staged.some((entry) => entry.path === 'alpha.txt'))
    })

    await checkAsync('discard tracked and untracked', async () => {
      await discard(git, repo, { paths: ['alpha.txt', 'new.txt'] })
      const state = await readState(git, repo)
      assert.ok(!state.unstaged.some((entry) => entry.path === 'alpha.txt'))
      assert.ok(!state.unstaged.some((entry) => entry.path === 'new.txt'))
      const text = await fs.readFile(path.join(repo, 'alpha.txt'), 'utf8')
      assert.equal(text, 'one\ntwo\nthree\n')
    })

    await checkAsync('commit and show', async () => {
      await write(path.join(repo, 'alpha.txt'), 'one\ntwo\nthree\nfour\n')
      await stage(git, repo, { paths: ['alpha.txt'] })
      const result = await commit(git, repo, { message: 'add four' })
      assert.match(result.hash, /^[0-9a-f]{7,}$/)
      const state = await readState(git, repo)
      assert.equal(state.commits[0].subject, 'add four')
      const shown = await readShow(git, repo, { hash: result.hash })
      assert.equal(shown.commit.subject, 'add four')
      assert.equal(shown.files.length, 2)
      assert.ok(shown.files.some((file) => file.path === 'alpha.txt'))
      assert.ok(shown.files.some((file) => file.path === 'renamed file.txt'))
    })

    await checkAsync('stage and unstage a rename with both paths', async () => {
      await fs.rename(path.join(repo, 'renamed file.txt'), path.join(repo, 'final name.txt'))
      await stage(git, repo, { paths: ['final name.txt', 'renamed file.txt'] })
      let state = await readState(git, repo)
      const renamed = state.staged.find((entry) => entry.path === 'final name.txt')
      assert.ok(renamed, 'the staged rename is reported')
      assert.equal(renamed.status, 'R')
      assert.equal(renamed.originalPath, 'renamed file.txt')
      await unstage(git, repo, { paths: ['final name.txt', 'renamed file.txt'] })
      state = await readState(git, repo)
      assert.ok(!state.staged.some((entry) => entry.path === 'final name.txt'))
      assert.ok(state.unstaged.some((entry) => entry.path === 'final name.txt' && entry.untracked))
      assert.ok(state.unstaged.some((entry) => entry.path === 'renamed file.txt' && entry.status === 'D'))
      await stage(git, repo, { paths: ['final name.txt', 'renamed file.txt'] })
      await commit(git, repo, { message: 'rename again' })
    })

    await checkAsync('branches', async () => {
      await createBranch(git, repo, { branch: 'feature/panel' })
      let state = await readState(git, repo)
      assert.equal(state.repo.branch, 'feature/panel')
      assert.ok(state.branches.some((branch) => branch.name === 'feature/panel' && branch.current))
      await checkout(git, repo, { branch: 'main' })
      state = await readState(git, repo)
      assert.equal(state.repo.branch, 'main')
    })

    await checkAsync('conflicts are their own group', async () => {
      await write(path.join(repo, 'conflict.txt'), 'base\n')
      run(repo, ['add', 'conflict.txt'])
      run(repo, ['commit', '-m', 'conflict base'])
      run(repo, ['switch', '-c', 'side'])
      await write(path.join(repo, 'conflict.txt'), 'side\n')
      run(repo, ['add', 'conflict.txt'])
      run(repo, ['commit', '-m', 'side change'])
      run(repo, ['switch', 'main'])
      await write(path.join(repo, 'conflict.txt'), 'main\n')
      run(repo, ['add', 'conflict.txt'])
      run(repo, ['commit', '-m', 'main change'])
      let merged = true
      try {
        run(repo, ['merge', 'side'])
      } catch {
        merged = false
      }
      assert.equal(merged, false)
      let state = await readState(git, repo)
      assert.deepEqual(state.conflicts.map((entry) => [entry.path, entry.status]), [['conflict.txt', '!']])
      assert.ok(!state.staged.some((entry) => entry.path === 'conflict.txt'))
      assert.ok(!state.unstaged.some((entry) => entry.path === 'conflict.txt'))
      const diff = await readDiff(git, repo, { path: 'conflict.txt', group: 'conflicts' })
      assert.ok(diff.files[0].lines.some((line) => line.kind === 'add' || line.kind === 'del'))
      await write(path.join(repo, 'conflict.txt'), 'resolved\n')
      await stage(git, repo, { paths: ['conflict.txt'] })
      state = await readState(git, repo)
      assert.equal(state.conflicts.length, 0)
      assert.ok(state.staged.some((entry) => entry.path === 'conflict.txt'))
      run(repo, ['commit', '-m', 'resolve conflict'])
    })

    await checkAsync('invalid branch is refused', async () => {
      await assert.rejects(() => checkout(git, repo, { branch: '--upload-pack=evil' }), GitPanelError)
    })

    await checkAsync('path traversal is refused', async () => {
      await assert.rejects(() => readDiff(git, repo, { path: '../secret', group: 'unstaged' }), GitPanelError)
    })
  } finally {
    await fs.rm(repo, { recursive: true, force: true })
  }

  console.log('init')
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-git-empty-'))
  try {
    await checkAsync('init creates a repository', async () => {
      const before = await readState(git, empty)
      assert.equal(before.repo, null)
      await init(git, empty)
      const after = await readState(git, empty)
      assert.equal(after.repo.unborn, true)
      assert.equal(after.repo.branch, 'main')
    })

    await checkAsync('unstage works before the first commit', async () => {
      await write(path.join(empty, 'first.txt'), 'first\n')
      await stage(git, empty, { paths: ['first.txt'] })
      let state = await readState(git, empty)
      assert.ok(state.staged.some((entry) => entry.path === 'first.txt'))
      await unstage(git, empty, { paths: ['first.txt'] })
      state = await readState(git, empty)
      assert.ok(!state.staged.some((entry) => entry.path === 'first.txt'))
      assert.ok(state.unstaged.some((entry) => entry.path === 'first.txt' && entry.untracked))
    })
  } finally {
    await fs.rm(empty, { recursive: true, force: true })
  }

  console.log('scan')
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-git-workspace-'))
  try {
    const repoA = path.join(workspaceRoot, 'repo-a')
    const repoB = path.join(workspaceRoot, 'group', 'repo-b')
    const ignored = path.join(workspaceRoot, 'node_modules', 'ignored-repo')
    await fs.mkdir(path.join(workspaceRoot, 'plain'), { recursive: true })
    for (const dir of [repoA, repoB, ignored]) {
      await fs.mkdir(dir, { recursive: true })
      run(dir, ['init', '-b', 'main'])
      run(dir, ['config', 'user.email', 'test@example.com'])
      run(dir, ['config', 'user.name', 'Tester'])
      await write(path.join(dir, 'file.txt'), 'x\n')
      run(dir, ['add', '.'])
      run(dir, ['commit', '-m', 'init'])
    }
    const service = createGitService()
    const ctx = {
      get(name) {
        if (name === 'workspaceRegistry') {
          return { list: () => [{ id: 'workspace-root', title: 'workspace', path: workspaceRoot }] }
        }
        return undefined
      },
    }

    await checkAsync('scan finds repositories below the workspace root', async () => {
      const value = await service.scan(ctx, { cwd: workspaceRoot })
      assert.deepEqual(value.repos.map((repo) => repo.relativePath), ['group/repo-b', 'repo-a'])
      assert.equal(value.truncated, false)
      assert.equal(value.repos[0].path, repoB)
      assert.equal(value.repos[1].path, repoA)
    })

    await checkAsync('scan skips node_modules and non-repositories', async () => {
      const value = await service.scan(ctx, { cwd: workspaceRoot })
      assert.ok(!value.repos.some((repo) => repo.path.includes('node_modules')))
      assert.ok(!value.repos.some((repo) => repo.path === path.join(workspaceRoot, 'plain')))
    })

    await checkAsync('a subdirectory repository is admitted', async () => {
      const value = await service.state(ctx, { cwd: repoA })
      assert.equal(value.repo.name, 'repo-a')
      assert.equal(value.commits[0].subject, 'init')
    })

    await checkAsync('the workspace root is admitted even when it is not a repository', async () => {
      const value = await service.state(ctx, { cwd: workspaceRoot })
      assert.equal(value.repo, null)
    })

    await checkAsync('scan includes the workspace root after git init', async () => {
      run(workspaceRoot, ['init', '-b', 'main'])
      const value = await service.scan(ctx, { cwd: workspaceRoot })
      assert.equal(value.repos[0].relativePath, '.')
      assert.equal(value.repos[0].path, workspaceRoot)
    })
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }

  console.log('service dispatch')
  const dispatchRepo = await makeRepo()
  try {
    const service = createGitService()
    const ctx = {
      get(name) {
        if (name === 'workspaceRegistry') {
          return { list: () => [{ id: 'workspace-1', title: 'dispatch', path: dispatchRepo }] }
        }
        return undefined
      },
    }
    await checkAsync('repos lists the admitted workspace', async () => {
      const value = await service.repos(ctx)
      assert.equal(value.workspaces.length, 1)
      assert.equal(value.workspaces[0].path, dispatchRepo)
    })
    await checkAsync('state through the service', async () => {
      const value = await service.state(ctx, { cwd: dispatchRepo })
      assert.equal(value.repo.name, path.basename(dispatchRepo))
      assert.equal(value.commits[0].subject, 'initial commit')
    })
    await checkAsync('stage, commit, and show through the service', async () => {
      await write(path.join(dispatchRepo, 'alpha.txt'), 'one\ntwo\nthree\nfive\n')
      await service.stage(ctx, { cwd: dispatchRepo, paths: ['alpha.txt'] })
      const committed = await service.commit(ctx, { cwd: dispatchRepo, message: 'service commit' })
      assert.match(committed.hash, /^[0-9a-f]{7,}$/)
      const shown = await service.show(ctx, { cwd: dispatchRepo, hash: committed.hash })
      assert.equal(shown.commit.subject, 'service commit')
    })
    await checkAsync('the service refuses a directory outside the registry', async () => {
      await assert.rejects(() => service.state(ctx, { cwd: os.tmpdir() }), GitPanelError)
    })
  } finally {
    await fs.rm(dispatchRepo, { recursive: true, force: true })
  }

  console.log('message')
  const messageRepo = await makeRepo()
  const cleanRepo = await makeRepo()
  try {
    await write(path.join(messageRepo, 'alpha.txt'), 'one\ntwo\nthree\nmessage\n')
    await stage(git, messageRepo, { paths: ['alpha.txt'] })
    let captured = null
    const fakeLlm = {
      async prepareCall(config) {
        return {
          config,
          stream: async function* (options) {
            captured = options
            yield { type: 'text-delta', index: 0, text: '```\nfeat: add message generation\n\nGenerate commit messages from staged diffs.\n```' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    }
    const ctx = {
      get(name) {
        if (name === 'workspaceRegistry') {
          return { list: () => [{ id: 'message', title: 'message', path: messageRepo }] }
        }
        if (name === 'llm') return fakeLlm
        if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake-provider', model: 'fake-model' }) }
        return undefined
      },
    }
    const service = createGitService()

    check('cleanCommitMessage strips fences, labels, and quotes', () => {
      assert.equal(cleanCommitMessage('```\nfeat: x\n```'), 'feat: x')
      assert.equal(cleanCommitMessage('Commit message: "fix: y"'), 'fix: y')
      assert.equal(cleanCommitMessage('**docs: z**'), 'docs: z')
      assert.equal(cleanCommitMessage('feat: a\n\nBody text.'), 'feat: a\n\nBody text.')
    })

    await checkAsync('message uses the default model and cleans the stream', async () => {
      const value = await service.message(ctx, { cwd: messageRepo, locale: 'zh-CN' })
      assert.equal(value.message, 'feat: add message generation\n\nGenerate commit messages from staged diffs.')
      assert.deepEqual(value.model, { provider: 'fake-provider', model: 'fake-model' })
      assert.ok(value.files >= 1)
      assert.ok(captured.system.includes('Simplified Chinese'))
      assert.ok(captured.messages[0].content[0].text.includes('alpha.txt'))
      assert.ok(captured.messages[0].content[0].text.includes('Staged diff:'))
    })

    await checkAsync('message refuses a profile without an LLM service', async () => {
      const bareCtx = {
        get(name) {
          if (name === 'workspaceRegistry') {
            return { list: () => [{ id: 'message', title: 'message', path: messageRepo }] }
          }
          return undefined
        },
      }
      await assert.rejects(() => service.message(bareCtx, { cwd: messageRepo }), GitPanelError)
    })

    await checkAsync('message refuses a clean repository', async () => {
      const cleanCtx = {
        get(name) {
          if (name === 'workspaceRegistry') {
            return { list: () => [{ id: 'clean', title: 'clean', path: cleanRepo }] }
          }
          if (name === 'llm') return fakeLlm
          if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake-provider', model: 'fake-model' }) }
          return undefined
        },
      }
      await assert.rejects(() => service.message(cleanCtx, { cwd: cleanRepo }), (error) => (
        error instanceof GitPanelError && error.code === 'git/no-changes'
      ))
    })
  } finally {
    await fs.rm(messageRepo, { recursive: true, force: true })
    await fs.rm(cleanRepo, { recursive: true, force: true })
  }

  console.log('route')
  const routeRepo = await makeRepo()
  try {
    const routes = []
    const ctx = {
      get(name) {
        if (name === 'workspaceRegistry') {
          return { list: () => [{ id: 'route', title: 'route', path: routeRepo }] }
        }
        return undefined
      },
      inject(_deps, callback) {
        return callback({
          connection: {
            fetch: {
              register(route) {
                routes.push(route)
                return () => {}
              },
            },
          },
        })
      },
    }
    apply(ctx, {})
    assert.equal(routes.length, 1)
    const route = routes[0]
    assert.equal(route.path, '/api/dsh-git')
    assert.deepEqual(route.methods, ['POST'])
    const call = async (endpoint, payload) => {
      const response = await route.fetch(new Request('http://localhost/api/dsh-git', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint, payload }),
      }))
      assert.equal(response.status, 200)
      return response.json()
    }
    await checkAsync('route reports repositories and state', async () => {
      const repos = await call('repos', {})
      assert.equal(repos.ok, true)
      assert.equal(repos.value.workspaces.length, 1)
      const scanned = await call('scan', { cwd: routeRepo })
      assert.equal(scanned.ok, true)
      assert.ok(scanned.value.repos.some((repo) => repo.path === routeRepo && repo.relativePath === '.'))
      const state = await call('state', { cwd: routeRepo })
      assert.equal(state.ok, true)
      assert.equal(state.value.repo.name, path.basename(routeRepo))
    })
    await checkAsync('route stages and commits', async () => {
      await write(path.join(routeRepo, 'alpha.txt'), 'one\ntwo\nthree\nroute\n')
      const staged = await call('stage', { cwd: routeRepo, paths: ['alpha.txt'] })
      assert.equal(staged.ok, true)
      const committed = await call('commit', { cwd: routeRepo, message: 'route commit' })
      assert.equal(committed.ok, true)
      assert.match(committed.value.hash, /^[0-9a-f]{7,}$/)
    })
    await checkAsync('route rejects an unknown action and bad JSON', async () => {
      const unknown = await call('nope', {})
      assert.equal(unknown.ok, false)
      assert.equal(unknown.error.code, 'git/unknown-action')
      const bad = await route.fetch(new Request('http://localhost/api/dsh-git', {
        method: 'POST',
        body: 'not json',
      }))
      assert.equal(bad.status, 400)
      const body = await bad.json()
      assert.equal(body.error.code, 'git/bad-request')
    })
  } finally {
    await fs.rm(routeRepo, { recursive: true, force: true })
  }

  console.log('remote sync')
  const remoteRepo = await makeRepo()
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-git-bare-'))
  const clone = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-git-clone-'))
  try {
    run(bare, ['init', '--bare', '-b', 'main'])
    run(remoteRepo, ['remote', 'add', 'origin', bare])
    await checkAsync('push sets the upstream on the first push', async () => {
      const value = await push(git, remoteRepo)
      assert.ok(value.output !== undefined)
      const state = await readState(git, remoteRepo)
      assert.equal(state.repo.upstream, 'origin/main')
      assert.equal(state.repo.ahead, 0)
    })
    await checkAsync('ahead counts an unpushed commit, then push clears it', async () => {
      await write(path.join(remoteRepo, 'alpha.txt'), 'one\ntwo\nthree\nremote\n')
      await stage(git, remoteRepo, { paths: ['alpha.txt'] })
      await commit(git, remoteRepo, { message: 'remote change' })
      let state = await readState(git, remoteRepo)
      assert.equal(state.repo.ahead, 1)
      await push(git, remoteRepo)
      state = await readState(git, remoteRepo)
      assert.equal(state.repo.ahead, 0)
    })
    await checkAsync('pull brings a remote commit into the worktree', async () => {
      run(clone, ['clone', bare, '.'])
      run(clone, ['config', 'user.email', 'test@example.com'])
      run(clone, ['config', 'user.name', 'Tester'])
      await write(path.join(clone, 'pulled.txt'), 'pulled\n')
      run(clone, ['add', '.'])
      run(clone, ['commit', '-m', 'from clone'])
      run(clone, ['push', 'origin', 'main'])
      await fetchRemote(git, remoteRepo)
      let state = await readState(git, remoteRepo)
      assert.equal(state.repo.behind, 1)
      await pull(git, remoteRepo)
      state = await readState(git, remoteRepo)
      assert.equal(state.repo.behind, 0)
      assert.ok(await fs.stat(path.join(remoteRepo, 'pulled.txt')))
    })
  } finally {
    await fs.rm(remoteRepo, { recursive: true, force: true })
    await fs.rm(bare, { recursive: true, force: true })
    await fs.rm(clone, { recursive: true, force: true })
  }

  console.log('admission')
  await checkAsync('service refuses an unregistered directory', async () => {
    const service = createGitService()
    const ctx = { get: () => undefined }
    await assert.rejects(() => service.state(ctx, { cwd: os.tmpdir() }), GitPanelError)
  })

  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length > 0) process.exitCode = 1
}

await main()
