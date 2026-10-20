# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-21

Initial public release.

### Added

- Host-side sound notifications for DSH:
  - `success.aac` when a turn completes;
  - `fail.aac` when a turn fails or a model/API request is retried after an error;
  - `stop.aac` for approval prompts, `ask_user_question`, and aborted/blocked turns.
- Three independent switches (completed / failed / waiting), all enabled by default.
  - DSH 0.2.x: Settings → Plugins card over the plugin's volatile `Config`.
  - DSH 0.1.x: dedicated settings section over the registered `sound-notify` namespace.
- Noise control: subagent sessions stay silent, a 500 ms idle grace period cancels
  alerts for queued input and automatic continuations, one failure sound per turn,
  and a 700 ms per-category cooldown.
- Playback through the DSH host process (`afplay` on macOS, `paplay` on Linux).
- `DSH_SOUND_NOTIFY_LOG` diagnostic log for hosts without a terminal.
- Installation helpers for the Electron-owned desktop profile and CLI-managed profiles.
- Test suite (31 `node:test` cases), packaging self-check, CI and release workflows.

[0.1.0]: https://github.com/hifengzy/dsh-sound-notify/releases/tag/v0.1.0
