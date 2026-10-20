/**
 * dsh-sound-notify host half.
 *
 * Listens to the harness' own observable facts — session log events, agent
 * lifecycle status, and the approval/user-question request waterfalls — and
 * plays one of three bundled sounds on the machine that runs DSH:
 *
 * - `success` (success.aac): a turn completed normally.
 * - `failure` (fail.aac): a model/API request failed (retry or terminal turn error).
 * - `waiting` (stop.aac): the agent stopped for you — approval prompt, user
 *   question, turn aborted/blocked/interrupted.
 *
 * Those three categories are the plugin's `Config` fields. DSH 0.2.x renders
 * them from the plugin's volatile Config into Settings → Plugins (the client
 * half registers that card); DSH 0.1.x used a registered settings namespace
 * instead, which is still supported as a fallback. Everything defaults on.
 * Subagent sessions are ignored so delegated child turns do not ring.
 *
 * @module dsh-sound-notify
 */

import { fileURLToPath } from 'node:url'

import Schema from '@deepseek-ai/schemastery'

import { isEnabled, isSubagentSession, soundForTurnEnd } from './logic.js'
import { debugLog, playSound } from './player.js'

/** Cordis plugin identity. */
export const name = 'sound-notify'

/** The settings service is where the 0.1.x fallback namespace registers. */
export const inject = ['settings']

/** Settings namespace owned by the 0.1.x fallback (matches the client half). */
export const SETTINGS_NS = 'sound-notify'

/**
 * How long to wait after an agent reports `idle` before sounding.
 *
 * A turn boundary can be followed by immediately starting queued input (busy
 * Enter queues a message) or by an automatic continuation round. The short
 * grace period lets that next activity cancel the alert, so the sound means
 * "really stopped and waiting for a human", not "one step of an ongoing run
 * finished".
 */
const IDLE_GRACE_MS = 500

/** Minimum gap between two sounds of the same category. */
const COOLDOWN_MS = 700

/**
 * Mark a Config field editable from the DSH 0.2.x settings UI.
 *
 * Volatile fields are config values the loader can change in place, which is
 * exactly what the settings page edits. Older schemastery builds (DSH 0.1.x)
 * have no `volatile()`, where the plain field is used with the legacy
 * namespace registration instead.
 *
 * @param {object} schema - schemastery field builder.
 * @returns {object} the same field, volatile when the runtime supports it.
 */
function volatileField(schema) {
  return typeof schema.volatile === 'function' ? schema.volatile() : schema
}

/**
 * Plugin config / 0.2.x settings form schema.
 *
 * Every category is on unless the user turns it off; `volatile()` keeps the
 * values live-editable without remounting the plugin.
 */
export const Config = Schema.object({
  success: volatileField(Schema.boolean().default(true).description('任务正常完成时播放 success.aac')),
  failure: volatileField(Schema.boolean().default(true).description('请求失败 / 任务出错时播放 fail.aac')),
  waiting: volatileField(Schema.boolean().default(true).description('等待授权、确认或回答问题时播放 stop.aac')),
})

/** Plain 0.1.x namespace schema (no volatile fields in that runtime). */
const LegacySettingsSchema = Schema.object({
  success: Schema.boolean().default(true),
  failure: Schema.boolean().default(true),
  waiting: Schema.boolean().default(true),
})

/** Directory holding the packaged sound files. */
const SOUND_DIR = fileURLToPath(new URL('../sounds/', import.meta.url))

/**
 * Read one config field, which DSH 0.2.x hands over as a live volatile
 * reference (`{ get() }`) and DSH 0.1.x as a plain value.
 *
 * @param {unknown} field - the value from `apply(ctx, config)`.
 * @param {boolean} [fallback] - value used when the field is absent/malformed.
 * @returns {boolean} the effective flag.
 */
export function readConfigField(field, fallback = true) {
  const current = field !== null && typeof field === 'object' && typeof field.get === 'function' ? field.get() : field
  return typeof current === 'boolean' ? current : fallback
}

/**
 * Register the host plugin.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - host plugin context.
 * @param {object} [config] - validated plugin config (0.2.x uses volatile refs).
 * @param {object} [deps] - test-only injection points (player and timings).
 * @returns {void}
 */
