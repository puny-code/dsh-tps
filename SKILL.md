---
name: dsh-tps-install
description: 安装 dsh-tps TPS 徽标插件：检测 conversation.chat.turnStatus 槽位，缺失则把 4 个 ui-conversation 文件改动应用到当前 harness（可验证、可还原），再挂载插件。用于内测人员在自己的 DSH 上安装 dsh-tps。
---

# 安装 dsh-tps（AI 执行指南）

目标：让当前 DSH 具备 Deep diving 状态行内的实时 TPS 徽标。插件本体通过 bundle 安装；**harness 需要含 `conversation.chat.turnStatus` 槽位**——若缺失，按本技能完成 4 个文件的改动（约 130 行，全部为新增/包裹式修改，可还原）。

## 步骤

### 1. 定位 harness checkout

当前会话的 DSH 源码 checkout（`~/.dsh/source/current` 或 `$DSH_HOME/source/current`；若是 junction 则先解析到真实目录）。以下 `<HARNESS>` 均指它。

### 2. 检测槽位

```sh
grep -n "conversation.chat.turnStatus" <HARNESS>/packages/client/ui-conversation/src/client/apply.ts
```

有输出 → 跳过第 3 步。无输出 → 执行第 3 步。

### 3. 应用槽位改动（4 个文件）

**方式 A（推荐，补丁文件）**：在 dsh-tps 仓库根执行

```sh
git apply patches/turnstatus-slot.patch
```

**方式 B（手动修改）**：当 harness 不是 git 工作树或补丁无法应用时，按第 5 节逐文件修改。

应用后验证：

```sh
grep -n "conversation.chat.turnStatus" <HARNESS>/packages/client/ui-conversation/src/client/apply.ts
```

### 4. 重建 ui-conversation 客户端 bundle 并提示重启

```sh
cd <HARNESS>
pnpm --filter @deepseek-ai/dsh-client-ui-conversation run bundle
```

提醒用户：**重启 `dsh web`**（生产模式无 HMR；rev 在启动时计算）。

### 5. 挂载插件（bundle 方式）

```sh
cd <HARNESS>
dsh plugin --profile web add <dsh-tps 仓库路径或 github:dsh-external/dsh-tps>
```

从 git 安装时若 pnpm 拦截构建，按提示把包加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重试。

### 6. 验收

任务执行（turn 运行）时，"Deep diving…" 行内应出现 `TPS 12.3`（首个数值到达时淡入）；鼠标悬停 2 秒淡出，光标停留在徽标附近期间保持隐藏，移开后 3 秒恢复。

## 改动清单（方式 B 用）

补丁涉及 `<HARNESS>/packages/client/ui-conversation/src/client/` 下 4 个文件，全部为纯新增/包裹式修改：

1. **contract/slots.ts**：`SlotMap` 增加 `'conversation.chat.turnStatus': { kind: 'single'; scope: 'session' }` 声明（带 JSDoc，置于 `conversation.chat.turnTail` 之后）；`ChatViewSlotProps` 的 `PropsRenderSlots` 联合增加 `'conversation.chat.turnStatus'`。
2. **apply.ts**：chat view 注册（`name: 'conversation.view'`）的 `children` 增加 `'conversation.chat.turnStatus': { kind: 'single', scope: 'session' }`。
3. **chat/ChatView.tsx**：`TurnStatus` 组件增加可选 `trailing?: ReactNode` prop；渲染结构包一层 `<div className={css.turnStatusWrap}>`，内部是原 `.turnStatus` div（Deep diving... + 时钟），`{trailing}` 作为兄弟渲染在 wrap 内、shimmer 行外（避免 background-clip: text 影响淡出）；ChatView 渲染 `TurnStatus` 处传 `trailing={renderSlot('conversation.chat.turnStatus', {})}`。
4. **chat/ChatView.module.css**：新增 `.turnStatusWrap`（`align-self: flex-start; flex: none; display: inline-flex; align-items: center; height: 26px;`——从原 `.turnStatus` 移出的定位属性）；`.turnStatus` 保留 `display: inline-flex; align-items: center;` 及其余文字/渐变样式。

补丁可还原：git 工作树用 `git checkout -- <4 个文件>`；手动修改的按改动清单反向操作。

## 边界

- 槽位缺失时插件**静默不工作**（`slots.inject` 等待声明，无报错）——应用补丁后必须按第 3 步验证 grep。
- 槽位改动仅存在于作者个人快照仓库（`dsh2026/test-Small-tailqwq`），每日快照更新是独立流程，个人推送不会自动到达其他成员；目前一律按本技能打补丁，直到槽位合入共享快照更新流程。
