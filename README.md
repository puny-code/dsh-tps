# dsh-tps

在 DSH Web 的“深度求索中…”状态行旁显示实时 TPS（每秒生成 token 数）。

English: [README.en.md](README.en.md)

![演示](assets/dshtpsdemo.gif)

## 安装

适用于 **DSH `0.1.2-rc.1`**。在终端执行：

```sh
dsh plugin --profile web add 'github:Small-tailqwq/dsh-tps'
```

安装完成后，重启正在运行的 DSH：

```sh
dsh web
```

重新打开页面并发起一轮任务，开始流式输出后即可看到：

```text
深度求索中… 24秒  TPS 132
```

从 GitHub 安装时会自动构建插件。如果 pnpm 提示构建脚本被阻止，按提示配置 Web profile 的 `allowBuilds` 后重试。

### 安装本地包

如果拿到的是预构建 `.tgz` 文件，将路径替换为实际文件位置：

```sh
dsh plugin --profile web add './dsh-tps-0.3.0-rc1-dom.tgz'
```

预构建包已包含运行时代码，不需要下载 Harness 源码或自行编译。

## 功能

- **实时速率**：使用滚动 5 秒窗口统计流式输出，内置 DeepSeek-V3 分词器。
- **自然显隐**：首个数值产生后显示，任务结束时随状态行消失；输出暂停约 1.5 秒后显示 `--`。
- **悬停淡出**：鼠标停留 2 秒后淡出并允许点击穿透，移开后等待 3 秒恢复。
- **语言无关的挂载**：通过语义 DOM 定位状态行，不匹配中文、英文文案或 CSS 哈希类名。
- **纯前端**：读取 DSH 会话快照，无额外网络请求。平均速率、首 token 时延和总用量仍由原生统计栏提供。

## 已安装但不显示

1. 确认任务正在产生流式输出；空闲或尚未收到输出时不会显示徽标。
2. 确认 TPS 已启用。如果使用 `dshmarket`，也需要在插件市场中启用 TPS：市场会恢复自己保存的禁用状态，仅修改 profile 配置不能覆盖它。
3. 安装或替换包后重启 DSH，再重新打开页面。
4. 确认宿主版本及当前皮肤保留聊天状态行。其他版本或改变页面结构的皮肤可能需要适配。

## 计数说明

TPS 按内置 DeepSeek-V3 分词器统计，不等同于服务端计费用量，也不代表其他模型分词器的精确计数。分词器初始化期间使用 UTF-8 字节数近似，就绪后切换为 BPE 计数。

极长且没有分词边界的连续文本可能增加主线程计算开销。悬停和恢复时间目前为固定值，没有配置界面。

## 开发

普通安装不依赖 Harness 源码。开发时的类型检查和测试通过相邻 checkout 解析宿主接口：

```text
<parent>/
  deepseek-harness/  # dsh-v0.1.2-rc.1
  dsh-tps/
```

在本仓库执行：

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

`pnpm run prepare` 是 Git 安装使用的自包含构建，不读取相邻 checkout；它应与完整构建生成一致的运行时代码。`pnpm run dev` 可监听源码变化。

插件通过 `conversation.composer.dock` 获取会话上下文，再以 React Portal 挂到当前 `[data-conversation-scroll]` 内 `[data-chat-flow]` 的直接子元素 `[role="status"][aria-live="polite"]`。只管理插件自己的容器，不移动宿主节点。

### 重新生成分词数据

准备官方 DeepSeek-V3 `tokenizer.json` 后执行：

```sh
node scripts/build-tokenizer-data.mjs <path/to/tokenizer.json>
python scripts/gen-golden.py <path/to/tokenizer.json> tests/fixtures/deepseek-golden.json
```

## 许可

BSD-3-Clause。本插件从早期 Harness monorepo 的 `packages/client/ui-tps` 独立分发。
