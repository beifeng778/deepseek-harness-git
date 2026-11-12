/**
 * dsh-git — host half.
 *
 * Runs the local `git` executable for one registered Workspace at a time and
 * publishes the result over one authenticated exact Fetch route on Connection's
 * shared `/api` channel. The browser half (`./client`) owns the panel; this half
 * owns argument construction, path admission, and output parsing.
 *
 * Design notes:
 * - Every request names its Workspace directory. `admit()` only accepts the
 *   exact canonical paths the Workspace registry (or the default working
 *   directory) publishes, so the route cannot be used as an arbitrary-cwd shell.
 * - Commands are spawned with `execFile` and an argv array — never a shell — and
 *   every user-supplied path travels after `--`.
 * - Reads use `GIT_OPTIONAL_LOCKS=0`; network verbs get a longer bound and
 *   `GIT_TERMINAL_PROMPT=0` so a missing credential fails instead of hanging.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Exact route the browser half calls. Connection owns the `/api` prefix. */
const ROUTE_PATH = '/api/dsh-git'
/** Bound for a read-only git verb. */
const READ_TIMEOUT_MS = 60_000
/** Bound for a verb that may talk to a remote. */
const NETWORK_TIMEOUT_MS = 120_000
/** Upper bound for one patch handed to the browser. */
const MAX_DIFF_LINES = 6_000
/** A larger untracked file is reported as binary instead of read. */
const MAX_FILE_BYTES = 1024 * 1024
/** Truncated command output kept for a notice or an error. */
const MAX_MESSAGE_CHARS = 4_000
/** Guards the number of pathspecs one request may carry. */
const MAX_PATHS = 200
/** Bound for one AI commit-message request. */
const MESSAGE_TIMEOUT_MS = 90_000
/** Character budget for the prompt input. */
const MESSAGE_MAX_INPUT_CHARS = 24_000
/** Output cap for one commit message. */
const MESSAGE_MAX_OUTPUT_TOKENS = 320
/** Untracked files quoted to the model when no diff exists. */
const MESSAGE_MAX_UNTRACKED_FILES = 5
/** Bytes quoted from one untracked file. */
const MESSAGE_MAX_UNTRACKED_BYTES = 4_096

const NO_STORE = { 'cache-control': 'no-store' }

/** A failure the browser half can show verbatim. */
export class GitPanelError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'GitPanelError'
    this.code = code
  }
}

/** Collapse command output to one bounded, trimmed message. */
function clean(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/^\n+|\n+$/g, '')
    .slice(0, MAX_MESSAGE_CHARS)
}

function isWindows() {
  return process.platform === 'win32'
}

/** Compare two absolute paths with the platform's case rules. */
function samePath(left, right) {
  const a = path.resolve(String(left))
  const b = path.resolve(String(right))
  return isWindows() ? a.toLowerCase() === b.toLowerCase() : a === b
}

/**
 * Validate one repository-relative path.
 *
 * Git pathspecs are relative to the repository root. Rejecting absolute paths
 * and `..` segments keeps a request inside the admitted Workspace even though
 * git itself would accept a wider pathspec.
 */
function normalizeRelPath(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new GitPanelError('git/bad-path', 'A file path is required.')
  }
  const raw = input.replace(/\\/g, '/')
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) {
    throw new GitPanelError('git/bad-path', 'File paths must be relative to the repository root.')
  }
  const parts = raw.split('/').filter((part) => part !== '' && part !== '.')
  if (parts.length === 0 || parts.includes('..')) {
    throw new GitPanelError('git/bad-path', 'File paths must stay inside the repository.')
  }
  return parts.join('/')
}

function normalizePaths(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new GitPanelError('git/bad-path', 'At least one file path is required.')
  }
  return [...new Set(input.map(normalizeRelPath))].slice(0, MAX_PATHS)
}

/** Validate one remote name before it reaches argv. */
function normalizeRemote(input) {
  if (typeof input !== 'string') {
    throw new GitPanelError('git/bad-remote', 'A remote name is required.')
  }
  const name = input.trim()
  if (
    name === ''
    || name.startsWith('-')
    || name.includes('..')
    || /[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)
  ) {
    throw new GitPanelError('git/bad-remote', 'That is not a valid remote name.')
  }
  return name
}

/** Validate one local branch name before it reaches argv. */
function normalizeBranch(input) {
  if (typeof input !== 'string') {
    throw new GitPanelError('git/bad-branch', 'A branch name is required.')
  }
  const name = input.trim()
  if (
    name === ''
    || name.startsWith('-')
    || name.startsWith('/')
    || name.endsWith('/')
    || name.endsWith('.')
    || name.includes('..')
    || name.includes('@{')
    || name.includes('//')
    || /[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)
    || name.split('/').some((part) => part === '' || part === '.' || part === '..' || part.endsWith('.lock'))
  ) {
    throw new GitPanelError('git/bad-branch', 'That is not a valid branch name.')
  }
  return name
}

/**
 * Run one git command without a shell.
 *
 * @returns `{ ok: true, stdout, stderr }` or a classified failure.
 */
function runGit(gitPath, cwd, args, timeoutMs = READ_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const command = ['--no-pager', '-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args]
    try {
      const child = execFile(gitPath, command, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          PAGER: 'cat',
          GIT_EDITOR: 'true',
          EDITOR: 'true',
        },
      }, (error, stdout, stderr) => {
        if (error) {
          const missing = error.code === 'ENOENT' || /ENOENT/.test(String(error.message))
          const killed = Boolean(error.killed || error.signal)
          const message = missing
            ? 'Git was not found. Install Git and make sure it is on PATH.'
            : killed
              ? `Git did not finish within ${Math.round(timeoutMs / 1000)} seconds.`
              : clean(stderr) || clean(error.message) || 'Git failed.'
          finish({
            ok: false,
            missing,
            message,
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? ''),
          })
          return
        }
        finish({ ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
      })
      child.on('error', (error) => {
        finish({
          ok: false,
          missing: error.code === 'ENOENT',
          message: clean(error.message),
          stdout: '',
          stderr: '',
        })
      })
    } catch (error) {
      finish({ ok: false, missing: false, message: clean(error?.message ?? error), stdout: '', stderr: '' })
    }
  })
}

