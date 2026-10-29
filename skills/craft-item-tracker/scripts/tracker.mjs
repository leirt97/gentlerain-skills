#!/usr/bin/env node
// Ideas, life and work to-dos in the Craft collection 事项 (document 事项跟踪), through the Craft API client in ~/D/Craft.
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const CRAFT_DIR = join(homedir(), "D/Craft");
const { buildClient, craftRequest } = await import(pathToFileURL(join(CRAFT_DIR, "craft-api.mjs")).href);

const COLLECTION_ID = "956fbcb3-11a8-11e0-7011-16006bbceb87";
const ITEMS_PATH = `/collections/${COLLECTION_ID}/items`;
const LOG_HEADING = "## 进展记录";
const CHECKLIST_HEADING = "## 清单";
const INITIAL_BODY = `## 目标\n\n做成什么样算完成（一两句）\n\n${LOG_HEADING}\n`;
const WATCHED_STATUSES = ["进行中", "等待他人"];
const STALE_DAYS = 2;
const MAX_IN_PROGRESS = 3;
const FOLLOWED_STATUSES = ["暂停", "放弃"];
const CLOSED_STATUSES = ["完成", "放弃"];
const FOLLOW_PATTERN = /随父事项「[^」]*」(?:暂停|放弃)，原状态：(\S+)/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

let client;
const api = (method, path, options) => craftRequest((client ??= buildClient()), method, path, options);

async function add({ title, type, status = defaultStatus(type), week = false, due, next }) {
  const keys = await readKeys();
  const properties = { [keys.类型]: type, [keys.状态]: status, [keys.本周]: week };
  if (due) properties[keys.截止日期] = due;
  if (next) properties[keys.下一步] = next;

  const { items } = await api("POST", ITEMS_PATH, { body: { items: [{ [keys.title]: title, properties }] } });
  const itemId = items[0].id;
  await insertMarkdown(INITIAL_BODY, { position: "end", pageId: itemId });
  return itemId;
}

async function log({ item, text, status }) {
  const keys = await readKeys();
  const items = await readItems();
  const target = findItem(items, item, keys.title);
  const line = await appendLog(target, keys, text, status);
  if (!status) return line;

  await updateProperties(target.id, { [keys.状态]: status });
  return [line, ...(await moveChildren(target, status, items, keys))].join("\n");
}

async function inbox() {
  const tasks = await readInbox();
  const lines = tasks.map((task) => [taskText(task), task.taskInfo.scheduleDate && `计划 ${task.taskInfo.scheduleDate}`, task.id]);
  return lines.map((fields) => fields.filter(Boolean).join(" | ")).join("\n") || "（收件箱没有待办）";
}

// The original to-do is cancelled, which moves it to the Craft logbook, so every to-do is tracked in one place.
async function importTask({ task: taskId, type, item, title }) {
  if (Boolean(type) === Boolean(item)) throw new Error("import 需要 --type（建新事项）或 --item（加进已有事项的清单）之一");
  const task = (await readInbox()).find((entry) => entry.id === taskId);
  if (!task) throw new Error(`收件箱里没有待办 ${taskId}`);

  const result = type ? await importAsItem(task, type, title) : await importIntoChecklist(task, item);
  await api("PUT", "/tasks", { body: { tasksToUpdate: [{ id: task.id, taskInfo: { state: "canceled" } }] } });
  return result;
}

async function importAsItem(task, type, title = taskText(task)) {
  const itemId = await add({ title, type });
  const scheduled = task.taskInfo.scheduleDate ? `，原计划日期 ${task.taskInfo.scheduleDate}` : "";
  return `${title}：${await log({ item: itemId, text: `从 Craft 任务收件箱迁入${scheduled}` })}`;
}

async function importIntoChecklist(task, item) {
  const keys = await readKeys();
  const target = findItem(await readItems(), item, keys.title);
  const entry = `- [ ] ${taskText(task)}`;
  const checklist = target.content?.find((block) => block.markdown === CHECKLIST_HEADING);
  if (checklist) await insertMarkdown(entry, { position: "after", siblingId: checklist.id });
  else await insertMarkdown(`${CHECKLIST_HEADING}\n\n${entry}`, { position: "before", siblingId: logHeading(target, keys).id });
  return `${target[keys.title]}：${await appendLog(target, keys, `收件箱待办「${taskText(task)}」加进清单`)}`;
}

