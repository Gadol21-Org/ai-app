import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ToolSet } from "ai";
import { t } from "@/lib/i18n";

/**
 * MCP servers the chat agent can call as tools.
 *
 * Servers come from two places and both are optional, so the app starts fine
 * (with just no extra tools) when nothing is configured:
 *
 * 1. Built-in servers below, switched on by their own env vars.
 * 2. `MCP_SERVERS`, a JSON object of `{ "<name>": <server> }` where a server is
 *    either `{ "url": "...", "headers": {...} }` (remote, Streamable HTTP) or
 *    `{ "command": "...", "args": [...], "env": {...} }` (local stdio process).
 *    Example: MCP_SERVERS={"notes":{"url":"https://notes.example.com/mcp","headers":{"Authorization":"Bearer ..."}}}
 *
 * A server that fails to start or list its tools is logged and skipped; it
 * never takes the chat down.
 */

/**
 * Which of a server's tools a person must allow before they run:
 *
 * - `requireApproval`: "all" (the default, so a new server is safe), "none", or a list of
 *   regular expressions matched against the tool name.
 * - `allowTools`: an allow list of tools that never ask, applied on top of `requireApproval`.
 *   Each entry is a tool name, where `*` matches any run of characters
 *   (e.g. `"wanderlog_get_*"` or `"list_trips"`). Use it to let a server's read-only tools through
 *   while everything else keeps asking.
 *
 * A person can still allow an asking tool for the rest of one conversation from its approval card.
 */
export type McpServerConfig = (
  | { url: string; headers?: Record<string, string> }
  | { command: string; args?: string[]; env?: Record<string, string> }
) & { requireApproval?: "all" | "none" | string[]; allowTools?: string[] };

/** Tool results longer than this are cut before they reach the chat, the DB or the model. */
export const MAX_TOOL_RESULT_CHARS =
  Number(process.env.MCP_MAX_RESULT_CHARS) || 8000;

// Third-party servers are installed in ./mcp-servers (see its package.json and the Dockerfile).
const MCP_SERVERS_DIR =
  process.env.MCP_SERVERS_DIR ?? path.join(process.cwd(), "mcp-servers");

/**
 * Wanderlog has no public API, so this uses the unofficial `wanderlog-mcp`
 * (github.com/shaikhspeare/wanderlog-mcp), which signs in with the account's
 * `connect.sid` session cookie.
 */
function wanderlogServer(): McpServerConfig | undefined {
  const cookie = process.env.WANDERLOG_COOKIE?.trim();
  if (!cookie) return undefined;
  const entry = path.join(
    MCP_SERVERS_DIR,
    "node_modules/wanderlog-mcp/dist/index.js",
  );
  if (!existsSync(entry)) {
    console.warn(
      `[mcp] WANDERLOG_COOKIE is set but ${entry} is missing; run "npm ci" in mcp-servers/`,
    );
    return undefined;
  }
  // Only the cookie is passed on, not the rest of our environment (API keys etc.).
  return {
    command: process.execPath,
    args: [entry],
    env: { WANDERLOG_COOKIE: cookie },
    // The read-only tools (get/list/search) run without asking; add/edit/remove/move/... still ask.
    allowTools: ["wanderlog_get_*", "wanderlog_list_*", "wanderlog_search_*"],
  };
}

function parseExtraServers(): Record<string, McpServerConfig> {
  const raw = process.env.MCP_SERVERS?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {}
  console.warn("[mcp] MCP_SERVERS is not a valid JSON object; ignoring it");
  return {};
}

export function getMcpServers(): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig | undefined> = {
    wanderlog: wanderlogServer(),
    ...parseExtraServers(),
  };
  return Object.fromEntries(
    Object.entries(servers).filter(
      (entry): entry is [string, McpServerConfig] => !!entry[1],
    ),
  );
}