async function mustGit(gitPath, cwd, args, timeoutMs) {
  const result = await runGit(gitPath, cwd, args, timeoutMs)
  if (!result.ok) {
    throw new GitPanelError(result.missing ? 'git/missing' : 'git/command-failed', result.message)
  }
  return result.stdout
}

/** The repository root containing `cwd`, or null when it is not a work tree. */
async function repoRoot(gitPath, cwd) {
  const inside = await runGit(gitPath, cwd, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok || inside.stdout.trim() !== 'true') return null
  const top = await mustGit(gitPath, cwd, ['rev-parse', '--show-toplevel'])
  return path.resolve(top.trim())
}

async function mustRepoRoot(gitPath, cwd) {
  const root = await repoRoot(gitPath, cwd)
  if (root === null) {
    throw new GitPanelError('git/no-repository', 'This folder is not inside a Git repository.')
  }
  return root
}

/**
 * Parse `git status --porcelain=v1 -z --branch`.
 *
 * The first record is the branch header; `-z` terminates every path with NUL and
 * emits a rename's original path as the record after its new path.
 */
export function parseStatus(text) {
  const tokens = String(text ?? '').split('\0')
  const head = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    unborn: false,
  }
  const staged = []
  const unstaged = []
  const conflicts = []

  for (let index = 0; index < tokens.length; index += 1) {
    const record = tokens[index]
    if (record === '') continue
    if (record.startsWith('## ')) {
      Object.assign(head, parseBranchHeader(record.slice(3)))
      continue
    }
    if (record.length < 4) continue
    const x = record[0]
    const y = record[1]
    const filePath = record.slice(3)
    let originalPath = null
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      originalPath = tokens[index + 1] ?? null
      index += 1
    }

    if (x === '?' && y === '?') {
      unstaged.push({ path: filePath, originalPath: null, status: 'U', untracked: true })
      continue
    }
    if (x === '!' && y === '!') continue

    const conflicted = isConflict(x, y)
    if (conflicted) {
      conflicts.push({ path: filePath, originalPath, status: '!', untracked: false, conflicted: true })
      continue
    }

    const indexStatus = stagedStatus(x)
    if (indexStatus !== null) {
      staged.push({ path: filePath, originalPath, status: indexStatus, untracked: false })
    }
    const worktreeStatus = worktreeStatusOf(y)
    if (worktreeStatus !== null) {
      unstaged.push({ path: filePath, originalPath, status: worktreeStatus, untracked: false })
    }
  }

  return { head, staged, unstaged, conflicts }
}

function isConflict(x, y) {
  if (x === 'U' || y === 'U') return true
  return (x === 'A' && y === 'A') || (x === 'D' && y === 'D')
}

function stagedStatus(x) {
  switch (x) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'C': return 'C'
    case 'T': return 'T'
    default: return null
  }
}

function worktreeStatusOf(y) {
  switch (y) {
    case 'M': return 'M'
    case 'D': return 'D'
    case 'T': return 'T'
    case 'A': return 'A'
    case 'R': return 'R'
    case 'C': return 'C'
    default: return null
  }
}

/** Parse the text after `## ` in a porcelain v1 status header. */
export function parseBranchHeader(header) {
  const result = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    unborn: false,
  }
  if (header.startsWith('No commits yet on ')) {
    result.branch = header.slice('No commits yet on '.length).trim()
    result.unborn = true
    return result
  }
  if (header === 'HEAD (no branch)') {
    result.detached = true
    return result
  }
  const bracket = header.match(/^(.*?)(?:\s+\[(.+)\])?$/)
  if (!bracket) return result
  const body = bracket[1] ?? ''
  const counts = bracket[2] ?? ''
  const separator = body.indexOf('...')
  if (separator === -1) {
    result.branch = body.trim() || null
  } else {
    result.branch = body.slice(0, separator).trim() || null
    result.upstream = body.slice(separator + 3).trim() || null
  }
  for (const part of counts.split(',')) {
    const value = part.trim()
    const ahead = value.match(/^ahead (\d+)$/)
    const behind = value.match(/^behind (\d+)$/)
    if (ahead) result.ahead = Number(ahead[1])
    if (behind) result.behind = Number(behind[1])
  }
  return result
}

/** List configured remotes with their fetch URL. */
async function listRemotes(gitPath, root) {
  const result = await runGit(gitPath, root, ['remote', '-v'])
  if (!result.ok) return []
  const seen = new Map()
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
    if (match === null) continue
    const [, name, url] = match
    if (!seen.has(name)) seen.set(name, { name, url })
  }
  return [...seen.values()]
}

/** Read branches, newest commit first; an unborn HEAD yields an empty list. */
async function readBranches(gitPath, root) {
  const result = await runGit(gitPath, root, [
    'for-each-ref',
    '--sort=-committerdate',
    'refs/heads',
    '--format=%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(committerdate:iso-strict)%1f%(subject)',
  ])
  if (!result.ok) return []
  return result.stdout
    .split('\n')
    .filter((line) => line !== '')
    .slice(0, 200)
    .map((line) => {
      const [name = '', head = '', upstream = '', date = '', subject = ''] = line.split('\x1f')
      return {
        name,
        current: head === '*',
        upstream: upstream === '' ? null : upstream,
        date: date === '' ? null : date,
        subject,
      }
    })
    .filter((branch) => branch.name !== '')
}

/** Read the most recent commits; an unborn HEAD yields an empty list. */
async function readCommits(gitPath, root) {
  const result = await runGit(gitPath, root, [
    'log',
    '-n',
    '40',
    '--date=iso-strict',
    '--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e',
  ])
  if (!result.ok) return []
  return result.stdout
    .split('\x1e')
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record !== '')
    .slice(0, 40)
    .map((record) => {
      const [hash = '', short = '', author = '', email = '', date = '', subject = ''] = record.split('\x1f')
      return { hash, short, author, email, date, subject }
    })
    .filter((commit) => commit.hash !== '')
}

