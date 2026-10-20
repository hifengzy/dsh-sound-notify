/**
 * Shared fakes for the host-half tests: a minimal Cordis-shaped context and
 * injectable player, so no test ever spawns a real audio process.
 *
 * @module dsh-sound-notify/test/helpers
 */

/**
 * Build a context that records event handlers and settings registrations.
 *
 * @param {Record<string, unknown>} [initial] - initial settings section value.
 * @returns {object} fake context plus inspection/emit helpers.
 */
export function createFakeContext(initial = {}, options = {}) {
  let current = { success: true, failure: true, waiting: true, ...initial }
  const handlers = new Map()
  const disposers = []
  const registrations = []

  const ctx = {
    logger: () => ({ debug() {} }),
    on(event, callback) {
      const list = handlers.get(event) ?? []
      list.push(callback)
      handlers.set(event, list)
      return () => {}
    },
    effect(factory) {
      const dispose = factory()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    settings: options.legacySettings === false ? {} : {
      register(namespace, schema, settingsOptions) {
        registrations.push({ namespace, schema, options: settingsOptions })
        return {
          get: () => ({ ...current }),
          watch: () => () => {},
          update: async () => {},
          replace: async () => {},
        }
      },
    },
  }

  return {
    ctx,
    registrations,
    /** Invoke every registered listener for one event. */
    emit(event, ...args) {
      for (const callback of handlers.get(event) ?? []) callback(...args)
    },
    /** Synchronously await every waterfall/async listener result for one event. */
    async emitAsync(event, ...args) {
      const results = []
      for (const callback of handlers.get(event) ?? []) results.push(await callback(...args))
      return results
    },
    /** Replace the resolved settings section seen by the plugin. */
    setSettings(patch) {
      current = { ...current, ...patch }
    },
    /** Run the registered fiber disposers. */
    dispose() {
      for (const dispose of disposers) dispose()
    },
  }
}

/** A live-session stand-in. */
export function fakeSession(id = 'session-1', origin) {
  return { id, header: origin === undefined ? {} : { origin } }
}

/** A live-agent stand-in with an empty inbox. */
export function fakeAgent(session = fakeSession()) {
  return {
    status: 'idle',
    session,
    inbox: { nextTurn: [], nextStep: [] },
  }
}

/** Resolve after `ms` milliseconds. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
