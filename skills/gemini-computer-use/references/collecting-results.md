# 收集一个操作任务的结果

操作任务取得可用的 `threadId` 后使用本流程。

在 `functions.exec` 中读取本地辅助脚本，传入当前工具句柄。脚本源码和中间快照保留在执行单元内，只将收集结果返回模型：

```javascript
const source = await tools.exec_command({
  cmd: "cat ${HOME}/.agents/skills/gemini-computer-use/scripts/collect-result.js",
  max_output_tokens: 5000
});
if (source.exit_code !== 0 || source.original_token_count > 5000) throw Error("Collector source unavailable or truncated");
const collect = new Function("return " + source.output)();
const result = await collect({
  threadId: "<actual threadId>",
  hostId: "<actual hostId>",
  waitThreads: tools.mcp__codex_app__wait_threads,
  readThread: tools.mcp__codex_app__read_thread
});
text(result);
```

辅助脚本返回终态报告、工具或契约阻塞，以及需要处理的事项。收集结束须取得 `DONE`、`BLOCKED` 或 `NEED_USER` 报告；只有主文档的全部完成标准满足，才算业务完成。

执行单元让出控制权时，使用其 `cell_id` 调用 `functions.wait` 继续，每次至多等待 60 秒。每个操作任务保持一个收集器，等待期间可推进独立工作。

宿主无法运行辅助脚本时，每次调用一次有界的 `wait_threads` 并复用返回游标。收到新用户输入时，停止旧收集器，处理输入后再继续依赖它的工作。

最终结果记录返回的 wait/read/send 调用次数；统计整个任务时，补计收集器以外的调用。