export function apply(ctx, config = {}, deps = {}) {
  const logger = ctx.logger?.('sound-notify')
  // Diagnostics: the desktop host has no terminal, so the same lines also land
  // in the file named by DSH_SOUND_NOTIFY_LOG when that variable is set.
  const log = (line) => {
    debugLog(`[sound-notify] ${line}`)
    logger?.debug?.(line)
  }
  const playSoundImpl = deps.playSound ?? playSound
  const idleGraceMs = deps.idleGraceMs ?? IDLE_GRACE_MS
  const cooldownMs = deps.cooldownMs ?? COOLDOWN_MS

  /**
   * 0.1.x fallback: a registered settings namespace the client page writes to.
   * 0.2.x has no `register` on the settings service — its config form edits
   * this plugin's Config instead.
   */
  let legacyScope
  try {
    if (typeof ctx.settings?.register === 'function') {
      legacyScope = ctx.settings.register(SETTINGS_NS, LegacySettingsSchema, { applies: 'live' })
    }
  } catch (error) {
    log(`legacy settings registration failed: ${String(error)}`)
  }

  /** Current value of one category flag. */
  const enabled = (kind) => {
    const value = legacyScope !== undefined ? isEnabled(legacyScope.get(), kind) : readConfigField(config?.[kind], true)
    log(`enabled ${kind} = ${String(value)} (${legacyScope !== undefined ? 'legacy settings' : 'config'})`)
    return value
  }

  /** Last logged `turn/end` `{ turn, reason }` per session, read when the agent goes idle. */
  const lastTurnEnd = new WeakMap()
  /** Turn numbers whose failure was already announced by `llm/retry`. */
  const announcedFailures = new WeakMap()
  /** Pending idle grace timer per agent. */
  const idleTimers = new WeakMap()
  /** Every live grace timer, so unload can clear them without walking agents. */
  const liveTimers = new Set()
  /** Monotonic timestamp of the last playback per category. */
  const lastPlayed = new Map()

  const play = (kind) => {
    if (!enabled(kind)) {
      log(`muted ${kind}`)
      return false
    }
    const now = Date.now()
    const previous = lastPlayed.get(kind) ?? 0
    if (now - previous < cooldownMs) {
      log(`cooldown ${kind}`)
      return false
    }
    lastPlayed.set(kind, now)
    return playSoundImpl(kind, { soundDir: SOUND_DIR, log })
  }

  const failureAnnouncedForTurn = (session, turn) => announcedFailures.get(session)?.has(turn) === true

  const markFailureAnnounced = (session, turn) => {
    let turns = announcedFailures.get(session)
    if (turns === undefined) {
      turns = new Set()
      announcedFailures.set(session, turns)
    }
    turns.add(turn)
  }

  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end' || event.type === 'llm/retry' || event.type === 'approval/asked' || event.type === 'tool/call') {
      log(`session/event ${event.type} session=${String(session?.id)}`)
    }
    if (isSubagentSession(session)) return
    switch (event.type) {
      case 'turn/end': {
        lastTurnEnd.set(session, { turn: event.data.turn, reason: event.data.reason })
        break
      }
      case 'llm/retry': {
        // A provider request returned an error (the retry layer logged it).
        // One sound per turn: further retries would only repeat the same signal.
        const turn = event.data?.turn
        if (failureAnnouncedForTurn(session, turn)) return
        markFailureAnnounced(session, turn)
        play('failure')
        break
      }
      case 'approval/asked': {
        // Logged at the moment permission is requested, before any answerer runs.
        play('waiting')
        break
      }
      case 'tool/call': {
        // The built-in ask_user_question tool is the one model-facing path that
        // pauses for a human answer. The tool call is logged before it executes,
        // which matters because the UI answerer claims the request waterfall
        // and later observers never see it.
        if (event.data?.name === 'ask_user_question') play('waiting')
        break
      }
      default:
        break
    }
  })

  const cancelIdleTimer = (agent) => {
    const timer = idleTimers.get(agent)
    if (timer === undefined) return
    clearTimeout(timer)
    idleTimers.delete(agent)
    liveTimers.delete(timer)
  }

  const notifyIdle = (agent) => {
    try {
      log(`notifyIdle status=${String(agent.status)}`)
      if (agent.status !== 'idle') return
      const pending = agent.inbox
      if ((pending?.nextTurn?.length ?? 0) > 0 || (pending?.nextStep?.length ?? 0) > 0) {
        log('idle but queued input remains; staying silent')
        return
      }
      const session = agent.session
      const last = lastTurnEnd.get(session)
      const kind = soundForTurnEnd(last?.reason)
      log(`notifyIdle reason=${String(last?.reason?.kind)} kind=${String(kind)}`)
      if (kind === null) return
      if (kind === 'failure' && failureAnnouncedForTurn(session, last?.turn)) return
      play(kind)
    } catch (error) {
      log(`idle notification failed: ${String(error)}`)
    }
  }

  ctx.on('agent/status', (payload) => {
    const agent = payload?.agent
    log(`agent/status ${String(payload?.status)} agent=${agent === undefined ? 'missing' : 'present'}`)
    if (agent === undefined || agent === null) return
    if (isSubagentSession(agent.session)) return
    if (payload.status === 'running') {
      cancelIdleTimer(agent)
      return
    }
    if (payload.status !== 'idle') return
    cancelIdleTimer(agent)
    const timer = setTimeout(() => {
      idleTimers.delete(agent)
      liveTimers.delete(timer)
      notifyIdle(agent)
    }, idleGraceMs)
    timer.unref?.()
    idleTimers.set(agent, timer)
    liveTimers.add(timer)
  })

  // Waiting for a human answer is a waterfall, not a logged event: stay in the
  // chain (always delegate) and only observe. The UI answerer usually claims
  // this before us, so `tool/call` above is the reliable signal; this covers
  // askers that reach the waterfall without that tool.
  ctx.on('user-questions/request', (request, next) => {
    try {
      const agent = request?.agent
      if (agent === undefined || !isSubagentSession(agent.session)) play('waiting')
    } catch (error) {
      log(`question notification failed: ${String(error)}`)
    }
    return next()
  })

  ctx.effect(() => () => {
    for (const timer of liveTimers) clearTimeout(timer)
    liveTimers.clear()
    lastPlayed.clear()
  }, 'sound-notify: clear pending idle timers')
}
