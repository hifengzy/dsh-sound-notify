import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply, readConfigField } from '../lib/index.js'
import { createFakeContext, fakeAgent, fakeSession, sleep } from './helpers.mjs'

const GRACE = 20

/** Live config reference shaped like DSH 0.2.x volatile fields. */
function liveRef(value) {
  return { get: () => value }
}

/** Mount the host plugin in 0.2.x config mode (no settings namespace registry). */
function mountConfig(config, options = {}) {
  const fake = createFakeContext(options.settings, { legacySettings: false })
  const calls = []
  apply(fake.ctx, config, {
    playSound: (kind) => {
      calls.push(kind)
      return true
    },
    idleGraceMs: GRACE,
    cooldownMs: 0,
  })
  return { ...fake, calls }
}

/** Mount the host plugin with a recording player and short timings. */
function mount(options = {}) {
  const fake = createFakeContext(options.settings)
  const calls = []
  apply(fake.ctx, options.entryConfig ?? {}, {
    playSound: (kind, details) => {
      calls.push({ kind, soundDir: details?.soundDir })
      return true
    },
    idleGraceMs: GRACE,
    cooldownMs: 0,
  })
  return { ...fake, calls }
}

test('registers the sound-notify settings namespace with live defaults', () => {
  const { registrations } = mount()
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].namespace, 'sound-notify')
  assert.equal(registrations[0].options.applies, 'live')
  assert.deepEqual(registrations[0].schema({}), { success: true, failure: true, waiting: true })
})

test('completed turn plays success after the idle grace period', async () => {
  const { emit, calls } = mount()
  const session = fakeSession()
  const agent = fakeAgent(session)
  emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  emit('agent/status', { agent, status: 'idle' })
  assert.deepEqual(calls, [], 'must wait for the grace period')
  await sleep(GRACE + 30)
  assert.deepEqual(calls.map((call) => call.kind), ['success'])
  assert.match(calls[0].soundDir, /sounds/)
})

test('errored turn plays failure and max-tokens counts as failure', async () => {
  for (const reason of [{ kind: 'error', error: { code: 'boom' } }, { kind: 'max-tokens' }]) {
    const { emit, calls } = mount()
    const session = fakeSession(`s-${reason.kind}`)
    const agent = fakeAgent(session)
    emit('session/event', session, { type: 'turn/end', data: { turn: 2, reason } })
    emit('agent/status', { agent, status: 'idle' })
    await sleep(GRACE + 30)
    assert.deepEqual(calls.map((call) => call.kind), ['failure'])
  }
})

test('aborted and blocked turns play the waiting sound', async () => {
  for (const reason of [{ kind: 'aborted', reason: { kind: 'user' } }, { kind: 'blocked' }, { kind: 'interrupted' }]) {
    const { emit, calls } = mount()
    const session = fakeSession(`s-${reason.kind}`)
    const agent = fakeAgent(session)
    emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason } })
    emit('agent/status', { agent, status: 'idle' })
    await sleep(GRACE + 30)
    assert.deepEqual(calls.map((call) => call.kind), ['waiting'])
  }
})

test('a provider retry announces failure once and does not repeat at turn end', async () => {
  const { emit, calls } = mount()
  const session = fakeSession()
  const agent = fakeAgent(session)
  emit('session/event', session, { type: 'llm/retry', data: { turn: 1, failure: { code: '429' } } })
  emit('session/event', session, { type: 'llm/retry', data: { turn: 1, failure: { code: '429' } } })
  assert.deepEqual(calls.map((call) => call.kind), ['failure'])
  emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'error', error: {} } } })
  emit('agent/status', { agent, status: 'idle' })
  await sleep(GRACE + 30)
  assert.deepEqual(calls.map((call) => call.kind), ['failure'], 'terminal error must not double-ring')
})

test('a retry followed by success plays failure then success', async () => {
  const { emit, calls } = mount()
  const session = fakeSession()
  const agent = fakeAgent(session)
  emit('session/event', session, { type: 'llm/retry', data: { turn: 1 } })
  emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  emit('agent/status', { agent, status: 'idle' })
  await sleep(GRACE + 30)
  assert.deepEqual(calls.map((call) => call.kind), ['failure', 'success'])
})

test('approval asks play the waiting sound immediately', () => {
  const { emit, calls } = mount()
  emit('session/event', fakeSession(), { type: 'approval/asked', data: { id: 'a1', toolName: 'bash' } })
  assert.deepEqual(calls.map((call) => call.kind), ['waiting'])
})

