/**
 * dsh-sound-notify client half (Web settings UI).
 *
 * Hand-written lazily-materialized CJS bundle in the shape the DSH Web module
 * loader expects (`window.__ModuleLoader__.load({ id, factory })`). It renders
 * the three category switches in whichever settings surface the running DSH
 * version provides:
 *
 * - DSH 0.2.x: one card on Settings → Plugins (`plugins.item`), editing the
 *   plugin entry's volatile Config through `ctx.configForms`.
 * - DSH 0.1.x: one Settings section (`settings.section`) editing the
 *   `sound-notify` settings namespace through `ctx.settingsScope`.
 *
 * Both paths read live state and write immediately, so a toggle applies to the
 * next notification without a restart. No build step: React and the UI
 * primitives are baseline modules of the shell's frozen module table.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sound-notify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const react = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = react.createElement
    const Switch = primitives.Switch

    /** Locale namespace for this package's copy. */
    const NS = 'sound-notify'
    /** Host entry id / settings namespace shared by both DSH settings surfaces. */
    const SETTINGS_NS = 'sound-notify'

    const zh = {
      nav: '声音提醒',
      summary: '任务完成、失败或需要你处理时播放提示音。',
      intro:
        '由 DSH 宿主进程在本机播放提示音：任务完成、请求失败、等待授权或回答时各有一类音效。修改实时生效，无需重启。',
      successTitle: '任务完成',
      successHint: '任务正常结束（turn end: completed）时播放 success.aac。',
      failureTitle: '任务失败',
      failureHint: '模型或 API 报错、任务出错（turn end: error）时播放 fail.aac。',
      waitingTitle: '等待你处理',
      waitingHint: '等待授权、确认或回答提问，以及任务被中断（abort）时播放 stop.aac。',
      footnote:
        '子代理（subagent）会话不会发声，避免委派多个子任务时连续响铃。声音仅在运行 DSH 的这台机器上播放。',
      loading: '正在读取设置…',
      unavailable: '当前部署未提供声音提醒设置。',
      readOnly: '当前设置文档为只读，无法修改。',
      saveFailed: '保存失败，请重试。',
    }

    const en = {
      nav: 'Sound notifications',
      summary: 'Play a sound when a task finishes, fails, or needs your attention.',
      intro:
        'The DSH host plays a sound on this machine for completed tasks, failed requests, and approval or question prompts. Changes apply immediately — no restart needed.',
      successTitle: 'Task completed',
      successHint: 'Plays success.aac when a task finishes normally (turn end: completed).',
      failureTitle: 'Task failed',
      failureHint: 'Plays fail.aac when a model/API request fails or a task errors (turn end: error).',
      waitingTitle: 'Waiting for you',
      waitingHint:
        'Plays stop.aac for approval prompts, confirmations and questions, and when a task is aborted.',
      footnote:
        'Subagent sessions stay silent so delegated child tasks do not ring repeatedly. Sounds play on the machine that runs DSH.',
      loading: 'Reading settings…',
      unavailable: 'This deployment does not expose the sound notification settings.',
      readOnly: 'The settings document is read-only; changes cannot be saved.',
      saveFailed: 'Save failed — please try again.',
    }

    const DEFAULTS = { success: true, failure: true, waiting: true }

    const CSS = `
.dshsn-section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:14px}
.dshsn-intro{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dshsn-list{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1)}
.dshsn-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 16px}
.dshsn-row + .dshsn-row{border-top:1px solid var(--dsw-alias-border-l2)}
.dshsn-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.dshsn-label{font-size:14px;line-height:22px;font-weight:500}
.dshsn-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshsn-note{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dshsn-status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dshsn-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dshsn-switch{flex:none}
`

    function injectStyles() {
      if (typeof document === 'undefined') return
      const tagId = 'dsh-sound-notify/section.css'
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-sound-notify'
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    /** The three configurable rows, in display order. */
    function rows(t) {
      return [
        { field: 'success', title: t('successTitle'), hint: t('successHint') },
        { field: 'failure', title: t('failureTitle'), hint: t('failureHint') },
        { field: 'waiting', title: t('waitingTitle'), hint: t('waitingHint') },
      ]
    }

    /**
     * Presentational panel shared by both settings surfaces. A plain function
     * (no hooks) so both surfaces can build the same tree in place.
     *
     * @param {object} props - copy reader, sync state, current values, and the
     *   write callback.
     * @returns {object} the panel element tree.
     */
    function panel(props) {
      const { t, status, writable, value, onChange, pendingField, failed } = props
      if (status === 'loading') return h('p', { className: 'dshsn-status' }, t('loading'))
      if (status !== 'ready') return h('p', { className: 'dshsn-status' }, t('unavailable'))
      const current = Object.assign({}, DEFAULTS, value || {})
      const locked = writable === false
      return h(
        'div',
        { className: 'dshsn-section' },
        h('p', { className: 'dshsn-intro' }, t('intro')),
        h(
          'div',
          { className: 'dshsn-list' },
          rows(t).map((row) =>
            h(
              'div',
              { className: 'dshsn-row', key: row.field },
              h(
                'div',
                { className: 'dshsn-copy' },
                h('div', { className: 'dshsn-label' }, row.title),
                h('div', { className: 'dshsn-hint' }, row.hint)
              ),
              h(Switch, {
                checked: current[row.field] !== false,
                onChange: (next) => onChange(row.field, next),
                label: row.title,
                disabled: locked || pendingField === row.field,
                className: 'dshsn-switch',
              })
            )
          )
        ),
        h('p', { className: 'dshsn-note' }, t('footnote')),
        locked ? h('p', { className: 'dshsn-note' }, t('readOnly')) : null,
        failed ? h('p', { className: 'dshsn-error' }, t('saveFailed')) : null
      )
    }

    /**
     * DSH 0.2.x Plugins-page card: summary one-liner plus the config form page.
     *
     * @param {object} props - composed slot props: `view`, `t`, and the
     *   injected `scope` form controller.
     * @returns {object|string} the summary text or the config page.
     */
    function SoundNotifyCard(props) {
      const { t, view, scope } = props
      if (view === 'summary') return t('summary')
      const [snapshot, setSnapshot] = react.useState(() => scope.getSnapshot())
      const [pendingField, setPendingField] = react.useState(null)
      const [failed, setFailed] = react.useState(false)
      react.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])
      const change = (field, next) => {
        setPendingField(field)
        setFailed(false)
        Promise.resolve(scope.set(field, next))
          .then((accepted) => {
            if (accepted === false) setFailed(true)
          })
          .catch(() => setFailed(true))
          .then(() => setPendingField(null))
      }
      return panel({
        t,
        status: snapshot.status,
        writable: snapshot.writable,
        value: snapshot.value,
        onChange: change,
        pendingField,
        failed,
      })
    }

    /**
     * DSH 0.1.x settings section bound to the registered namespace.
     *
     * @param {object} props - composed slot props: `t` and the injected `scope`.
     * @returns {object} the section element tree.
     */
    function SoundNotifySection(props) {
      const { t, scope } = props
      const [snapshot, setSnapshot] = react.useState(() => scope.getSnapshot())
      const [pendingField, setPendingField] = react.useState(null)
      const [failed, setFailed] = react.useState(false)
      react.useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])
      const change = (field, next) => {
        setPendingField(field)
        setFailed(false)
        Promise.resolve(scope.set(field, next))
          .then((accepted) => {
            if (accepted === false) setFailed(true)
          })
          .catch(() => setFailed(true))
          .then(() => setPendingField(null))
      }
      return panel({
        t,
        status: snapshot.status,
        writable: snapshot.writable,
        value: snapshot.value,
        onChange: change,
        pendingField,
        failed,
      })
    }

    /** Required services: the slot registry and locale are shared by every surface. */
    const inject = ['slots', 'locale']

    /**
     * Mount the settings surface the running DSH version provides.
     *
     * @param {object} ctx - client plugin context.
     * @returns {void}
     */
    function apply(ctx) {
      injectStyles()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'sound-notify: settings dictionaries')
      const t = ctx.locale.bind(NS)

      // DSH 0.2.x: plugin entry Config forms rendered by the Plugins page.
      ctx.inject(['configForms'], (scoped) => {
        const form = scoped.configForms.get(SETTINGS_NS)
        scoped.effect(() => () => form.dispose?.(), 'sound-notify: config form disposal')
        scoped.effect(
          () =>
            scoped.configForms.whileServed([SETTINGS_NS], () =>
              scoped.slots.inject('plugins.item', () =>
                scoped.slots.register(
                  {
                    name: 'plugins.item',
                    id: SETTINGS_NS,
                    order: 60,
                    label: () => t('nav'),
                    locale: NS,
                    inject: () => ({ scope: form }),
                  },
                  SoundNotifyCard
                )
              )
            ),
          'sound-notify: plugins page card'
        )
      })

      // DSH 0.1.x: a dedicated Settings section over the registered namespace.
      ctx.inject(['settingsScope'], (scoped) => {
        const scope = scoped.settingsScope.bind({ namespace: SETTINGS_NS })
        scoped.slots.inject('settings.section', () =>
          scoped.slots.register(
            {
              name: 'settings.section',
              id: SETTINGS_NS,
              order: 45,
              label: () => t('nav'),
              locale: NS,
              inject: () => ({ scope }),
            },
            SoundNotifySection
          )
        )
      })
    }

    exports.name = 'sound-notify'
    exports.inject = inject
    exports.apply = apply
    exports.SETTINGS_NS = SETTINGS_NS
    exports.SoundNotifyCard = SoundNotifyCard
    exports.SoundNotifySection = SoundNotifySection
    return module.exports
  },
})
