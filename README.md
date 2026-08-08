# dsh-tps

DSH Web 实时 TPS 徽标：在 "Deep diving…" 状态行内显示实时 tokens-per-second，跟随运行行自然显隐。

English: [README.en.md](README.en.md)

![演示](assets/dshtpsdemo.gif)

## 特性

- **实时瞬时 TPS**：滚动 5 秒窗口采样流式输出（UTF-8 字节 / 5 估算），流暂停 1.5 秒自动显示 `--`，新步骤自动重置窗口
- **跟随显隐，零适配**：徽标渲染在 "Deep diving… 7分25秒" 行内，turn 结束、提问/审批面板接管时随行一起消失——无需为待办条、队列条或提问面板编写任何隐藏逻辑
- **不重复原生功能**：窗口级平均值（AVG/TTFT/token 总数）是内置 StatsLine 的职责，本插件刻意只做瞬时速率
- **悬停淡出**：停留 2 秒淡出并变为可穿透（`pointer-events: none`）；隐藏期间光标在徽标上或其附近（外扩 8px）则保持隐藏，移开立即恢复，光标停驻不会循环触发
- **纯前端**：所有读数派生自会话快照，无 store、无事件监听、无网络调用

## 安装（AI 安装指南）

### 前置条件

1. **harness checkout 包含 `conversation.chat.turnStatus` 槽位**（内测版）。检查方式：

   ```sh
   grep -n "conversation.chat.turnStatus" <harness>/packages/client/ui-conversation/src/client/apply.ts
   ```

   有输出即满足；没有说明 harness 版本过旧，需要先合入含该槽位的 ui-conversation。

2. **私有仓库访问**：本仓库为 dsh-external 内测私有仓库，需要已登录的 `gh`（或 PAT）：

   ```sh
   gh auth status
   git clone https://github.com/dsh-external/dsh-tps.git
   ```

### 布局与依赖

插件通过 `link:` 开发依赖引用 harness checkout，默认约定两者平级：

```
deepseek-harness/   ← harness 源码 checkout（含 turnStatus 槽位）
dsh-tps/            ← 本仓库
```

若你的 checkout 布局不同，把 `package.json` 里所有 `link:../../deepseek-harness/...` 改为相对你布局的路径，然后：

```sh
cd dsh-tps
pnpm install
```

### 挂载到 Web profile

在 harness 的 Web profile（`~/.dsh/profiles/web/cordis.patch.yml`）追加：

```yaml
- insert:
    - id: tps
      name: '@dsh-external/tps'
```

或作为启动 overlay：`dsh web --patch ./cordis.yml`（本仓库已附 `cordis.yml`）。

同时确保 Web profile 的依赖图包含本包（bundle `package.json` 或 profile 的 `dsh.profile.bundles` 依赖声明），否则 Loader 无法解析行名。

### 构建与生效

```sh
pnpm run build          # tsc + tsdown：产出 lib/index.js 与 lib/client.js
```

- **开发模式**（`dsh web --dev` + `pnpm run dev:web` watcher）：构建后客户端插件自动热更新。
- **生产模式**：构建后**重启 `dsh web`**（client bundle 的 rev 在启动时计算，仅刷新浏览器可能命中旧缓存）。

### 验证

任务执行时（turn 运行中）应看到：

```
Deep diving… 7分25秒 | TPS 12.3
```

turn 结束或提问时整行消失。

## 使用说明

- 徽标字号 14px/500（`--dsw-font-s-strong-14`），与 13px 时钟并排时视觉高度接近（拉丁字符 ≈0.7em，中文方块字 ≈1em）
- 悬停 2 秒 → 淡出 → 鼠标穿透；光标在徽标上或其附近（外扩 8px）期间保持隐藏，移开即恢复；重新移回并停留会再次淡出
- 时长均为编译期常量（`src/client/TpsOverlay.tsx`），暂无客户端配置通道

## 与官方包的关系

本仓库是独立分发版；上游源码镜像自 DeepSeek Harness monorepo 的 `packages/client/ui-tps`（官方包名 `@deepseek-ai/dsh-client-ui-tps`），包装差异仅为独立仓库构建与 `@dsh-external/tps` 命名。

## Known Limitations and Deferred Work

- **实时 token 为估算值**：流式 partial 不携带实时 token 计数，速率按 UTF-8 字节估算（bytes/5）；精确计数由持久化 token-usage 投影与内置 StatsLine 提供
- **悬停时长固定**：停留/淡出时长与隐藏判定范围是编译期常量，暂无客户端插件配置通道可调
- **依赖内测槽位**：需要含 `conversation.chat.turnStatus` 槽位的 harness（见前置条件）

## 许可

BSD-3-Clause