test('an ask_user_question tool call plays the waiting sound', () => {
  const { emit, calls } = mount()
  const session = fakeSession()
  emit('session/event', session, { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c1', name: 'ask_user_question', arguments: '{}' } })
  assert.deepEqual(calls.map((call) => call.kind), ['waiting'])
  emit('session/event', session, { type: 'tool/call', data: { turn: 1, step: 1, callId: 'c2', name: 'read', arguments: '{}' } })
  assert.deepEqual(calls.map((call) => call.kind), ['waiting'], 'other tools stay silent')
})

test('user-question waterfall plays waiting and always delegates', async () => {
  const { emitAsync, calls } = mount()
  let delegated = 0
  const next = async () => {
    delegated += 1
    return { answers: [] }
  }
  const results = await emitAsync('user-questions/request', { agent: fakeAgent() }, next)
  assert.deepEqual(calls.map((call) => call.kind), ['waiting'])
  assert.equal(delegated, 1)
  assert.deepEqual(results, [{ answers: [] }])
})

test('subagent sessions and asks stay silent', async () => {
  const { emit, emitAsync, calls } = mount()
  const session = fakeSession('child', 'subagent')
  const agent = fakeAgent(session)
  emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  emit('session/event', session, { type: 'llm/retry', data: { turn: 1 } })
  emit('session/event', session, { type: 'approval/asked', data: { id: 'a', toolName: 'x' } })
  emit('agent/status', { agent, status: 'idle' })
  await sleep(GRACE + 30)
  await emitAsync('user-questions/request', { agent }, async () => ({ answers: [] }))
  assert.deepEqual(calls, [])
})

test('muted categories stay silent while the others still play', async () => {
  const { emit, calls, setSettings } = mount({ settings: { success: false } })
  const session = fakeSession()
  const agent = fakeAgent(session)
  emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  emit('agent/status', { agent, status: 'idle' })
  await sleep(GRACE + 30)
  assert.deepEqual(calls, [])
  setSettings({ success: true })
  emit('session/event', session, { type: 'approval/asked', data: { id: 'a', toolName: 'x' } })
  assert.deepEqual(calls.map((call) => call.kind), ['waiting'])
})

test('queued input and resumed runs cancel the idle notification', async () => {
  const queued = mount()
  const queuedSession = fakeSession('queued')
  const queuedAgent = fakeAgent(queuedSession)
  queuedAgent.inbox.nextTurn.push({})
  queued.emit('session/event', queuedSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  queued.emit('agent/status', { agent: queuedAgent, status: 'idle' })
  await sleep(GRACE + 30)
  assert.deepEqual(queued.calls, [])

  const resumed = mount()
  const resumedSession = fakeSession('resumed')
  const resumedAgent = fakeAgent(resumedSession)
  resumed.emit('session/event', resumedSession, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  resumed.emit('agent/status', { agent: resumedAgent, status: 'idle' })
  resumed.emit('agent/status', { agent: resumedAgent, status: 'running' })
  await sleep(GRACE + 30)
  assert.deepEqual(resumed.calls, [])
})

test('dispose clears pending idle timers', async () => {
  const fake = mount()
  const session = fakeSession()
  const agent = fakeAgent(session)
  fake.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  fake.emit('agent/status', { agent, status: 'idle' })
  fake.dispose()
  await sleep(GRACE + 30)
  assert.deepEqual(fake.calls, [])
})

test('readConfigField accepts live volatile refs, plain values and fallbacks', () => {
  assert.equal(readConfigField(liveRef(false)), false)
  assert.equal(readConfigField(liveRef(true)), true)
  assert.equal(readConfigField(true), true)
  assert.equal(readConfigField(false), false)
  assert.equal(readConfigField(undefined), true)
  assert.equal(readConfigField({}, false), false)
})

test('0.2.x config mode registers no namespace and reads volatile fields live', async () => {
  const flags = { success: true, failure: false, waiting: true }
  const { emit, calls, registrations } = mountConfig({
    success: { get: () => flags.success },
    failure: { get: () => flags.failure },
    waiting: { get: () => flags.waiting },
  })
  assert.equal(registrations.length, 0, 'no legacy namespace is registered in config mode')

  const session = fakeSession()
  const agent = fakeAgent(session)
  emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  emit('agent/status', { agent, status: 'idle' })
  await sleep(GRACE + 30)
  assert.deepEqual(calls, ['success'])

  // The live ref is read at notification time, so changing it mutes immediately.
  flags.success = false
  emit('session/event', session, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } })
  emit('agent/status', { agent, status: 'idle' })
  await sleep(GRACE + 30)
  assert.deepEqual(calls, ['success'], 'muted success must not ring')

  // The other categories keep their own live value.
  emit('session/event', session, { type: 'approval/asked', data: { id: 'a', toolName: 'bash' } })
  assert.deepEqual(calls, ['success', 'waiting'])
  emit('session/event', session, { type: 'llm/retry', data: { turn: 3 } })
  assert.deepEqual(calls, ['success', 'waiting'], 'failure is off')
})
