# Compact Handoff

The routing policy lives in `SKILL.md`. The supervisor may consider where to change, why it works and how to verify as optional reasoning prompts, not a checklist, score or prerequisite to delegation. No routine routing report is required.

## Handoff

Keep only what this worker needs, including precise paths and symbols for on-demand reads. Omit whole conversations, full logs, secrets and unrelated files.

```text
Role: Astra coding worker; implementation only.
Workspace/state: <absolute path, revision/branch, existing changes>
Outcome: <one bounded deliverable>
Escalation reason: <one sentence naming the unresolved technical difficulty>
Edit scope: <allowed files/modules; protected user changes>
Read pointers: <applicable AGENTS.md, relevant symbols, required contracts>
Acceptance: <observable expected behavior; the supervisor will verify>
Failure evidence, if relevant: <reproduction, expected/actual, short error, evidence path>
Test code, if needed: <what to author, without executing>
Stop: implement, then return paths, brief changes, assumptions/blockers and NOT_TESTED.
No self-review, tests, lint, builds, browser, screenshots, delegation or commits.
If blocked on required input, return the blocker instead of inventing behavior.
```

## Host and lifecycle

The supervisor is whichever model is running the current session, with its existing effort setting. Continue without requiring its model name or asking the user to select a model. For the worker, use `gpt-6-astra` / `low`, subject to the host schema and explicit user selections. Do not change provider/global settings or guess aliases. If the supervisor is already Astra, delegation does not imply a stronger model; assess whether a fresh worker offers enough benefit to justify its overhead.

`collaboration.spawn_agent` uses explicit model, effort and `fork_turns="none"`. This excludes parent conversation history, while host/system/project instructions still apply. Never use `all`, a positive history count, `fork_thread`, or a follow-up task to reuse the worker. If the required capability is absent, report the blocked escalation and continue only independent authorized work.

Do not create sidebar tasks automatically. Only if the user explicitly requests an independent task, use `create_thread` with the compact prompt, Astra model and the schema's project/environment selection. Wait for completion and locate the actual changes. Shared workspaces need one writer per file scope. An ended worker may remain idle if no close tool exists; do not delete files or archive user tasks for cleanup.

## Verification and repair

The supervisor owns implementation and verification, including tests/scripts, auto-fixes, browser errors and screenshots. The same autonomous routing policy applies to validation code and repairs, regardless of the previous author. The Astra worker may author test code but never executes it.

The supervisor reviews the actual diff for correctness, readability, contracts and scope, then completes applicable tests and browser/app/device acceptance. Preserve the file/revision state of the evidence. Report missing tests, login/device blockers and failures separately from passed checks. Honor user tool choices, higher-priority host rules and delivery authorization. A worker result is implementation evidence, not acceptance. Worker-only restrictions do not apply to an Astra model serving as supervisor.

Fresh contexts and selective escalation aim to reduce avoidable overhead. Actual cost, quota savings and runtime adherence remain measurement questions.