/** Strip the `a/` or `b/` prefix from a patch header path. */
function stripDiffPath(value) {
  let text = String(value ?? '').trim()
  if (text === '/dev/null') return ''
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1).replace(/\\(.)/g, '$1')
  }
  if (text.startsWith('a/') || text.startsWith('b/')) return text.slice(2)
  return text
}

/**
 * Parse one unified patch into renderable files.
 *
 * Headers (`---`/`+++`) are only recognised outside a hunk so a deleted line
 * whose content begins with `--` cannot be mistaken for a file header.
 */
export function parsePatch(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  const files = []
  let file = null
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  let total = 0
  let truncated = false

  const ensureFile = () => {
    if (file === null) {
      file = { header: '', path: '', originalPath: null, binary: false, combined: false, lines: [] }
      files.push(file)
    }
    return file
  }
  const push = (line) => {
    ensureFile().lines.push(line)
    total += 1
    if (total >= MAX_DIFF_LINES) truncated = true
    return !truncated
  }

  for (const raw of lines) {
    if (truncated) break
    if (raw.startsWith('diff --git ') || raw.startsWith('diff --cc ') || raw.startsWith('diff --combined ')) {
      const combined = raw.startsWith('diff --cc ') || raw.startsWith('diff --combined ')
      file = { header: raw, path: '', originalPath: null, binary: false, combined, lines: [] }
      files.push(file)
      inHunk = false
      total += 1
      if (total >= MAX_DIFF_LINES) truncated = true
      continue
    }
    if (raw === '') continue
    if (file === null) {
      file = { header: '', path: '', originalPath: null, binary: false, combined: false, lines: [] }
      files.push(file)
    }
    if (!inHunk && raw.startsWith('rename from ')) {
      file.originalPath = raw.slice('rename from '.length)
      if (!push({ kind: 'meta', text: raw })) break
      continue
    }
    if (!inHunk && raw.startsWith('rename to ')) {
      file.path = raw.slice('rename to '.length)
      if (!push({ kind: 'meta', text: raw })) break
      continue
    }
    if (!inHunk && raw.startsWith('Binary files ')) {
      file.binary = true
      if (!push({ kind: 'meta', text: raw })) break
      continue
    }
    if (!inHunk && raw.startsWith('--- ')) {
      const value = stripDiffPath(raw.slice(4))
      if (value !== '') file.originalPath = value
      if (!push({ kind: 'meta', text: raw })) break
      continue
    }
    if (!inHunk && raw.startsWith('+++ ')) {
      const value = stripDiffPath(raw.slice(4))
      if (value !== '') file.path = value
      if (!push({ kind: 'meta', text: raw })) break
      continue
    }
    const combinedHunk = raw.match(/^@@@ -(\d+)(?:,\d+)? -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@@/)
    if (combinedHunk) {
      inHunk = true
      file.combined = true
      oldLine = Number(combinedHunk[1])
      newLine = Number(combinedHunk[3])
      if (!push({ kind: 'hunk', text: raw, oldLine, newLine })) break
      continue
    }
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      inHunk = true
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      if (!push({ kind: 'hunk', text: raw, oldLine, newLine })) break
      continue
    }
    if (inHunk && file.combined) {
      // A combined diff (`diff --cc`) carries one status column per parent.
      // A plus in either column is an addition, a minus in either is a removal;
      // the two columns themselves are not part of the content.
      const marker = raw.slice(0, 2)
      const content = raw.slice(2)
      if (marker === '  ') {
        if (!push({ kind: 'ctx', text: content, oldLine, newLine })) break
        oldLine += 1
        newLine += 1
        continue
      }
      if (marker[0] === '+' || marker[1] === '+') {
        if (!push({ kind: 'add', text: content, newLine })) break
        newLine += 1
        continue
      }
      if (marker[0] === '-' || marker[1] === '-') {
        if (!push({ kind: 'del', text: content, oldLine })) break
        oldLine += 1
        continue
      }
    }
    if (inHunk && raw.startsWith('+')) {
      if (!push({ kind: 'add', text: raw.slice(1), newLine })) break
      newLine += 1
      continue
    }
    if (inHunk && raw.startsWith('-')) {
      if (!push({ kind: 'del', text: raw.slice(1), oldLine })) break
      oldLine += 1
      continue
    }
    if (inHunk && raw.startsWith(' ')) {
      if (!push({ kind: 'ctx', text: raw.slice(1), oldLine, newLine })) break
      oldLine += 1
      newLine += 1
      continue
    }
    if (raw.startsWith('\\')) {
      if (!push({ kind: 'note', text: raw })) break
      continue
    }
    if (!push({ kind: 'meta', text: raw })) break
  }

  for (const entry of files) {
    if (entry.path === '') entry.path = entry.originalPath ?? guessPatchPath(entry.header)
    if (entry.path === '' && entry.originalPath !== null) entry.path = entry.originalPath
  }
  return { files, truncated }
}

function guessPatchPath(header) {
  if (header.startsWith('diff --cc ')) return header.slice('diff --cc '.length)
  if (header.startsWith('diff --combined ')) return header.slice('diff --combined '.length)
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(header)
  if (!match) return ''
  return match[2] ?? match[1] ?? ''
}

/** Build a synthetic patch for an untracked text file. */
async function untrackedDiff(root, relativePath) {
  const absolute = path.join(root, relativePath)
  const stat = await fs.stat(absolute).catch(() => null)
  if (stat === null || !stat.isFile()) return ''
  if (stat.size > MAX_FILE_BYTES) {
    return `diff --git a/${relativePath} b/${relativePath}\nBinary files a/${relativePath} and b/${relativePath} differ\n`
  }
  const buffer = await fs.readFile(absolute)
  if (buffer.includes(0)) {
    return `diff --git a/${relativePath} b/${relativePath}\nBinary files a/${relativePath} and b/${relativePath} differ\n`
  }
  const content = buffer.toString('utf8').replace(/\r\n/g, '\n')
  const lines = content.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  const body = lines.map((line) => `+${line}`).join('\n')
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${relativePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
    '',
  ].join('\n')
}

