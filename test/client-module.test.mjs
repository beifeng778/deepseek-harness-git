/**
 * Module-loader smoke test: executes the browser half's module scope with a
 * minimal React stand-in, then inspects the plugin object it returns.
 *
 * Run from the package directory:
 *   node test/client-module.test.mjs
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(specification) {
      captured = specification
    },
  },
  localStorage: {
    getItem() { return null },
    setItem() {},
    removeItem() {},
  },
}

globalThis.document = {
  createElement() {
    return { dataset: {}, textContent: '', remove() {} }
  },
  head: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
}

class FakeComponent {
  constructor(props) {
    this.props = props
    this.state = null
  }

  setState() {}
}
FakeComponent.prototype.isReactComponent = {}

const React = {
  Component: FakeComponent,
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  useState() { throw new Error('useState must not run at module scope') },
  useEffect() { throw new Error('useEffect must not run at module scope') },
  useMemo() { throw new Error('useMemo must not run at module scope') },
  useRef() { throw new Error('useRef must not run at module scope') },
  useCallback() { throw new Error('useCallback must not run at module scope') },
}

const moduleUrl = pathToFileURL(path.resolve('client.js')).href
await import(moduleUrl)

assert.ok(captured !== null, 'the module loader was not called')
assert.equal(captured.id, 'deepseek-harness-git', 'the loader id must match the package name')

const plugin = captured.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module request: ${name}`)
})

assert.equal(typeof plugin.apply, 'function', 'apply must be exported')
assert.deepEqual(plugin.inject, ['slots', 'connection'], 'the client inject list')

// Exercise registration with a minimal service face: this catches a missing
// service accessor, a bad slot option, or a throwing style effect without
// pretending to render React.
const registrations = []
const cleanups = []
const locale = {
  bind: () => (key) => key,
  register: () => () => {},
}
const ctx = {
  get(name) {
    if (name === 'locale') return locale
    if (name === 'connection') return {}
    return undefined
  },
  effect(callback, label) {
    const cleanup = callback()
    cleanups.push({ label, cleanup })
    return () => {}
  },
  inject(dependencies, callback) {
    assert.deepEqual(dependencies, ['locale'])
    return callback({ locale })
  },
  slots: {
    inject(owner, callback) {
      assert.equal(typeof owner, 'string')
      return callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

plugin.apply(ctx)
assert.equal(registrations.length, 2, 'one panel icon and one main page')
assert.equal(registrations[0].options.name, 'sidebar.panellist')
assert.equal(registrations[0].options.id, 'dsh-git')
assert.equal(typeof registrations[0].component, 'function')
assert.equal(registrations[1].options.name, 'main')
assert.equal(registrations[1].options.key, 'dsh-git')
assert.equal(typeof registrations[1].component, 'function')

const face = registrations[1].options.inject()
assert.equal(typeof face.t, 'function')
assert.equal(typeof face.call, 'function')
assert.equal(face.t('panelTitle'), 'Git')
assert.equal(face.t('filesCount', { n: 3 }), '3 files')

for (const { cleanup } of cleanups) {
  if (typeof cleanup === 'function') cleanup()
}

console.log('client module OK')
console.log(`  loader id: ${captured.id}`)
console.log(`  exports: apply + inject ${JSON.stringify(plugin.inject)}`)
console.log(`  registrations: ${registrations.map((entry) => entry.options.name).join(', ')}`)
