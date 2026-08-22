---
name: dsh-tps-install
description: 安装 dsh-tps TPS 徽标插件：检测 conversation.chat.turnStatus 槽位（rc6 构建产物），缺失则应用 patches/turnstatus-slot-rc6.patch，再挂载插件并验收。适配 DSH ≥ 0.1.0-rc.6。
---

# 安装 dsh-tps（AI 执行指南）

目标：让当前 DSH（≥ 0.1.0-rc.6）具备 Deep diving 状态行内的实时 TPS 徽标。插件本体通过 bundle 安装；**已安装的 `dsh-client-ui-conversation` 需要含 `conversation.chat.turnStatus` 槽位**——rc6 正式发布版不含该槽位，若缺失按本技能给其构建产物打补丁（`lib/client.js` + `lib/types/client/contract/slots.d.ts`，可还原）。

## 步骤

### 1. 定位已安装的 dsh-client-ui-conversation 包

- npm 全局安装 DSH 时：`<npm root -g>/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation`。
- 也可用 `npm ls -g @deepseek-ai/dsh-client-ui-conversation` 或直接搜索 `dsh-client-ui-conversation` 包的 `lib/client.js`。

以下 `<UI-CONV>` 均指该包的目录。

### 2. 检测槽位

```sh
grep -c "conversation.chat.turnStatus" <UI-CONV>/lib/client.js
```

输出 ≥ 1 → 已打过补丁，跳过第 3 步。无输出 → 执行第 3 步。

### 3. 应用槽位补丁（rc6 构建产物）

在 dsh 包目录（`<UI-CONV>` 的 `node_modules/@deepseek-ai/dsh-client-ui-conversation` 前缀，即 `<npm root -g>/node_modules/@deepseek-ai/dsh`）执行：

```sh
git apply <dsh-tps>/patches/turnstatus-slot-rc6.patch
```

没有 git 时用 `patch -p1`，或按补丁内容手工编辑两个文件。补丁改动：

1. `lib/types/client/contract/slots.d.ts`：`SlotMap` 增加 `'conversation.chat.turnStatus': { kind: 'single'; scope: 'session' }`（置于 `conversation.chat.turnTail` 之后）；`ChatViewSlotProps` 的 `PropsRenderSlots` 联合增加 `'conversation.chat.turnStatus'`。
2. `lib/client.js`：
   - `conversation.view`（id: `chat`）注册的 `children` 增加 `"conversation.chat.turnStatus": { kind: "single", scope: "session" }`；
   - `TurnStatus` 组件增加可选 `trailing` prop，渲染结构包一层 `turnStatusWrap`（原 `.turnStatus` div 与 `{trailing}` 为兄弟，避免 `background-clip: text` 影响淡出）；
   - ChatView 渲染 `TurnStatus` 处传 `trailing: renderSlot("conversation.chat.turnStatus", {})`；
   - CSS 字符串新增 `.Md3f7G_turnStatusWrap` 规则（`align-self:flex-start;flex:none;display:inline-flex;align-items:center;height:26px`，从原 `.turnStatus` 移出的定位属性），类名映射增加 `"turnStatusWrap"`。

应用后验证第 2 步的 grep（应 ≥ 1）。

### 4. 挂载插件（bundle 方式）

```sh
dsh plugin --profile web add github:Small-tailqwq/dsh-tps
```

从 git 安装时若 pnpm 拦截构建，按提示把包加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重试。`dsh plugin` 会自动把包追加进 `dsh.profile.bundles`；验证：

```sh
dsh --profile web --dump-config | grep -A1 tps
```

### 5. 重启并验收

提醒用户：**重启 `dsh web`**（生产模式无 HMR；client bundle 的 rev 在启动时计算）。任务执行（turn 运行）时，"Deep diving…" 行内应出现 `TPS 12.3`（首个数值到达时淡入）；鼠标悬停 2 秒淡出，光标停留在徽标附近期间保持隐藏，移开后 3 秒恢复。

## 边界

- 槽位缺失时插件**静默不工作**（`slots.inject` 等待声明，无报错）——应用补丁后必须按第 2 步验证 grep。
- 重新安装/升级 DSH（rc6）会覆盖补丁，需重新应用。
- 本补丁只改 rc6 构建产物，不影响 DSH 源码；适配范围仅 `0.1.0-rc.6`（不做向下兼容）。
