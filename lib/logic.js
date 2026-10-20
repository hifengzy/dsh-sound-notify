/**
 * Pure notification policy for dsh-sound-notify.
 *
 * Nothing in this module touches Node, Cordis, or audio: it only maps observed
 * harness facts (turn-end reasons, session identity, settings) to the one sound
 * category that should play, so the mapping stays unit-testable.
 *
 * @module dsh-sound-notify/logic
 */

/** The three user-configurable sound categories, matching the settings fields. */
export const SOUND_KINDS = ['success', 'failure', 'waiting']

/** Settings field -> packaged sound file. */
export const SOUND_FILES = {
  success: 'success.aac',
  failure: 'fail.aac',
  waiting: 'stop.aac',
}

/**
 * Whether a session belongs to a delegated child agent.
 *
 * Subagent sessions are deliberately silent: one delegated task can finish
 * several child turns while the parent is still working, and sounding each of
 * them defeats the "your turn now" purpose of the plugin.
 *
 * @param {unknown} session - a live Session, or anything carrying `header`.
 * @returns {boolean} true when the session was created as a subagent child.
 */
export function isSubagentSession(session) {
  return session?.header?.origin === 'subagent'
}

/**
 * Map a `turn/end` reason to the sound category the user asked for.
 *
 * - completed            -> success
 * - error / max-tokens   -> failure (a turn that could not finish)
 * - aborted / blocked / interrupted -> waiting (stopped, not finished)
 *
 * Unknown future reasons stay silent rather than guessing.
 *
 * @param {{ kind?: string } | undefined} reason - the logged TurnEndReason.
 * @returns {'success' | 'failure' | 'waiting' | null} the sound to play.
 */
export function soundForTurnEnd(reason) {
  switch (reason?.kind) {
    case 'completed':
      return 'success'
    case 'error':
    case 'max-tokens':
      return 'failure'
    case 'aborted':
    case 'blocked':
    case 'interrupted':
      return 'waiting'
    default:
      return null
  }
}

/**
 * Whether a settings value still allows one sound category.
 *
 * An absent / malformed settings value means "not configured yet", which the
 * schema resolves to true, so only an explicit `false` mutes a category.
 *
 * @param {Record<string, unknown> | undefined} settings - resolved section.
 * @param {string} kind - one of {@link SOUND_KINDS}.
 * @returns {boolean} true when the category should play.
 */
export function isEnabled(settings, kind) {
  return settings?.[kind] !== false
}

/**
 * Stable key deduplicating one turn's error notifications.
 *
 * @param {unknown} session - live Session.
 * @param {number} turn - turn number from the event payload.
 * @returns {string} key safe to hold in a Set for the process lifetime.
 */
export function turnKey(session, turn) {
  return `${String(session?.id ?? 'unknown')}#${String(turn)}`
}