/** Full repository snapshot for one admitted Workspace. */
export async function readState(gitPath, cwd) {
  const root = await repoRoot(gitPath, cwd)
  const generatedAt = new Date().toISOString()
  if (root === null) {
    return { repo: null, staged: [], unstaged: [], conflicts: [], branches: [], commits: [], remotes: [], generatedAt }
  }
  const statusOut = await mustGit(gitPath, root, [
    'status',
    '--porcelain=v1',
    '-z',
    '--branch',
    '--untracked-files=all',
  ])
  const parsed = parseStatus(statusOut)
  const [branches, commits, remotes] = await Promise.all([
    readBranches(gitPath, root),
    readCommits(gitPath, root),
    listRemotes(gitPath, root),
  ])
  return {
    repo: { root, name: path.basename(root) || root, ...parsed.head },
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    conflicts: parsed.conflicts,
    branches,
    commits,
    remotes,
    generatedAt,
  }
}

/** One file's patch in the selected group. */
export async function readDiff(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const relativePath = normalizeRelPath(payload.path)
  const group = payload.group === 'staged' ? 'staged' : 'unstaged'
  // A pathspec limited to the new name hides the old name, so git cannot
  // recognise a rename. Include the original path when the browser knows it.
  const originalPath = typeof payload.originalPath === 'string' && payload.originalPath !== ''
    ? normalizeRelPath(payload.originalPath)
    : null
  const pathspec = originalPath !== null && originalPath !== relativePath
    ? [relativePath, originalPath]
    : [relativePath]
  let text = group === 'staged'
    ? await mustGit(gitPath, root, [
      'diff', '--cached', '--no-color', '--no-ext-diff', '--find-renames', '-U3', '--', ...pathspec,
    ])
    : await mustGit(gitPath, root, [
      'diff', '--no-color', '--no-ext-diff', '--find-renames', '-U3', '--', ...pathspec,
    ])
  let untracked = false
  if (group === 'unstaged' && text.trim() === '') {
    const statusOut = await mustGit(gitPath, root, ['status', '--porcelain=v1', '-z', '--', relativePath])
    if (statusOut.startsWith('??')) {
      untracked = true
      text = await untrackedDiff(root, relativePath)
    }
  }
  const parsed = parsePatch(text)
  return { path: relativePath, group, untracked, files: parsed.files, truncated: parsed.truncated }
}

/** One commit's metadata and patch. */
export async function readShow(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const hash = String(payload.hash ?? '')
  if (!/^[0-9a-fA-F]{4,40}$/.test(hash)) {
    throw new GitPanelError('git/bad-revision', 'That is not a valid commit id.')
  }
  const meta = await mustGit(gitPath, root, [
    'show', '-s', '--date=iso-strict',
    '--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e',
    hash,
  ])
  const [hashFull = '', short = '', author = '', email = '', date = '', subject = ''] =
    meta.split('\x1e')[0].split('\x1f')
  const patch = await mustGit(gitPath, root, [
    'show', '--pretty=format:', '--patch', '--no-color', '--no-ext-diff', '--find-renames', '-U3', hash,
  ])
  const parsed = parsePatch(patch)
  return {
    commit: { hash: hashFull, short, author, email, date, subject },
    files: parsed.files,
    truncated: parsed.truncated,
  }
}

export async function stage(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  if (payload.all === true) {
    await mustGit(gitPath, root, ['add', '-A'])
    return { staged: 'all' }
  }
  const paths = normalizePaths(payload.paths)
  await mustGit(gitPath, root, ['add', '--', ...paths])
  return { staged: paths.length }
}

export async function unstage(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const paths = payload.all === true ? ['.'] : normalizePaths(payload.paths)
  const result = await runGit(gitPath, root, ['restore', '--staged', '--', ...paths])
  if (!result.ok) {
    // An unborn HEAD has no tree for `restore` to read; the index itself is the
    // only record, so remove the entries directly.
    await mustGit(gitPath, root, ['rm', '--cached', '--quiet', '-r', '--', ...paths])
  }
  return { unstaged: paths.length }
}

export async function discard(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const paths = normalizePaths(payload.paths)
  const statusOut = await mustGit(gitPath, root, ['status', '--porcelain=v1', '-z', '--', ...paths])
  const untracked = new Set()
  for (const token of statusOut.split('\0')) {
    if (token.startsWith('?? ')) untracked.add(token.slice(3))
  }
  const tracked = paths.filter((entry) => !untracked.has(entry))
  if (tracked.length > 0) {
    await mustGit(gitPath, root, ['restore', '--', ...tracked])
  }
  for (const entry of untracked) {
    await fs.rm(path.join(root, entry), { force: true })
  }
  return { discarded: paths.length }
}

export async function commit(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const message = String(payload.message ?? '').trim()
  if (message === '') {
    throw new GitPanelError('git/empty-message', 'Enter a commit message.')
  }
  if (payload.stageAll === true) {
    await mustGit(gitPath, root, ['add', '-A'])
  }
  const args = ['commit', '-m', message]
  if (payload.amend === true) args.push('--amend')
  const result = await runGit(gitPath, root, args)
  if (!result.ok) {
    throw new GitPanelError('git/commit-failed', result.message)
  }
  const head = await runGit(gitPath, root, ['rev-parse', '--short', 'HEAD'])
  return { hash: head.ok ? head.stdout.trim() : '', output: clean(result.stdout) }
}

export async function checkout(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const branch = normalizeBranch(payload.branch)
  await mustGit(gitPath, root, ['switch', branch])
  return { branch }
}

export async function createBranch(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const branch = normalizeBranch(payload.branch)
  await mustGit(gitPath, root, ['switch', '-c', branch])
  return { branch }
}

export async function deleteBranch(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const branch = normalizeBranch(payload.branch)
  const statusOut = await mustGit(gitPath, root, ['status', '--porcelain=v1', '-z', '--branch'])
  const { head } = parseStatus(statusOut)
  if (head.branch === branch) {
    throw new GitPanelError('git/branch-current', 'Switch away from the branch before deleting it.')
  }
  try {
    await mustGit(gitPath, root, ['branch', '-d', branch])
  } catch (error) {
    throw new GitPanelError('git/branch-delete-failed', clean(error?.message ?? error) || 'Could not delete the branch.')
  }
  return { branch }
}

