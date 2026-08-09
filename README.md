# dsh-tps

DSH Web 实时 TPS 徽标：在 "Deep diving…" 状态行内显示实时 tokens-per-second，跟随运行行自然显隐。

English: [README.en.md](README.en.md)

![演示](assets/dshtpsdemo.gif)

## 特性

- **实时瞬时 TPS**：滚动 5 秒窗口采样流式输出（UTF-8 字节 / 5 估算），流暂停 1.5 秒自动显示 `--`，新步骤自动重置窗口；徽标在首个数值到达时才出现（一次性淡入），新一轮不会显示光秃秃的 `TPS --`，中途暂停的 `--` 保留
- **跟随显隐，零适配**：徽标渲染在 "Deep diving… 7分25秒" 行内，turn 结束、提问/审批面板接管时随行一起消失——无需为待办条、队列条或提问面板编写任何隐藏逻辑
- **不重复原生功能**：窗口级平均值（AVG/TTFT/token 总数）是内置 StatsLine 的职责，本插件刻意只做瞬时速率
- **悬停淡出**：停留 2 秒淡出并变为可穿透（`pointer-events: none`）；隐藏期间光标在徽标上或其附近（外扩 8px）则保持隐藏，移开后经 3 秒宽限期才恢复（期间回到附近则取消恢复），光标停驻不会循环触发
- **纯前端**：所有读数派生自会话快照，无 store、无事件监听、无网络调用

## 安装教程

### 第 0 步：前置条件

1. **harness checkout 包含 `conversation.chat.turnStatus` 槽位**。检查方式：

   ```sh
   grep -n "conversation.chat.turnStatus" <harness>/packages/client/ui-conversation/src/client/apply.ts
   ```

   **grep 有输出**：槽位已存在（例如已应用过本补丁、或 checkout 来自作者修改过的版本），可直接进入安装。

   **grep 无输出是默认状态**：该槽位是作者对 ui-conversation 的**手动补丁改动**（4 个文件：slots.ts / apply.ts / ChatView.tsx / ChatView.module.css），**从未合入任何共享/原始快照**——所有内测人员的原始快照都不含它。请应用本仓库附带的补丁（`git checkout` 可还原）：

   ```sh
   cd <harness>
   git apply <dsh-tps>/patches/turnstatus-slot.patch
   ```

   说明：槽位改动只存在于作者修改过的 checkout 中（个人快照仓库 `dsh2026/test-Small-tailqwq` 的推送也不会自动进入其他成员的快照，每日快照是独立更新流程）。因此目前**所有内测人员的原始快照都需按本步骤打补丁**（或使用下方 AI 安装技能自动完成）；待槽位合入共享的快照更新流程后，方可免去此步骤。

2. **私有仓库访问**：本仓库为 dsh-external 内测私有仓库，需要已登录的 `gh`（或 PAT）：

   ```sh
   gh auth status
   git clone https://github.com/dsh-external/dsh-tps.git
   ```

### 方式一：AI 自动安装（零手动改码，推荐）

本仓库附 `SKILL.md`（dsh-tps-install）。clone 后告诉你的 AI「按 dsh-tps 仓库的 `SKILL.md` 安装 dsh-tps」，AI 会自动完成：检测槽位 → 缺失时应用补丁 → 验证 → 重建 ui-conversation bundle → 挂载插件 → 验收。也可把 `SKILL.md` 放进本地 skills 目录供 AI 直接发现。

### 方式二：`dsh plugin` 命令安装（推荐手动方式）

```sh
cd <harness>
dsh plugin --profile web add <dsh-tps 本地路径>
# 或通过 GitHub 依赖
dsh plugin --profile web add github:dsh-external/dsh-tps
```

本包声明了 `dsh.bundle`（patch 指向仓库内 `cordis.yml`），`dsh plugin` 会**自动**把它追加进 profile 的 `dsh.profile.bundles`（见下文「dsh 端点」），无需手写任何 insert。从 git 安装时若 pnpm 拦截构建，按提示把包加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重试。

### 方式三：手动安装（无 `dsh plugin` 命令时）

**步骤 1：添加依赖**。编辑 `~/.dsh/profiles/web/package.json` 的 `dependencies`：

```json
"dependencies": {
  "@dsh-external/dsh-tps": "github:dsh-external/dsh-tps"
}
```

（本地路径可用 `"@dsh-external/dsh-tps": "file:../dsh-tps"`，然后 `cd ~/.dsh/profiles/web && pnpm install`。）

