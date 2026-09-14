---
name: gemini-computer-use
description: ChatGPT 桌面端专用。Delegate browser or native-app UI work to one Gemini High task and collect its result within three attempts. codex-with-chatgpt browser phases follow that Skill.
---

# Gemini Computer Use delegation

On other hosts, report this Skill unavailable and end the UI operation.

## 1. Assign one operator

The main task owns planning, user communication, non-UI work and final business review. One Gemini task owns the complete UI phase, including recovery, waits and verification. Reuse it for the same goal and surface; an existing Gemini operator executes directly.

When authorized and supported by the live schema, call `mcp__codex_app__create_thread` with `model: "gemini-3.8-flash-high"`, `thinking: "high"`, `target: {type: "projectless"}`, a concrete title and the complete brief below. Record the ready threadId, hostId, surface IDs and attempt N/3, and emit the host's created-thread directive.

## 2. Give the complete UI goal

Use six fields: **goal; starting location; required actions; forbidden actions; completion criteria; Gemini attempt N/3**. Include necessary paths, authorization and checkpoint IDs. The operator establishes missing UI state using live tool documentation.

Honor the user's selected browser. Otherwise, read `ego-browser` and use its documented `ego-browser nodejs` workflow for external browsing. Include that route in the brief and reuse its task-space ID. Follow the selected tool's ownership, handoff and cleanup rules; open/show requests leave the page visible. Resolve unavailable surfaces through documented troubleshooting and report remaining blocks before changing browsers.

## 3. Collect and review

After dispatch, do independent work or use the [result collector](references/collecting-results.md). Intervene for a concrete block, required user input, explicit correction or authorized retry; consolidate needed answers into one message.

Return **DONE**, **BLOCKED** or **NEED_USER**, with `状态`, `已完成`, `关键结果`, `副作用`, `验证`, `证据`. Include the actual model, final surface and target state/version, plus page/screenshot/object IDs or evidence paths. Aim for 1,000–2,000 characters while preserving necessary plans, business data and evidence; put long material in referenced files. DONE requires UI observations supporting every requested outcome. Retain a recovery checkpoint. The main task reviews the business result once from this evidence.

## 4. End within three Gemini attempts

Track one initial attempt plus at most two retries per operation goal, across follow-ups, replacement tasks and context recovery. Only terminal execution-chain failure permits a retry: unusable history, an unrecoverable required tool error or loss of surface control. Recoverable action errors, loading/generation, wait timeouts and business validation remain in the current attempt; login/CAPTCHA/consent use the user-input path.

Before retrying, preserve the failure and available checkpoint, and confirm the prior controller has stopped with no in-flight action. Reuse a usable conversation; an authorized replacement consumes the same budget. Supply surface IDs, completed/pending actions, last state, failure evidence, side effects to preserve and attempt N/3. Inspect current state and ambiguous results before continuing pending actions.

After the third failed attempt, or earlier when another attempt is not authorized, end the UI operation and report the failure and checkpoint.