export async function fetchRemote(gitPath, cwd) {
  const root = await mustRepoRoot(gitPath, cwd)
  const result = await runGit(gitPath, root, ['fetch', '--all', '--prune'], NETWORK_TIMEOUT_MS)
  if (!result.ok) throw new GitPanelError('git/fetch-failed', result.message)
  return { output: clean(result.stderr || result.stdout) }
}

export async function pull(gitPath, cwd) {
  const root = await mustRepoRoot(gitPath, cwd)
  const result = await runGit(gitPath, root, ['pull', '--no-edit'], NETWORK_TIMEOUT_MS)
  if (!result.ok) throw new GitPanelError('git/pull-failed', result.message)
  return { output: clean(result.stdout || result.stderr) }
}

export async function push(gitPath, cwd) {
  const root = await mustRepoRoot(gitPath, cwd)
  const statusOut = await mustGit(gitPath, root, ['status', '--porcelain=v1', '-z', '--branch'])
  const { head } = parseStatus(statusOut)
  let args = ['push']
  if (head.branch !== null && head.upstream === null) {
    const remotes = (await mustGit(gitPath, root, ['remote']))
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
    const remote = remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : null
    if (remote === null) {
      throw new GitPanelError(
        'git/push-failed',
        'This branch has no upstream and no unambiguous remote. Set one with git push --set-upstream <remote> <branch>.',
      )
    }
    args = ['push', '--set-upstream', remote, head.branch]
  }
  const result = await runGit(gitPath, root, args, NETWORK_TIMEOUT_MS)
  if (!result.ok) throw new GitPanelError('git/push-failed', result.message)
  return { output: clean(result.stderr || result.stdout) }
}

/** List the fetched branches of one remote, without the remote prefix. */
export async function readRemoteBranches(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const remote = normalizeRemote(payload.remote)
  const remotes = await listRemotes(gitPath, root)
  if (!remotes.some((entry) => entry.name === remote)) {
    throw new GitPanelError('git/remote-not-found', `Unknown remote ${JSON.stringify(remote)}.`)
  }
  const result = await runGit(gitPath, root, [
    'for-each-ref',
    '--sort=refname',
    `refs/remotes/${remote}`,
    '--format=%(refname:short)',
  ])
  if (!result.ok) throw new GitPanelError('git/branch-list-failed', result.message)
  const prefix = `${remote}/`
  const branches = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix) && line !== `${prefix}HEAD`)
    .map((line) => line.slice(prefix.length))
    .filter((name) => name !== '')
    .slice(0, 500)
  return { remote, branches }
}

/** Point one local branch at a remote-tracking branch. */
export async function setUpstream(gitPath, cwd, payload = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const branch = normalizeBranch(payload.branch)
  const remote = normalizeRemote(payload.remote)
  const remoteBranch = normalizeBranch(payload.remoteBranch)
  const remotes = await listRemotes(gitPath, root)
  if (!remotes.some((entry) => entry.name === remote)) {
    throw new GitPanelError('git/remote-not-found', `Unknown remote ${JSON.stringify(remote)}.`)
  }
  const upstream = `${remote}/${remoteBranch}`
  try {
    await mustGit(gitPath, root, ['branch', `--set-upstream-to=${upstream}`, branch])
  } catch (error) {
    throw new GitPanelError('git/upstream-failed', clean(error?.message ?? error) || 'Could not set the upstream branch.')
  }
  return { branch, upstream }
}

export async function init(gitPath, cwd) {
  const result = await runGit(gitPath, cwd, ['init', '-b', 'main'])
  if (!result.ok) {
    const fallback = await runGit(gitPath, cwd, ['init'])
    if (!fallback.ok) throw new GitPanelError('git/init-failed', fallback.message)
  }
  return { initialized: true }
}

/**
 * Build the bounded prompt input for one commit message.
 *
 * The staged diff is the source when anything is staged, because that is what
 * a plain commit would record. Otherwise the working-tree diff is used, and an
 * untracked-only change is quoted from the files themselves.
 */
async function readMessageInput(gitPath, root, parsed) {
  const lines = []
  lines.push(`Repository: ${path.basename(root) || root}`)
  lines.push(`Branch: ${parsed.head.branch ?? (parsed.head.detached ? 'detached HEAD' : 'unknown')}`)
  const changed = []
  for (const entry of parsed.conflicts) changed.push(`! ${entry.path}`)
  for (const entry of parsed.staged) {
    changed.push(`${entry.status} ${entry.path}${entry.originalPath ? ` (from ${entry.originalPath})` : ''}`)
  }
  for (const entry of parsed.unstaged) {
    changed.push(`${entry.untracked ? '??' : entry.status} ${entry.path}${entry.originalPath ? ` (from ${entry.originalPath})` : ''}`)
  }
  lines.push('Changed files:')
  lines.push(...changed.slice(0, 100))
  if (changed.length > 100) lines.push(`… ${changed.length - 100} more files`)
  lines.push('')

  const staged = parsed.staged.length > 0
  const diff = await mustGit(gitPath, root, [
    'diff',
    ...(staged ? ['--cached'] : []),
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    '-U1',
  ])
  let body = diff
  if (body.trim() === '' && parsed.unstaged.some((entry) => entry.untracked)) {
    const chunks = []
    for (const entry of parsed.unstaged.filter((item) => item.untracked).slice(0, MESSAGE_MAX_UNTRACKED_FILES)) {
      const absolute = path.join(root, entry.path)
      const stat = await fs.stat(absolute).catch(() => null)
      if (stat === null || !stat.isFile()) continue
      if (stat.size > MESSAGE_MAX_UNTRACKED_BYTES * 8) {
        chunks.push(`New file ${entry.path} (too large to quote)`)
        continue
      }
      const buffer = await fs.readFile(absolute).catch(() => null)
      if (buffer === null || buffer.includes(0)) {
        chunks.push(`New file ${entry.path} (binary)`)
        continue
      }
      const content = buffer.toString('utf8').slice(0, MESSAGE_MAX_UNTRACKED_BYTES)
      chunks.push(`New file ${entry.path}:\n${content}${buffer.length > MESSAGE_MAX_UNTRACKED_BYTES ? '\n…' : ''}`)
    }
    if (chunks.length > 0) body = chunks.join('\n\n')
  }
  if (body.trim() !== '') {
    lines.push(staged ? 'Staged diff:' : 'Working tree diff:')
    lines.push(body)
  } else if (parsed.conflicts.length > 0) {
    lines.push('The working tree has unresolved merge conflicts.')
  }

  let input = lines.join('\n')
  let truncated = false
  if (input.length > MESSAGE_MAX_INPUT_CHARS) {
    input = `${input.slice(0, MESSAGE_MAX_INPUT_CHARS)}\n… (diff truncated)`
    truncated = true
  }
  return { input, truncated, files: changed.length }
}

