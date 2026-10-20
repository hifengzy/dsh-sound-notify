# dsh-sound-notify

[English](README.md) | **简体中文**

[![CI](https://github.com/hifengzy/dsh-sound-notify/actions/workflows/ci.yml/badge.svg)](https://github.com/hifengzy/dsh-sound-notify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-4d6bfe)](https://github.com/topics/dsh-plugin)

**DeepSeek Harness（DSH）** 声音提醒插件：任务完成、失败、或停下来等你处理时，在运行 DSH 的机器上播放提示音，并给每一类场景一个开关。

![设置界面：插件 → 声音提醒](docs/settings.png)

## 为什么需要它

DSH 会话经常一跑就是几分钟到几十分钟。没有声音提醒，你就得反复切回窗口看它是不是已经停了。这个插件让「它停了」变得听得见：

| 事件 | 触发条件 | 音效 |
| --- | --- | --- |
| 任务完成 | turn 以 `completed` 结束 | `sounds/success.aac` |
| 任务失败 | turn 以 `error` / `max-tokens` 结束，或 API 请求报错并调度了重试（`llm/retry`） | `sounds/fail.aac` |
| 等待你处理 | 授权请求（`approval/asked`）、`ask_user_question` 提问、turn 被 abort / blocked / interrupted | `sounds/stop.aac` |

播放发生在 **DSH 宿主进程**，调用系统播放器（macOS `afplay`、Linux `paplay`），所以浏览器标签页在后台、最小化甚至关闭时都能响。声音响在运行 DSH 的这台机器上。

## 特性

- **三个独立开关**，默认全开，写入 DSH 设置并实时生效，无需重启。
- **该安静的时候安静**：
  - 子代理（subagent）会话不发声，一个父任务委派多个子任务不会连续响铃；
  - `idle` 后延迟 500ms 再判定，若有排队输入或自动续轮立刻开始，则取消这次提醒；
  - 同一 turn 的自动重试只响一次失败；
  - 同类音效之间 700ms 冷却。
- **适配当前 DSH**：0.2.x 在 **插件** 页显示设置卡片；0.1.x 自动回退到独立设置区。
- **无需构建**：纯 ESM 宿主代码 + 手写 `window.__ModuleLoader__` 客户端 bundle。

## 安装

### 桌面版（Electron 管理的 `desktop` profile）

`dsh` CLI 明确拒绝管理保留的 `desktop` profile，因此使用仓库内脚本（幂等，自动备份 patch 文件）：

```bash
git clone https://github.com/hifengzy/dsh-sound-notify.git
cd dsh-sound-notify
./scripts/install-desktop.sh
```

然后**重启 DSH 桌面应用**。桌面宿主不会热挂载新增的 profile 插件，首次启用需要重启。

重启后：侧边栏 **插件 → 声音提醒**，可见三个开关；随便完成一个任务即可听到 `success.aac`。

<details>
<summary>手工安装步骤（脚本做的就是这些）</summary>

```bash
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/desktop"
DEST="$PROFILE/node_modules/dsh-sound-notify"

cp "$PROFILE/cordis.patch.yml" "$PROFILE/cordis.patch.yml.bak.$(date +%s)"
mkdir -p "$DEST" && rm -rf "${DEST:?}"/*
cp -R lib sounds package.json cordis.patch.yml README.md README.zh.md LICENSE "$DEST"/

grep -q "id: sound-notify" "$PROFILE/cordis.patch.yml" || cat >> "$PROFILE/cordis.patch.yml" <<'YAML'

- insert:
    - id: sound-notify
      name: 'dsh-sound-notify'
YAML
```

</details>

### CLI 可管理的 profile（`web`、`headless`、自建 profile）

三种来源任选其一，装的是同一个插件：

```bash
# 直接从 GitHub 安装（当前可用）
dsh plugin --profile web add github:hifengzy/dsh-sound-notify

# 安装最新 GitHub Release 上的预构建 tarball（当前可用）
dsh plugin --profile web add https://github.com/hifengzy/dsh-sound-notify/releases/latest/download/dsh-sound-notify.tgz

# npm（包发布后可用；见 docs/PUBLISHING.md）
dsh plugin --profile web add dsh-sound-notify
```

安装后重启对应应用。`dsh plugin add` 会把包装进 profile 的 `node_modules`，并把 `dsh-sound-notify` 追加到 `dsh.profile.bundles`；包内自带的 `cordis.patch.yml` 负责挂载插件行。

自建 profile 把 `web` 换成对应名字即可。可用下面的命令确认插件已组合进 profile：

```bash
dsh --profile web --dump-config | grep -A2 sound-notify
```

## 设置

**DSH 0.2.x**：侧边栏 **插件 → 声音提醒**。值保存在 profile patch（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）里插件行的 `config` 中，每次通知时实时读取。

**DSH 0.1.x**：**设置 → 声音提醒**（注册的 `sound-notify` 设置命名空间，写入 `$DSH_HOME/settings.yaml`）。

| 开关 | 默认 | 关闭后 |
| --- | --- | --- |
| 任务完成 | 开 | `success: false`，完成任务不响 |
| 任务失败 | 开 | `failure: false`，失败/API 报错不响 |
| 等待你处理 | 开 | `waiting: false`，授权/提问/中断不响 |

## 调试

桌面宿主没有终端。**在启动 DSH 前**设置 `DSH_SOUND_NOTIFY_LOG`，即可得到每次判定与播放的日志：

```bash
DSH_SOUND_NOTIFY_LOG=/tmp/dsh-sound-notify.log dsh web
```

```text
2026-10-19T17:21:05.071Z [sound-notify] notifyIdle reason=completed kind=success
2026-10-19T17:21:05.071Z [sound-notify] enabled success = false (config)
2026-10-19T17:21:05.071Z [sound-notify] muted success
```

播放失败（文件缺失、没有可用播放器）也会写日志，不会静默失败。

## 平台支持

| 平台 | 播放器 | 状态 |
| --- | --- | --- |
| macOS | `afplay` | 已验证 |
| Linux | `paplay`（PulseAudio/PipeWire） | 需要安装 `paplay` |
| Windows | — | 没有可用的 AAC CLI 播放器；记录诊断日志后跳过 |

## 兼容性

| DSH | 设置界面 | 安装方式 |
| --- | --- | --- |
| 0.2.x（当前版本，含桌面版 0.2.1-rc.2） | 插件页卡片，基于插件的 volatile `Config` | `dsh plugin add` / GitHub / tarball / 桌面脚本 |
| 0.1.x | 独立设置区，基于注册的设置命名空间 | `dsh plugin add` / GitHub |

宿主半只观察事件总线（`session/event`、`agent/status`、`user-questions/request`），不修改会话日志，也不影响授权结果（提问 waterfall 监听器始终调用 `next()` 透传）。

## 开发

```bash
npm install
npm test        # 31 个 node:test 用例
npm run verify  # 打包自检（清单、文件、AAC 文件头、客户端 bundle）
npm pack        # 生成发布用 tarball
```

CI（`.github/workflows/ci.yml`）在 Node 20/22/24 上跑测试与打包自检，并对最新发布的 `@deepseek-ai/dsh` 做真实安装冒烟测试：创建 web profile、用 `dsh plugin add` 安装打包出的 tarball，并断言插件已组合进 profile 树。

推送 `v*` tag 会触发 `.github/workflows/release.yml`：把 tarball 附加到 GitHub Release，并在配置了 `NPM_TOKEN` secret 时发布到 npm。npm token 配置与目录投稿步骤见 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## 社区收录

插件已按 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 目录格式准备（`category: notify`），该目录也是 DSH 插件市场（`dshmarket`）的数据源；条目文件已放在 [`community/`](community/)，投稿脚本为 `scripts/submit-to-catalog.sh`（目录要求仓库创建满 1 天）。收录合并后，在 DSH 里搜索「sound」/「通知」即可找到。仓库 topic：`dsh-plugin`、`deepseek-harness`、`dsh`。

## 许可证

MIT © 2026 fengzhuoyu — 见 [LICENSE](LICENSE)。仓库内置的音效素材随仓库以同一许可证分发。