type McpResult = {
  content?: Array<{ type: string; text?: string; mimeType?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export function truncate(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text;
  const omitted = text.length - max;
  return `${text.slice(0, max)}\n\n${t.mcp.truncated(omitted)}`;
}

/** Flattens an MCP tool result to plain text, so it reads well in the chat and costs few tokens. */
export function resultToText(result: unknown): string {
  const { content, structuredContent } = (result ?? {}) as McpResult;
  if (!Array.isArray(content)) {
    return typeof result === "string" ? result : JSON.stringify(result ?? null);
  }
  const parts = content.map((item) =>
    item.type === "text" && typeof item.text === "string"
      ? item.text
      : t.mcp.contentOmitted(item.mimeType ?? item.type),
  );
  const text = parts.join("\n").trim();
  return (
    text ||
    (structuredContent !== undefined
      ? JSON.stringify(structuredContent)
      : t.mcp.emptyResult)
  );
}

function limitResults(tools: ToolSet): ToolSet {
  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const execute = tool.execute;
    if (!execute) {
      wrapped[name] = tool;
      continue;
    }
    wrapped[name] = {
      ...tool,
      execute: async (...args: Parameters<typeof execute>) => {
        const result = await execute(...args);
        const text = truncate(resultToText(result));
        // Thrown, so the chat shows it as a failed call instead of a result.
        if ((result as McpResult)?.isError) throw new Error(text);
        return text;
      },
    } as typeof tool;
  }
  return wrapped;
}

async function connect(
  name: string,
  config: McpServerConfig,
): Promise<MCPClient> {
  return createMCPClient({
    name: `family-ai:${name}`,
    transport:
      "url" in config
        ? { type: "http", url: config.url, headers: config.headers }
        : new StdioMCPTransport({
            command: config.command,
            args: config.args,
            env: config.env,
          }),
  });
}

type Loaded = { client: MCPClient; tools: ToolSet };

// Names of loaded MCP tools that need a person's approval (filled in as servers load).
const approvalRequired = new Set<string>();

export function mcpToolRequiresApproval(toolName: string): boolean {
  return approvalRequired.has(toolName);
}

/** Matches a whole tool name against an `allowTools` entry, where `*` stands for any characters. */
export function matchesToolPattern(toolName: string, pattern: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "i").test(toolName);
}

export function needsApproval(
  toolName: string,
  config: Pick<McpServerConfig, "requireApproval" | "allowTools">,
): boolean {
  // A malformed `allowTools` in MCP_SERVERS is ignored, so those tools keep asking.
  if (
    Array.isArray(config.allowTools) &&
    config.allowTools.some(
      (pattern) => typeof pattern === "string" && matchesToolPattern(toolName, pattern),
    )
  )
    return false;
  const rule = config.requireApproval ?? "all";
  if (rule === "all") return true;
  if (rule === "none") return false;
  return rule.some((pattern) => new RegExp(pattern, "i").test(toolName));
}

// One long-lived connection per server, shared by all requests of this Node process
// (a stdio server is a child process, too slow to start for every message).
const loaded = new Map<string, Promise<Loaded>>();

function load(name: string, config: McpServerConfig): Promise<Loaded> {
  let pending = loaded.get(name);
  if (!pending) {
    pending = (async () => {
      const client = await connect(name, config);
      try {
        const tools = limitResults(await client.tools()) as ToolSet;
        for (const toolName of Object.keys(tools)) {
          if (needsApproval(toolName, config))
            approvalRequired.add(toolName);
        }
        return { client, tools };
      } catch (error) {
        await client.close().catch(() => {});
        throw error;
      }
    })();
    // A failed start is forgotten, so the next message tries again.
    pending.catch(() => loaded.delete(name));
    loaded.set(name, pending);
  }
  return pending;
}

/** Tools from every configured MCP server, or `{}` when none are configured or reachable. */
export async function getMcpTools(): Promise<ToolSet> {
  const entries = Object.entries(getMcpServers());
  const results = await Promise.all(
    entries.map(async ([name, config]) => {
      try {
        return (await load(name, config)).tools;
      } catch (error) {
        console.error(
          `[mcp] ${name} unavailable:`,
          error instanceof Error ? error.message : error,
        );
        return {};
      }
    }),
  );
  const tools: ToolSet = {};
  for (const [index, serverTools] of results.entries()) {
    for (const [toolName, tool] of Object.entries(serverTools)) {
      if (toolName in tools) {
        console.warn(
          `[mcp] duplicate tool "${toolName}" from ${entries[index][0]} ignored`,
        );
        continue;
      }
      tools[toolName] = tool;
    }
  }
  return tools;
}