async function set({ item, week, due, next }) {
  const keys = await readKeys();
  const target = findItem(await readItems(), item, keys.title);
  const properties = {};
  if (week !== undefined) properties[keys.本周] = week;
  if (due !== undefined) properties[keys.截止日期] = due;
  if (next !== undefined) properties[keys.下一步] = next;
  if (!Object.keys(properties).length) throw new Error("set 至少需要 --week/--no-week、--due 或 --next 之一；改状态用 log --status");

  await updateProperties(target.id, properties);
  return formatItem(findItem(await readItems(), target.id, keys.title), keys);
}

async function list({ item, status, week, type }) {
  const keys = await readKeys();
  let items = await readItems();
  if (item) items = [findItem(items, item, keys.title)];
  if (status) items = items.filter((entry) => entry.properties[keys.状态] === status);
  if (week !== undefined) items = items.filter((entry) => Boolean(entry.properties[keys.本周]) === week);
  if (type) items = items.filter((entry) => entry.properties[keys.类型] === type);
  return items.map((entry) => formatItem(entry, keys)).join("\n") || "（没有匹配的事项）";
}

async function review({ write = false }) {
  const keys = await readKeys();
  const today = formatLogTime(new Date()).slice(0, 10);
  const watched = (await readItems()).filter((item) => WATCHED_STATUSES.includes(item.properties[keys.状态]));
  const inProgressCount = watched.filter((item) => item.properties[keys.状态] === "进行中").length;

  const staleLines = [];
  for (const item of watched) {
    const lastDate = lastLogDate(item);
    const days = lastDate && daysBetween(lastDate, today);
    if (lastDate && days < STALE_DAYS) continue;
    const since = lastDate ? `最后推进 ${lastDate}（${days} 天前）` : "没有进展记录";
    staleLines.push(`- ${item[keys.title]}：${item.properties[keys.状态]}，${since}`);
  }

  const lines = ["## 事项检查"];
  if (staleLines.length) lines.push(`停滞事项（${STALE_DAYS} 天以上没有新进展）：`, ...staleLines);
  else lines.push("没有停滞的事项。");
  if (inProgressCount > MAX_IN_PROGRESS) {
    lines.push(`进行中 ${inProgressCount} 件，超过 ${MAX_IN_PROGRESS} 件，检查是否有事项实际已经停了。`);
  }
  lines.push("今天有没有做了、但事项表里没有的事？");

  // A single newline keeps two sentences in one Craft block.
  const markdown = lines.join("\n\n");
  if (write) await insertMarkdown(markdown, { position: "end", date: "today" });
  return markdown;
}

async function appendLog(item, keys, text, status) {
  const line = `${formatLogTime(new Date())}  ${text}${status ? `  → ${status}` : ""}`;
  await insertMarkdown(line, { position: "after", siblingId: logHeading(item, keys).id });
  return line;
}

function logHeading(item, keys) {
  const heading = item.content?.find((block) => block.markdown === LOG_HEADING);
  if (!heading) throw new Error(`「${item[keys.title]}」的正文里没有「${LOG_HEADING}」标题`);
  return heading;
}

// Children are the items linked from the parent's body.
async function moveChildren(parent, parentStatus, items, keys) {
  const ids = childIds(parent);
  const lines = [];
  for (const child of items.filter((entry) => ids.includes(entry.id))) {
    const childStatus = child.properties[keys.状态];
    const next = followedStatus(parentStatus, child, childStatus);
    if (!next) continue;

    const text = FOLLOWED_STATUSES.includes(parentStatus)
      ? `随父事项「${parent[keys.title]}」${parentStatus}，原状态：${childStatus}`
      : `随父事项「${parent[keys.title]}」恢复`;
    lines.push(`${child[keys.title]}：${await appendLog(child, keys, text, next)}`);
    await updateProperties(child.id, { [keys.状态]: next });
  }
  return lines;
}

// Property keys change when the schema is edited in Craft, so they are resolved by name on every run.
async function readKeys() {
  const schema = await api("GET", `/collections/${COLLECTION_ID}/schema`, { query: { format: "schema" } });
  const keys = { title: schema.contentPropDetails.key };
  for (const property of schema.properties) keys[property.name] = property.key;
  return keys;
}

async function readItems() {
  const { items } = await api("GET", ITEMS_PATH, { query: { maxDepth: 1 } });
  return items;
}

async function readInbox() {
  const { items } = await api("GET", "/tasks", { query: { scope: "inbox" } });
  return items;
}

