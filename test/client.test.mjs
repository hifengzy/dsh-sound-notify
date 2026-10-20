import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Minimal React stand-in: enough for the components' hook order and element trees. */
function fakeReact() {
  const createElement = (type, props, ...children) => ({ type, props: props ?? {}, children })
  const useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}]
  const useEffect = () => {}
  const useMemo = (factory) => factory()
  return { createElement, useState, useEffect, useMemo }
}

/** Minimal primitives stand-in exposing the controlled Switch. */
const FakeSwitch = function Switch() {}

/**
 * Load the hand-written client bundle in a fake module-loader environment.
 * @returns {{ registration: object, exports: object }}
 */
function loadBundle() {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const loaded = []
  const fakeWindow = {
    __ModuleLoader__: {
      load(registration) {
        loaded.push(registration)
      },
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', source)(fakeWindow)
  assert.equal(loaded.length, 1)
  const react = fakeReact()
  const primitives = { Switch: FakeSwitch }
  const require = (id) => {
    if (id === 'react') return react
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected require: ${id}`)
  }
  return { registration: loaded[0], exports: loaded[0].factory(require) }
}

/** Fake DSH 0.2.x config form controller. */
function fakeForm(value, options = {}) {
  const snapshot = {
    status: options.status ?? 'ready',
    value,
    base: undefined,
    user: undefined,
    revision: 7,
    writable: options.writable ?? true,
  }
  const writes = []
  const listeners = new Set()
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(field, next) {
      writes.push({ field, next })
      return Promise.resolve(options.accept ?? true)
    },
    dispose: () => {},
  }
}

/** Fake DSH 0.1.x settings scope. */
function fakeScope(value, options = {}) {
  const snapshot = {
    status: options.status ?? 'ready',
    value,
    writable: options.writable ?? true,
    revision: 3,
  }
  const writes = []
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set(field, next) {
      writes.push({ field, next })
      return Promise.resolve(options.accept ?? true)
    },
  }
}

/**
 * Run the client plugin against a fake context exposing only the surface a
 * given DSH version provides.
 *
 * @param {object} [options] - which providers exist and their fake values.
 * @returns {object} captured registrations and plugin exports.
 */
function runPlugin(options = {}) {
  const { exports, registration } = loadBundle()
  const state = {
    slots: [],
    injectSlots: [],
    effects: [],
    locales: undefined,
    bindSpec: undefined,
    components: {},
    form: options.form,
    scope: options.scope,
  }
  const slots = {
    inject(name, register) {
      state.injectSlots.push(name)
      register()
      return () => {}
    },
    register(meta, component) {
      state.slots.push({ meta, component })
      state.components[meta.name] = component
      return () => {}
    },
  }
  const locale = {
    register(namespace, dicts) {
      state.locales = { namespace, dicts }
    },
    bind() {
      return (key) => state.locales.dicts.zh[key] ?? key
    },
  }
  const configForms = options.configForms
    ? {
        get: () => options.form,
        whileServed: (namespaces, register) => {
          const off = register(new Set(namespaces))
          return typeof off === 'function' ? off : () => {}
        },
      }
    : undefined
  const settingsScope = options.settingsScope
    ? {
        bind: (spec) => {
          state.bindSpec = spec
          return options.scope
        },
      }
    : undefined
  const providers = { configForms, settingsScope }
  const ctx = {
    effect(factory, label) {
      state.effects.push(label)
      factory()
      return () => {}
    },
    locale,
    slots,
    inject(deps, callback) {
      for (const dep of deps) {
        const provider = providers[dep]
        if (provider === undefined) continue
        callback({ slots, locale, effect: ctx.effect, configForms, settingsScope })
      }
    },
  }
  exports.apply(ctx)
  return { exports, registration, state, slots }
}

/** Walk a fake element tree and concatenate string children. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

/** Collect every element whose type is the fake Switch. */
function switchesOf(node, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) switchesOf(child, found)
    return found
  }
  if (node.type === FakeSwitch) found.push(node)
  for (const child of node.children ?? []) switchesOf(child, found)
  return found
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('bundle registers the expected module and exports the plugin face', () => {
  const { registration, exports } = loadBundle()
  assert.equal(registration.id, 'dsh-sound-notify')
  assert.equal(typeof registration.factory, 'function')
  assert.equal(exports.name, 'sound-notify')
  assert.deepEqual(exports.inject, ['slots', 'locale'])
  assert.equal(typeof exports.apply, 'function')
})

test('DSH 0.2.x: registers one Plugins-page card and no legacy section', () => {
  const form = fakeForm({ success: true, failure: true, waiting: true })
  const { state } = runPlugin({ configForms: true, form })
  assert.deepEqual(state.injectSlots, ['plugins.item'])
  assert.equal(state.slots.length, 1)
  const entry = state.slots[0]
  assert.equal(entry.meta.name, 'plugins.item')
  assert.equal(entry.meta.id, 'sound-notify')
  assert.equal(entry.meta.order, 60)
  assert.equal(entry.meta.locale, 'sound-notify')
  assert.equal(entry.meta.label(), '声音提醒')
  assert.equal(entry.meta.inject().scope, form)
  assert.equal(state.locales.dicts.zh.nav, '声音提醒')
  assert.equal(state.locales.dicts.en.nav, 'Sound notifications')
})

test('DSH 0.2.x card: summary is one line, page renders three switches', () => {
  const form = fakeForm({ success: true, failure: false, waiting: true })
  const { state } = runPlugin({ configForms: true, form })
  const t = (key) => state.locales.dicts.zh[key] ?? key
  const card = state.components['plugins.item']
  assert.equal(card({ t, view: 'summary', scope: form }), '任务完成、失败或需要你处理时播放提示音。')
  const tree = card({ t, view: 'page', scope: form })
  const text = textOf(tree)
  assert.match(text, /任务完成/)
  assert.match(text, /任务失败/)
  assert.match(text, /等待你处理/)
  const switches = switchesOf(tree)
  assert.equal(switches.length, 3)
  assert.deepEqual(switches.map((element) => element.props.checked), [true, false, true])
})

test('DSH 0.2.x card: toggling writes through the config form', async () => {
  const form = fakeForm({ success: true, failure: true, waiting: true })
  const { state } = runPlugin({ configForms: true, form })
  const t = (key) => state.locales.dicts.zh[key] ?? key
  const card = state.components['plugins.item']
  const switches = switchesOf(card({ t, view: 'page', scope: form }))
  switches[0].props.onChange(false)
  await flush()
  assert.deepEqual(form.writes, [{ field: 'success', next: false }])
})

test('DSH 0.2.x card: loading, unavailable, read-only and failed states', async () => {
  const t = (key) => key
  const loading = runPlugin({ configForms: true, form: fakeForm(undefined, { status: 'loading' }) })
  assert.match(textOf(loading.state.components['plugins.item']({ t, view: 'page', scope: loading.state.form })), /loading/)

  const unavailable = runPlugin({ configForms: true, form: fakeForm(undefined, { status: 'unavailable' }) })
  assert.equal(switchesOf(unavailable.state.components['plugins.item']({ t, view: 'page', scope: unavailable.state.form })).length, 0)

  const readOnlyForm = fakeForm({}, { writable: false })
  const readOnly = runPlugin({ configForms: true, form: readOnlyForm })
  const tree = readOnly.state.components['plugins.item']({ t, view: 'page', scope: readOnlyForm })
  assert.equal(switchesOf(tree).every((element) => element.props.disabled === true), true)
})

test('DSH 0.1.x: registers one settings section and no Plugins card', () => {
  const scope = fakeScope({ success: true, failure: true, waiting: true })
  const { state } = runPlugin({ settingsScope: true, scope })
  assert.deepEqual(state.injectSlots, ['settings.section'])
  assert.deepEqual(state.bindSpec, { namespace: 'sound-notify' })
  assert.equal(state.slots.length, 1)
  const entry = state.slots[0]
  assert.equal(entry.meta.name, 'settings.section')
  assert.equal(entry.meta.id, 'sound-notify')
  assert.equal(entry.meta.order, 45)
  assert.equal(entry.meta.inject().scope, scope)
})

test('DSH 0.1.x section: renders and writes through the settings scope', async () => {
  const scope = fakeScope({ success: true, failure: false, waiting: true })
  const { state } = runPlugin({ settingsScope: true, scope })
  const t = (key) => state.locales.dicts.zh[key] ?? key
  const section = state.components['settings.section']
  const tree = section({ t, scope })
  const switches = switchesOf(tree)
  assert.equal(switches.length, 3)
  assert.deepEqual(switches.map((element) => element.props.checked), [true, false, true])
  switches[2].props.onChange(false)
  await flush()
  assert.deepEqual(scope.writes, [{ field: 'waiting', next: false }])
})

test('package manifest declares the client bundle and ships the sounds', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  for (const file of ['success.aac', 'fail.aac', 'stop.aac']) {
    assert.equal(existsSync(new URL(`../sounds/${file}`, import.meta.url)), true, `${file} must ship`)
  }
  assert.equal(existsSync(`${ROOT}lib/index.js`), true)
  assert.equal(existsSync(`${ROOT}lib/client.js`), true)
})