/** Strip fences, labels, quotes, and whole-line emphasis from model output. */
export function cleanCommitMessage(text) {
  let value = String(text ?? '').replace(/\r\n/g, '\n').trim()
  value = value.replace(/^```[a-zA-Z0-9_-]*\s*\n?/u, '').replace(/\n?```$/u, '').trim()
  value = value.replace(/^(?:commit message|message|提交信息|提交说明|提交消息)\s*[:：]\s*/iu, '').trim()
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'") || (first === '“' && last === '”')) {
      value = value.slice(1, -1).trim()
    }
  }
  const [subject = '', ...rest] = value.split('\n')
  const cleanedSubject = subject
    .replace(/^\*\*(.+)\*\*$/u, '$1')
    .replace(/^`(.+)`$/u, '$1')
    .trim()
  return [cleanedSubject, ...rest].join('\n').trim()
}

/** System instruction for the message model, in the UI's language. */
function messageSystemPrompt(locale) {
  const chinese = typeof locale === 'string' && locale.toLowerCase().startsWith('zh')
  return [
    'You write Git commit messages for a source-control panel.',
    'Return only the final commit message in plain text: no Markdown fences, no surrounding quotes, no explanation, and no preamble.',
    'Use an imperative subject line of at most 72 characters.',
    'Add a blank line and a short body (wrapped at 72 columns) only when the change is substantial.',
    'Describe only what the supplied changed-file list and diff show. Do not invent files, tests, issue numbers, or behaviour.',
    chinese ? 'Write the message in Simplified Chinese.' : 'Write the message in English.',
  ].join('\n')
}

/**
 * Read the profile's new-session default model, when one is configured.
 *
 * The panel offers that selection as "Default"; the host also uses it when the
 * request carries no explicit model.
 */
function readDefaultSelection(ctx) {
  try {
    const selection = safeGet(ctx, 'agentDefaultModel')?.currentSelection?.() ?? null
    if (selection === null || typeof selection !== 'object') return null
    if (typeof selection.provider !== 'string' || selection.provider === '') return null
    if (typeof selection.model !== 'string' || selection.model === '') return null
    return {
      provider: selection.provider,
      model: selection.model,
      ...(typeof selection.reasoningEffort === 'string' && selection.reasoningEffort !== ''
        ? { reasoningEffort: selection.reasoningEffort }
        : {}),
    }
  } catch {
    return null
  }
}

/** Read a model chosen in the panel; null means "use the default". */
function readMessageSelection(payload) {
  const provider = typeof payload?.provider === 'string' ? payload.provider.trim() : ''
  const model = typeof payload?.model === 'string' ? payload.model.trim() : ''
  if (provider === '' && model === '') return null
  if (provider === '' || model === '' || provider.length > 200 || model.length > 300) {
    throw new GitPanelError('git/model-invalid', 'The selected model is invalid.')
  }
  return { provider, model }
}

/**
 * List the model catalog offered by the profile's adapters, plus the
 * new-session default. The panel uses this for its model picker; one adapter
 * failing to list models contributes an error instead of failing the page.
 */
async function listMessageModels(ctx) {
  const defaultSelection = readDefaultSelection(ctx)
  const llm = safeGet(ctx, 'llm')
  if (llm === undefined || typeof llm.listProviders !== 'function') {
    return {
      default: defaultSelection,
      providers: [],
      models: [],
      errors: [{ provider: '*', message: 'The LLM service is unavailable in this profile.' }],
      truncated: false,
    }
  }
  let rawProviders
  try {
    rawProviders = llm.listProviders()
  } catch (error) {
    return {
      default: defaultSelection,
      providers: [],
      models: [],
      errors: [{ provider: '*', message: clean(error?.message ?? error) }],
      truncated: false,
    }
  }
  if (!Array.isArray(rawProviders)) rawProviders = []
  const seen = new Set()
  const providers = []
  for (const provider of rawProviders) {
    if (provider === null || typeof provider !== 'object') continue
    if (typeof provider.id !== 'string' || provider.id === '' || seen.has(provider.id)) continue
    seen.add(provider.id)
    providers.push({
      id: provider.id,
      name: typeof provider.name === 'string' && provider.name !== '' ? provider.name : provider.id,
    })
  }
  const boundedProviders = providers.slice(0, 24)
  const models = []
  const errors = []
  const maxModels = 500
  await Promise.all(boundedProviders.map(async (provider) => {
    if (typeof llm.listModels !== 'function') {
      errors.push({ provider: provider.id, message: 'Model listing is unavailable.' })
      return
    }
    try {
      const list = await llm.listModels(provider.id)
      if (!Array.isArray(list)) return
      for (const model of list) {
        if (models.length >= maxModels) return
        if (model === null || typeof model !== 'object') continue
        if (typeof model.id !== 'string' || model.id === '') continue
        models.push({
          provider: provider.id,
          model: model.id,
          name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
          ...(typeof model.description === 'string' && model.description !== ''
            ? { description: model.description }
            : {}),
        })
      }
    } catch (error) {
      errors.push({ provider: provider.id, message: clean(error?.message ?? error) })
    }
  }))
  models.sort((left, right) => {
    if (left.provider !== right.provider) return left.provider.localeCompare(right.provider)
    return left.name.localeCompare(right.name)
  })
  return {
    default: defaultSelection,
    providers: boundedProviders,
    models,
    errors,
    truncated: providers.length > boundedProviders.length || models.length >= maxModels,
  }
}

