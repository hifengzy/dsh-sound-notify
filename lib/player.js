/**
 * Host-side audio playback for dsh-sound-notify.
 *
 * The plugin runs inside the DSH host process (the Electron main side or a
 * `dsh web` server), which is the same machine as the user in the normal
 * desktop setup. Playing through the OS player there keeps the alert reliable
 * even when the browser tab is backgrounded, minimized, or closed.
 *
 * @module dsh-sound-notify/player
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

import { SOUND_FILES } from './logic.js'

/**
 * Build the OS command that plays one audio file.
 *
 * macOS uses `afplay`; Linux tries `paplay` (PulseAudio/PipeWire) which decodes
 * AAC through the desktop sound server. Windows has no always-present CLI
 * player for AAC, so it is reported unsupported rather than silently failing.
 *
 * @param {NodeJS.Platform | string} platform - `process.platform` value.
 * @param {string} file - absolute sound file path.
 * @returns {{ command: string, args: string[] } | null} the command, or null.
 */
export function playCommand(platform, file) {
  if (platform === 'darwin') return { command: 'afplay', args: [file] }
  if (platform === 'linux') return { command: 'paplay', args: [file] }
  return null
}

/**
 * Append one diagnostic line when `DSH_SOUND_NOTIFY_LOG` names a file.
 *
 * This is intentionally file-based: the host process may run without a
 * terminal (desktop app), so "did the plugin fire?" cannot be observed from
 * stdout. Point the variable at a path to get an audit trail of every
 * notification attempt.
 *
 * @param {string} line - message to append.
 * @param {NodeJS.ProcessEnv} env - environment to read the log path from.
 * @returns {void}
 */
export function debugLog(line, env = process.env) {
  const target = env.DSH_SOUND_NOTIFY_LOG
  if (!target) return
  try {
    appendFileSync(target, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // Diagnostics must never make a notification fail.
  }
}

/**
 * Play one packaged sound, best-effort and non-blocking.
 *
 * @param {string} kind - sound category (`success` / `failure` / `waiting`).
 * @param {object} [options] - injection points for tests and deployment facts.
 * @param {string} options.soundDir - directory holding the `.aac` files.
 * @param {NodeJS.Platform | string} [options.platform] - platform override.
 * @param {typeof nodeSpawn} [options.spawn] - spawn override for tests.
 * @param {NodeJS.ProcessEnv} [options.env] - environment override for the log.
 * @param {(line: string) => void} [options.log] - extra diagnostics sink.
 * @returns {boolean} true when a player process was started.
 */
export function playSound(kind, options) {
  const { soundDir, platform = process.platform, spawn = nodeSpawn, env = process.env, log } = options ?? {}
  const fileName = SOUND_FILES[kind]
  if (fileName === undefined) {
    say(`unknown sound kind "${String(kind)}"`, log)
    return false
  }
  const file = join(soundDir, fileName)
  if (!existsSync(file)) {
    say(`sound file missing: ${file}`, log)
    return false
  }
  const command = playCommand(platform, file)
  if (command === null) {
    say(`no supported audio player for platform "${platform}"`, log)
    return false
  }
  try {
    const child = spawn(command.command, command.args, { stdio: 'ignore' })
    child.on?.('error', (error) => say(`${command.command} failed: ${String(error)}`, log))
    // Do not keep the host process alive on a 1-3 s clip; afplay exits on its own.
    child.unref?.()
    say(`play ${kind} -> ${command.command} ${file}`, log)
    return true
  } catch (error) {
    say(`${command.command} failed to start: ${String(error)}`, log)
    return false
  }
}

/** Emit one line to the optional sink and the debug log file. */
function say(line, log) {
  debugLog(line)
  log?.(line)
}
