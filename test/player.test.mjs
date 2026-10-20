import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { debugLog, playCommand, playSound } from '../lib/player.js'

test('playCommand uses the platform native player', () => {
  assert.deepEqual(playCommand('darwin', '/sounds/success.aac'), {
    command: 'afplay',
    args: ['/sounds/success.aac'],
  })
  assert.deepEqual(playCommand('linux', '/sounds/fail.aac'), {
    command: 'paplay',
    args: ['/sounds/fail.aac'],
  })
  assert.equal(playCommand('win32', 'C:\\sounds\\fail.aac'), null)
})

test('playSound spawns the player for an existing packaged file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sound-'))
  writeFileSync(join(dir, 'success.aac'), 'fake-aac')
  const spawned = []
  try {
    const ok = playSound('success', {
      soundDir: dir,
      spawn: (command, args, options) => {
        spawned.push({ command, args, options })
        return { on() {}, unref() {} }
      },
    })
    assert.equal(ok, true)
    assert.equal(spawned.length, 1)
    assert.equal(spawned[0].command, 'afplay')
    assert.equal(spawned[0].args[0], join(dir, 'success.aac'))
    assert.deepEqual(spawned[0].options, { stdio: 'ignore' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing files and unsupported platforms stay silent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sound-'))
  const lines = []
  try {
    const spawn = () => {
      throw new Error('must not spawn')
    }
    assert.equal(playSound('success', { soundDir: dir, spawn, log: (line) => lines.push(line) }), false)
    writeFileSync(join(dir, 'fail.aac'), 'fake-aac')
    assert.equal(playSound('failure', { soundDir: dir, platform: 'win32', spawn, log: (line) => lines.push(line) }), false)
    assert.equal(playSound('nope', { soundDir: dir, spawn }), false)
    assert.ok(lines.some((line) => line.includes('missing')))
    assert.ok(lines.some((line) => line.includes('no supported audio player')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('debugLog appends only when a path is configured', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-sound-'))
  const target = join(dir, 'notify.log')
  try {
    debugLog('skipped', {})
    assert.equal(readFileSync(target, 'utf8'), '', 'file must not be created')
  } catch (error) {
    assert.equal(error.code, 'ENOENT')
  }
  try {
    debugLog('played success', { DSH_SOUND_NOTIFY_LOG: target })
    assert.match(readFileSync(target, 'utf8'), /played success/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