/**
 * Ask a model for a commit message.
 *
 * The call goes through `ctx.llm.prepareCall` so capability validation and
 * adapter defaults apply, then the stream is accumulated locally; the panel
 * only needs text, not the full block assembler.
 */
async function generateCommitMessage(ctx, cwd, payload, gitPath, options = {}) {
  const root = await mustRepoRoot(gitPath, cwd)
  const statusOut = await mustGit(gitPath, root, [
    'status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all',
  ])
  const parsed = parseStatus(statusOut)
  if (parsed.staged.length === 0 && parsed.unstaged.length === 0 && parsed.conflicts.length === 0) {
    throw new GitPanelError('git/no-changes', 'There are no changes to describe.')
  }
  const built = await readMessageInput(gitPath, root, parsed)

  const llm = safeGet(ctx, 'llm')
  if (llm === undefined || typeof llm.prepareCall !== 'function') {
    throw new GitPanelError('git/llm-unavailable', 'The LLM service is unavailable in this profile.')
  }
  let selection = readMessageSelection(payload)
    ?? (typeof options.messageProvider === 'string' && options.messageProvider !== ''
      ? { provider: options.messageProvider, model: options.messageModel }
      : null)
    ?? readDefaultSelection(ctx)
  const provider = selection?.provider
  const model = selection?.model
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') {
    throw new GitPanelError('git/no-model', 'No model is configured. Pick one in the commit box or Settings, Models.')
  }

  const signal = AbortSignal.timeout(MESSAGE_TIMEOUT_MS)
  let call
  try {
    call = await llm.prepareCall(
      { provider, model, maxTokens: MESSAGE_MAX_OUTPUT_TOKENS },
      signal,
      (controls, modelInfo) => {
        const efforts = Array.isArray(modelInfo?.reasoning?.efforts) ? modelInfo.reasoning.efforts : []
        const preferred = typeof selection?.reasoningEffort === 'string'
          && efforts.some((effort) => effort.id === selection.reasoningEffort)
          ? selection.reasoningEffort
          : modelInfo?.reasoning?.defaultEffort ?? efforts[0]?.id
        return preferred === undefined ? controls : { ...controls, reasoningEffort: preferred }
      },
    )
  } catch (error) {
    throw new GitPanelError('git/message-failed', clean(error?.message ?? error) || 'The model could not be prepared.')
  }

  const textByIndex = new Map()
  let finish = null
  try {
    const stream = call.stream({
      ...call.config,
      messages: [{ role: 'user', content: [{ type: 'text', text: built.input }] }],
      system: messageSystemPrompt(payload.locale),
      signal,
    })
    for await (const chunk of stream) {
      signal.throwIfAborted()
      if (chunk.type === 'text-delta') {
        textByIndex.set(chunk.index, (textByIndex.get(chunk.index) ?? '') + chunk.text)
      } else if (chunk.type === 'block-end' && chunk.block?.type === 'text') {
        textByIndex.set(chunk.index, chunk.block.text)
      } else if (chunk.type === 'finish') {
        finish = chunk.reason
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError' || signal.aborted) {
      throw new GitPanelError('git/message-timeout', 'The model did not answer in time.')
    }
    throw new GitPanelError('git/message-failed', clean(error?.message ?? error) || 'The model request failed.')
  }
  if (finish !== null && (finish.kind === 'error' || finish.kind === 'aborted')) {
    throw new GitPanelError('git/message-failed', clean(finish.failure?.message) || 'The model request failed.')
  }
  if (finish !== null && finish.kind === 'tool-calls') {
    throw new GitPanelError('git/message-failed', 'The model returned a tool call instead of a commit message.')
  }

  const message = cleanCommitMessage(
    [...textByIndex.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([, value]) => value)
      .join(''),
  )
  if (message === '') {
    throw new GitPanelError('git/message-empty', 'The model returned an empty commit message.')
  }
  return { message, model: { provider, model }, files: built.files, truncated: built.truncated }
}

/** Read the Workspaces this profile may operate on. */
function listWorkspaces(ctx) {
  const workspaces = []
  const registry = safeGet(ctx, 'workspaceRegistry')
  if (registry !== undefined && typeof registry.list === 'function') {
    for (const workspace of registry.list()) {
      if (workspace === null || typeof workspace !== 'object') continue
      if (typeof workspace.path !== 'string' || workspace.path === '') continue
      workspaces.push({
        id: String(workspace.id ?? workspace.path),
        title: typeof workspace.title === 'string' && workspace.title !== ''
          ? workspace.title
          : (path.basename(workspace.path) || workspace.path),
        path: workspace.path,
      })
    }
  }
  const workingDirectory = safeGet(ctx, 'workingDirectory')
  const fallback = workingDirectory !== undefined && typeof workingDirectory.defaultDirectory === 'string'
    ? workingDirectory.defaultDirectory
    : null
  if (fallback !== null && !workspaces.some((workspace) => samePath(workspace.path, fallback))) {
    workspaces.push({ id: 'default', title: path.basename(fallback) || fallback, path: fallback })
  }
  return workspaces
}

function safeGet(ctx, name) {
  try {
    return ctx.get(name)
  } catch {
    return undefined
  }
}

/** True when `target` is `root` itself or a descendant of it. */
function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** Admit one request's directory: a Workspace root or a repository inside it. */
async function admitPath(ctx, cwd) {
  if (typeof cwd !== 'string' || cwd.trim() === '' || !path.isAbsolute(cwd)) {
    throw new GitPanelError('git/not-workspace', 'A Workspace directory is required.')
  }
  const target = path.resolve(cwd)
  const owner = listWorkspaces(ctx).find((workspace) => isInside(workspace.path, target))
  if (owner === undefined) {
    throw new GitPanelError('git/not-workspace', 'That directory is not inside a registered Workspace.')
  }
  // Resolve symlinks on both sides so a link cannot walk out of the Workspace.
  const [realTarget, realOwner] = await Promise.all([
    fs.realpath(target).catch(() => null),
    fs.realpath(owner.path).catch(() => owner.path),
  ])
  if (realTarget === null || !isInside(realOwner, realTarget)) {
    throw new GitPanelError('git/not-workspace', 'That directory resolves outside its Workspace.')
  }
  return realTarget
}