**步骤 2：添加 dsh 端点**（见下节）。**步骤 3：验证** `dsh --profile web --dump-config | grep -A1 tps`。

> 备选挂载：也可直接在 profile 的 `cordis.patch.yml` 追加 insert 行，或用 `dsh web --patch ./cordis.yml` 作为启动 overlay（本仓库已附 `cordis.yml`）——这两种方式同样要求依赖图包含本包。

### dsh 端点（`dsh.profile.bundles`）创建教程

**什么是 dsh 端点**：profile 的 `dsh.profile.bundles` 数组是 profile 的**组合端点列表**——启动时按数组顺序叠加每个 bundle 的 patch 层（`dsh.bundle.patch` 指向的 `cordis.patch.yml`/`cordis.yml`），插件的插件行只有在该数组里才会进入组合配置。可以理解为"profile 挂载了哪些 bundle 层"的清单。

**创建步骤**（继续方式三）：编辑 `~/.dsh/profiles/web/package.json`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@dsh-external/dsh-tps"
      ]
    }
  }
}
```

然后 `cd ~/.dsh/profiles/web && pnpm install`，并验证：

```sh
dsh --profile web --dump-config | grep -A1 tps
# → - id: tps
#     name: '@dsh-external/dsh-tps'
```

**为何需要手动添加端点**：

- `dsh plugin --profile web add` 会在安装后**自动 reconcile**：检测到包声明了 `dsh.bundle`，就把包名追加进 `dsh.profile.bundles`。
- 但**直接编辑 `package.json` 或 `pnpm add` 安装依赖时，`dsh.profile.bundles` 数组不会自动更新**——patch 层只从该数组加载。
- **不添加端点的后果**：包被安装了，但它的 patch 层不进入组合 → 组合配置里没有 `tps` 行 → **插件静默不加载**（无报错）。手动添加端点 = 把 `dsh plugin add` 的 reconcile 那一步自己做掉。

### 布局与依赖（开发本仓库时）

与 harness checkout 平级（sibling）是约定布局——`tsconfig.json` extends `../deepseek-harness/tsconfig.base.json`，类型解析（`tsc -b`、vitest 经 `vite-tsconfig-paths`）都经由它的 `paths` 直接指向 harness 源码，无需复制任何构建产物：

```
deepseek-harness/   ← harness 源码 checkout（含 turnStatus 槽位）
dsh-tps/            ← 本仓库
```

类型检查、构建与测试都需要该 sibling checkout；**消费者安装不需要**——`prepare` 脚本用 `tsdown --config tsdown.prepare.config.ts` 做无类型检查的 src→lib 转译（`tsconfig.prepare.json` 自包含），没有 sibling 的机器也能安装构建（pnpm ≥ 10 需 `pnpm-workspace.yaml` 的 `allowBuilds` 键）。

### 构建与生效

```sh
cd dsh-tps
pnpm run typecheck    # tsc -b（需 sibling harness）
pnpm test             # vitest（27 例：形态门禁 + 指标 + 组件/生命周期）
pnpm run build        # tsc -b + tsdown：产出 lib/index.js 与 lib/client.js
pnpm run prepare      # 消费者构建：仅 tsdown，无类型检查（src → lib）
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
- 悬停 2 秒 → 淡出 → 鼠标穿透；光标在徽标上或其附近（外扩 8px）期间保持隐藏，移开后 3 秒恢复（期间回到附近则取消）；重新移回并停留会再次淡出
- 时长均为编译期常量（`src/client/TpsOverlay.tsx`），暂无客户端配置通道

## 与官方包的关系

本仓库是独立分发版；上游源码镜像自 DeepSeek Harness monorepo 的 `packages/client/ui-tps`（官方包名 `@deepseek-ai/dsh-client-ui-tps`），包装差异仅为独立仓库构建与 `@dsh-external/tps` 命名。

## Known Limitations and Deferred Work

- **实时 token 为估算值**：流式 partial 不携带实时 token 计数，速率按 UTF-8 字节估算（bytes/5）；精确计数由持久化 token-usage 投影与内置 StatsLine 提供
- **悬停时长固定**：停留/淡出时长与隐藏判定范围是编译期常量，暂无客户端插件配置通道可调
- **依赖内测槽位**：需要含 `conversation.chat.turnStatus` 槽位的 harness（见第 0 步）

## 许可

BSD-3-Clause