function findItem(items, ref, titleKey) {
  const byId = items.find((item) => item.id === ref);
  if (byId) return byId;

  const matches = items.filter((item) => item[titleKey]?.includes(ref));
  if (matches.length !== 1) {
    const titles = matches.map((item) => item[titleKey]).join("、");
    throw new Error(`「${ref}」匹配到 ${matches.length} 条事项${titles ? `：${titles}` : ""}`);
  }
  return matches[0];
}

function updateProperties(itemId, properties) {
  return api("PUT", ITEMS_PATH, { body: { itemsToUpdate: [{ id: itemId, properties }] } });
}

function insertMarkdown(markdown, position) {
  return api("POST", "/blocks", { body: { markdown, position } });
}

function formatItem(item, keys) {
  const p = item.properties;
  const fields = [
    p[keys.类型],
    p[keys.状态],
    p[keys.本周] ? "本周" : "",
    p[keys.截止日期] ? `截止 ${p[keys.截止日期]}` : "",
    p[keys.下一步] ? `下一步：${p[keys.下一步]}` : "",
    `最后推进 ${lastLogDate(item) ?? "无"}`,
  ];
  return `${item[keys.title]} | ${fields.filter(Boolean).join(" | ")} | ${item.id}`;
}

export function taskText(task) {
  return task.markdown.replace(/^- \[ \] /, "");
}

export function defaultStatus(type) {
  return type === "想法" ? "未决定" : "待做";
}

// YYYY-MM-DD 星期X 上午/下午h:mm in Asia/Taipei.
export function formatLogTime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.weekday} ${parts.dayPeriod}${parts.hour}:${parts.minute}`;
}

export function lastLogDate(item) {
  return latestLogLine(item)?.match(DATE_PATTERN)?.[0];
}

// The newest entry is the first dated line after the 进展记录 heading.
function latestLogLine(item) {
  const blocks = item.content ?? [];
  const headingIndex = blocks.findIndex((block) => block.markdown === LOG_HEADING);
  if (headingIndex === -1) return undefined;
  return blocks.slice(headingIndex + 1).find((block) => DATE_PATTERN.test(block.markdown ?? ""))?.markdown;
}

export function childIds(item) {
  const links = (item.content ?? []).flatMap((block) => [...(block.markdown ?? "").matchAll(/block:\/\/([0-9a-f-]{36})/gi)]);
  return [...new Set(links.map((match) => match[1]))];
}

// A child pauses or is dropped with its parent and, when the parent resumes, returns to the status recorded in its
// follow line. A child paused for its own reason has a different newest line and stays paused.
export function followedStatus(parentStatus, child, childStatus) {
  if (FOLLOWED_STATUSES.includes(parentStatus)) {
    return CLOSED_STATUSES.includes(childStatus) || childStatus === parentStatus ? undefined : parentStatus;
  }
  if (CLOSED_STATUSES.includes(parentStatus) || !FOLLOWED_STATUSES.includes(childStatus)) return undefined;
  return latestLogLine(child)?.match(FOLLOW_PATTERN)?.[1];
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

const COMMANDS = {
  add: { run: add, required: ["title", "type"] },
  log: { run: log, required: ["item", "text"] },
  set: { run: set, required: ["item"] },
  list: { run: list, required: [] },
  review: { run: review, required: [] },
  inbox: { run: inbox, required: [] },
  import: { run: importTask, required: ["task"] },
  now: { run: () => `${formatLogTime(new Date())}  `, required: [] },
};

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      title: { type: "string" },
      type: { type: "string" },
      status: { type: "string" },
      week: { type: "boolean" },
      due: { type: "string" },
      next: { type: "string" },
      item: { type: "string" },
      text: { type: "string" },
      write: { type: "boolean" },
      task: { type: "string" },
    },
  });
  const command = COMMANDS[positionals[0]];
  if (!command) throw new Error(`用法：tracker.mjs ${Object.keys(COMMANDS).join("|")}，参数见 SKILL.md`);
  requireOptions(values, command.required);

  const envFile = join(CRAFT_DIR, ".env.local");
  if (!process.env.CRAFT_API_KEY && existsSync(envFile)) process.loadEnvFile(envFile);
  console.log(await command.run(values));
}

function requireOptions(values, names) {
  const missing = names.filter((name) => !values[name]);
  if (missing.length) throw new Error(`缺少参数：${missing.map((name) => `--${name}`).join(" ")}`);
}

// Agents run the script through the skill symlinks, while import.meta.url is the resolved path.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