/** Directory names a repository scan never descends into. */
const SCAN_SKIP = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.cache', 'coverage', '.venv', 'venv', '__pycache__',
  'bin', 'obj', '.idea', '.vscode', '.turbo', '.gradle', '.mvn',
])
/** Depth below the Workspace root the scan walks. */
const SCAN_MAX_DEPTH = 4
/** Directory budget for one scan. */
const SCAN_MAX_DIRS = 2000

/**
 * Discover Git repositories inside one admitted Workspace.
 *
 * The walk is filesystem-only (no `git` process per candidate), bounded by
 * depth and directory count, skips symlinks and heavy build directories, and
 * reports a repository as soon as a `.git` directory or file is present.
 */
export async function scanRepositories(root) {
  const repos = []
  const queue = [{ dir: root, depth: 0 }]
  let visited = 0
  let truncated = false

  while (queue.length > 0) {
    if (visited >= SCAN_MAX_DIRS) {
      truncated = true
      break
    }
    const { dir, depth } = queue.shift()
    visited += 1
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    const hasGit = entries.some((entry) => (
      entry.name === '.git' && (entry.isDirectory() || entry.isFile())
    ))
    if (hasGit) {
      const relative = path.relative(root, dir).split(path.sep).join('/')
      repos.push({
        path: dir,
        relativePath: relative === '' ? '.' : relative,
        name: path.basename(dir) || dir,
      })
    }
    if (depth >= SCAN_MAX_DEPTH) continue
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SCAN_SKIP.has(entry.name)) continue
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
    }
  }

  repos.sort((left, right) => {
    if (left.relativePath === '.') return -1
    if (right.relativePath === '.') return 1
    return left.relativePath.localeCompare(right.relativePath)
  })
  return { workspace: root, repos, truncated }
}

/** Build the request-facing service; tests can call the low-level exports. */
export function createGitService(options = {}) {
  const gitPath = typeof options.gitPath === 'string' && options.gitPath.trim() !== ''
    ? options.gitPath.trim()
    : 'git'
  const messageProvider = typeof options.messageProvider === 'string' && options.messageProvider.trim() !== ''
    ? options.messageProvider.trim()
    : null
  const messageModel = typeof options.messageModel === 'string' && options.messageModel.trim() !== ''
    ? options.messageModel.trim()
    : null
  if ((messageProvider === null) !== (messageModel === null)) {
    throw new Error('dsh-git: messageProvider and messageModel must be supplied together')
  }

  return {
    async repos(ctx) {
      return { workspaces: listWorkspaces(ctx) }
    },
    async scan(ctx, payload) {
      return scanRepositories(await admitPath(ctx, payload.cwd))
    },
    async models(ctx) {
      return listMessageModels(ctx)
    },
    async message(ctx, payload) {
      return generateCommitMessage(
        ctx,
        await admitPath(ctx, payload.cwd),
        payload,
        gitPath,
        { messageProvider, messageModel },
      )
    },
    async state(ctx, payload) {
      return readState(gitPath, await admitPath(ctx, payload.cwd))
    },
    async diff(ctx, payload) {
      return readDiff(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async show(ctx, payload) {
      return readShow(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async stage(ctx, payload) {
      return stage(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async unstage(ctx, payload) {
      return unstage(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async discard(ctx, payload) {
      return discard(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async commit(ctx, payload) {
      return commit(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async checkout(ctx, payload) {
      return checkout(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async createBranch(ctx, payload) {
      return createBranch(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async deleteBranch(ctx, payload) {
      return deleteBranch(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async remoteBranches(ctx, payload) {
      return readRemoteBranches(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async setUpstream(ctx, payload) {
      return setUpstream(gitPath, await admitPath(ctx, payload.cwd), payload)
    },
    async fetch(ctx, payload) {
      return fetchRemote(gitPath, await admitPath(ctx, payload.cwd))
    },
    async pull(ctx, payload) {
      return pull(gitPath, await admitPath(ctx, payload.cwd))
    },
    async push(ctx, payload) {
      return push(gitPath, await admitPath(ctx, payload.cwd))
    },
    async init(ctx, payload) {
      return init(gitPath, await admitPath(ctx, payload.cwd))
    },
  }
}

const ACTIONS = new Set([
  'repos', 'scan', 'models', 'message', 'state', 'diff', 'show', 'stage', 'unstage', 'discard',
  'commit', 'checkout', 'createBranch', 'deleteBranch', 'remoteBranches', 'setUpstream',
  'fetch', 'pull', 'push', 'init',
])

async function dispatch(service, ctx, endpoint, payload) {
  try {
    if (!ACTIONS.has(endpoint)) {
      throw new GitPanelError('git/unknown-action', `Unknown action ${JSON.stringify(endpoint)}.`)
    }
    const value = await service[endpoint](ctx, payload !== null && typeof payload === 'object' ? payload : {})
    return { ok: true, value }
  } catch (error) {
    if (error instanceof GitPanelError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    return { ok: false, error: { code: 'git/failed', message: clean(error?.message ?? error) } }
  }
}

/**
 * Host half entry point.
 *
 * The route is registered inside `ctx.inject(['connection'])` so a profile
 * without the browser carrier simply leaves the plugin inactive.
 */
export function apply(ctx, config = {}) {
  const service = createGitService(config)
  ctx.inject(['connection'], (connectionCtx) => {
    const dispose = connectionCtx.connection.fetch.register({
      path: ROUTE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try {
          body = await request.json()
        } catch {
          return Response.json(
            { ok: false, error: { code: 'git/bad-request', message: 'The request body must be JSON.' } },
            { status: 400, headers: NO_STORE },
          )
        }
        const result = await dispatch(service, ctx, String(body?.endpoint ?? ''), body?.payload)
        return Response.json(result, { headers: NO_STORE })
      },
    })
    return dispose
  })
}
