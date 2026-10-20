import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isEnabled,
  isSubagentSession,
  soundForTurnEnd,
  turnKey,
} from '../lib/logic.js'

test('turn-end mapping covers success, failure and waiting reasons', () => {
  assert.equal(soundForTurnEnd({ kind: 'completed' }), 'success')
  assert.equal(soundForTurnEnd({ kind: 'error', error: {} }), 'failure')
  assert.equal(soundForTurnEnd({ kind: 'max-tokens' }), 'failure')
  assert.equal(soundForTurnEnd({ kind: 'aborted', reason: { kind: 'user' } }), 'waiting')
  assert.equal(soundForTurnEnd({ kind: 'blocked' }), 'waiting')
  assert.equal(soundForTurnEnd({ kind: 'interrupted' }), 'waiting')
  assert.equal(soundForTurnEnd(undefined), null)
  assert.equal(soundForTurnEnd({ kind: 'future-reason' }), null)
})

test('subagent sessions are recognized by their durable origin marker', () => {
  assert.equal(isSubagentSession({ header: { origin: 'subagent' } }), true)
  assert.equal(isSubagentSession({ header: {} }), false)
  assert.equal(isSubagentSession({}), false)
  assert.equal(isSubagentSession(undefined), false)
})

test('only an explicit false mutes a category', () => {
  assert.equal(isEnabled(undefined, 'success'), true)
  assert.equal(isEnabled({}, 'success'), true)
  assert.equal(isEnabled({ success: true }, 'success'), true)
  assert.equal(isEnabled({ success: false }, 'success'), false)
  assert.equal(isEnabled({ success: false }, 'failure'), true)
})

test('turn keys are stable per session and turn', () => {
  const session = { id: 'abc' }
  assert.equal(turnKey(session, 3), 'abc#3')
  assert.equal(turnKey(undefined, 1), 'unknown#1')
})
