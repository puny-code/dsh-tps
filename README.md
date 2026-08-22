# dsh-tps

DSH Web 实时 TPS 徽标：在 "Deep diving…" 状态行内显示实时 tokens-per-second，跟随运行行自然显隐。

English: [README.en.md](README.en.md)

![演示](assets/dshtpsdemo.gif)

## 特性

- **内置 DeepSeek 分词器的实时 TPS**：滚动 5 秒窗口采样流式输出，token 数按 DeepSeek-V3 BPE 分词器**精确**计数——完整预分词（Split ×3 + 字节映射）与 merge 贪心合并，与官方 `tokenizers` 库对 tokenizer.json 的输出逐 token 一致（golden 夹具 500+ 用例锁定）；流式增量只重编码"最后一个切分片段 + 新增量"，日常输出下每次更新亚毫秒级。词表 + merge 表随插件自包含（约 690KB），首次运行时异步解码（约 0.2s），期间暂以 UTF-8 字节/5 近似显示，就绪后自动切换精确值；流暂停 1.5 秒自动显示 `--`，新步骤自动重置窗口；徽标在首个数值到达时才出现（一次性淡入），新一轮不会显示光秃秃的 `TPS --`，中途暂停的 `--` 保留
- **跟随显隐，零适配**：徽标渲染在 "Deep diving… 7分25秒" 行内，turn 结束、提问/审批面板接管时随行一起消失——无需为待办条、队列条或提问面板编写任何隐藏逻辑
- **不重复原生功能**：窗口级平均值（AVG/TTFT/token 总数）是内置 StatsLine 的职责，本插件刻意只做瞬时速率
- **悬停淡出**：停留 2 秒淡出并变为可穿透（`pointer-events: none`）；隐藏期间光标在徽标上或其附近（外扩 8px）则保持隐藏，移开后经 3 秒宽限期才恢复（期间回到附近则取消恢复），光标停驻不会循环触发
- **纯前端**：所有读数派生自会话快照，无 store、无事件监听、无网络调用

## 兼容性

适配 **DSH ≥ 0.1.0-rc.6**（peer 范围 `^0.1.0-rc.6`），**不做向下兼容**（不支持 0.0.1-rc.x 时代 API）。

槽位说明：徽标挂载在 `conversation.chat.turnStatus` 槽位上，该槽位是 ui-conversation 的扩展点，**rc6 及更早的正式发布版不含此槽位**（源码 checkout 同样没有），需要按下方「第 0 步」给已安装的 `dsh-client-ui-conversation` 打一个补丁。补丁只改构建产物（`lib/client.js` + `lib/types/client/contract/slots.d.ts`），不碰 DSH 源码。

## 安装教程

### 第 0 步：给 DSH 补上 `conversation.chat.turnStatus` 槽位（一次性）

1. **检查槽位是否已存在**：

   ```sh
   grep -c "conversation.chat.turnStatus" <dsh>/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js
   ```

   `<dsh>` 是 DSH 的安装目录（npm 全局安装时为 `npm root -g` 下的 `node_modules/@deepseek-ai/dsh`；也可直接找到 `dsh-client-ui-conversation` 包所在位置）。输出 `1` 或更大 → 已打过补丁，跳到第 1 步。

2. **应用补丁**（按 DSH 版本二选一；`git apply` 在 npm 全局安装目录不可用时用 `patch -p1`）：

   ```sh
   cd <dsh>
   # DSH 0.1.1-rc.2（构建产物为 LF；含 lib/types 契约声明的适配版）
   git apply <dsh-tps>/patches/turnstatus-slot-0111rc2.patch
   # DSH 0.1.0-rc.6 系 rc6 发布版
   git apply <dsh-tps>/patches/turnstatus-slot-rc6.patch
   ```

   没有 git 时可用 `patch -p1`（Git for Windows 自带）或按补丁内容手工编辑两个文件（改动点见补丁内注释）。

   > 升级 DSH（重新安装）会覆盖补丁，升级后需重新应用；若补丁与你的版本行尾差异导致失败，先确认 `lib/client.js` 的换行符（LF/CRLF）与补丁一致，或用 `patch -p1 -l` 重试。

