# Collect one operator result

Use after the operator has a ready `threadId`.

In `functions.exec`, load the reviewed helper locally and call it with the current tool handles. Keep the source inside the execution cell; do not print it or the intermediate snapshots into model context:

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

The helper returns a terminal report, tool/contract block or required attention. Completion requires a DONE/BLOCKED/NEED_USER report.

If the execution cell yields, resume its `cell_id` with `functions.wait`, at most 60 seconds per wait. Keep one collector per operator and do independent work while it runs.

If the host cannot run this helper, use one bounded `wait_threads` call at a time with its cursor. On new user input, stop the old collector and handle the input before resuming dependent work.

Record the returned wait/read/send counts with the final result. Add calls outside this collector when measuring the whole task.
