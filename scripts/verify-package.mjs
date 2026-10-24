#!/usr/bin/env node
/**
 * Packaging self-check for dsh-sound-notify.
 *
 * Runs before `npm pack` and in CI: verifies the files a published tarball must
 * contain, the `dsh` manifest fields the DSH loader scans, and that the host
 * entry exports the plugin face the Cordis loader expects.
 *
 * Usage: node scripts/verify-package.mjs
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

/** Record one failed assertion. */
function fail(message) {
  problems.push(message)
}

/** Assert a condition, recording a failure instead of throwing. */
function expect(condition, message) {
  if (!condition) fail(message)
}

/** Read one required file as text. */
function readRequired(relativePath) {
  const absolute = join(ROOT, relativePath)
  if (!existsSync(absolute)) {
    fail(`missing file: ${relativePath}`)
    return ''
  }
  return readFileSync(absolute, 'utf8')
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

expect(pkg.name === 'dsh-sound-notify', 'package name must be dsh-sound-notify')
expect(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version), 'package version must be semver')
expect(pkg.license === 'MIT', 'license must be MIT')
expect(pkg.private !== true, 'published package must not be private')
expect(pkg.type === 'module', 'package must be an ES module')
expect(pkg.exports?.['.']?.default === './lib/index.js', 'exports["."] must point at lib/index.js')
expect(pkg.exports?.['./client'] === './lib/client.js', 'exports["./client"] must point at lib/client.js')
expect(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must declare cordis.patch.yml')
expect(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be web')
expect(
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'),
  'dsh.client.inject must include the settings UI provider',
)

const requiredFiles = [
  'lib/index.js',
  'lib/client.js',
  'lib/logic.js',
  'lib/player.js',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
  'LICENSE',
  'sounds/success.aac',
  'sounds/fail.aac',
  'sounds/stop.aac',
]
for (const file of requiredFiles) {
  const absolute = join(ROOT, file)
  expect(existsSync(absolute), `missing file: ${file}`)
  if (existsSync(absolute)) expect(statSync(absolute).size > 0, `empty file: ${file}`)
}

for (const file of ['sounds/success.aac', 'sounds/fail.aac', 'sounds/stop.aac']) {
  const absolute = join(ROOT, file)
  if (!existsSync(absolute)) continue
  const head = readFileSync(absolute).subarray(0, 2)
  // MPEG ADTS (AAC) sync word: 12 set bits.
  expect(head[0] === 0xff && (head[1] & 0xf0) === 0xf0, `${file} is not an ADTS AAC stream`)
}

const patch = readRequired('cordis.patch.yml')
expect(/id:\s*sound-notify/.test(patch), 'cordis.patch.yml must mount id sound-notify')
expect(/name:\s*['"]?dsh-sound-notify['"]?/.test(patch), 'cordis.patch.yml must mount package dsh-sound-notify')

const client = readRequired('lib/client.js')
expect(client.includes('window.__ModuleLoader__.load('), 'lib/client.js must register with window.__ModuleLoader__.load')
expect(client.includes("id: 'dsh-sound-notify'"), 'lib/client.js must register module id dsh-sound-notify')
expect(
  client.includes('plugins.bundle.config'),
  'lib/client.js must configure the installed package through plugins.bundle.config',
)
expect(
  !client.includes("'plugins.item'") && !client.includes('"plugins.item"'),
  'lib/client.js must not register plugins.item (that slot is the built-in configuration list)',
)

const host = await import(new URL('../lib/index.js', import.meta.url))
expect(host.name === 'sound-notify', 'host entry must export name sound-notify')
expect(Array.isArray(host.inject) && host.inject.includes('settings'), 'host entry must inject the settings service')
expect(typeof host.apply === 'function', 'host entry must export apply()')
expect(typeof host.Config === 'function', 'host entry must export the Config schema')
const configShape = host.Config({})
expect(
  host.readConfigField(configShape.success) === true &&
    host.readConfigField(configShape.failure) === true &&
    host.readConfigField(configShape.waiting) === true,
  'Config defaults must be all-on',
)

if (problems.length > 0) {
  console.error(`package verification failed (${problems.length}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`package verification passed (${pkg.name}@${pkg.version})`)