### 第 1 步：安装插件

```sh
cd <dsh>
dsh plugin --profile web add github:Small-tailqwq/dsh-tps
```

本包声明了 `dsh.bundle`（patch 指向仓库内 `cordis.yml`），`dsh plugin` 会**自动**把它追加进 profile 的 `dsh.profile.bundles`，无需手写任何 insert。从 git 安装时若 pnpm 拦截构建，按提示把包加入 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重试。

**手动安装**（无 `dsh plugin` 命令时）：编辑 `~/.dsh/profiles/web/package.json`：

```json
"dependencies": {
  "dsh-tps": "github:Small-tailqwq/dsh-tps"
}
```

（本地路径可用 `"dsh-tps": "file:../dsh-tps"`，然后 `cd ~/.dsh/profiles/web && pnpm install`。）再在 `dsh.profile.bundles` 数组追加 `"dsh-tps"`——`dsh plugin add` 会自动 reconcile，手动编辑则必须自己加（不加班次 → 插件静默不加载）。

### 第 2 步：验证与生效

```sh
dsh --profile web --dump-config | grep -A1 tps
# → - id: tps
#     name: 'dsh-tps'
```

然后**重启 `dsh web`**（生产模式无 HMR；client bundle 的 rev 在启动时计算，仅刷新浏览器可能命中旧缓存）。

## 构建与测试（开发本仓库）

项目已自包含，**不依赖 DSH 源码 checkout**：

```sh
pnpm install
pnpm run typecheck    # tsc -p tsconfig.json（strict）
pnpm test             # vitest（形态门禁 + 指标 + 组件/生命周期）
pnpm run build        # tsc 产出 lib/types 声明 + tsdown 产出 lib/index.js 与 lib/client.js
pnpm run prepare      # 消费者构建：仅 tsdown，无类型检查（git 安装时自动执行）
```

- `pnpm run dev`：tsdown watch。
- **生产模式**：构建后重启 `dsh web`。

## 验证

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

本插件原为 DeepSeek Harness 早期 monorepo 内的 `packages/client/ui-tps`（官方包名 `@deepseek-ai/dsh-client-ui-tps`），随官方「生态化」调整移出 monorepo 后独立分发。`conversation.chat.turnStatus` 槽位补丁（源码版与 rc6 构建产物版）均随本仓库维护；新版 DSH 若已内置该槽位，第 0 步可跳过。

## Known Limitations and Deferred Work

- **计数精确、但不等同服务端 usage**：rate 按插件内置的 DeepSeek-V3 分词器计数（与官方 `tokenizers` 库对 tokenizer.json 的 `encode` 一致）；服务端计费的 usage 由持久化 token-usage 投影与内置 StatsLine 提供，个别边缘场景（聊天模板、特殊 token、API 侧模型微调）可能有细微出入
- **极端长单段会占用主线程**：连续无分隔的文本（例如数万字纯中文/压缩代码，预分词无法切分）在每次流式增量时会整体重编码该段——普通输出（分词后段均很短，如英文单词/数字组/标点）每次更新 <1ms，长单段的极端场景下末尾每次更新可能达到几十毫秒
- **首次初始化异步**：merge 表在首次运行时解码（约 200–500ms），此期间徽章显示字节/5 近似值，就绪后自动切换
- **悬停时长固定**：停留/淡出时长与隐藏判定范围是编译期常量，暂无客户端插件配置通道可调
- **依赖槽位补丁**：rc6 需要第 0 步的构建产物补丁（见上）

## 数据与黄金用例再生成

`src/client/data/tokenizer-data.ts`（merge 表，自动生成并提交）与 `tests/fixtures/deepseek-golden.json`（官方 tokenizers 输出）可用以下命令重建（需要 DeepSeek 官方 `tokenizer.json`，例如 `deepseek-ai/DeepSeek-V3` 仓库的 `tokenizer.json`）：

```sh
node scripts/build-tokenizer-data.mjs <path/to/tokenizer.json>
python scripts/gen-golden.py <path/to/tokenizer.json> tests/fixtures/deepseek-golden.json
```

## 许可

BSD-3-Clause
