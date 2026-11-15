/**
 * Prints how many input tokens the system prompt and each tool declaration cost, since the model is
 * sent all of them again on every step of a chat turn.
 *
 *   CHAT_MODEL=google:gemini-3.8-flash GOOGLE_GENERATIVE_AI_API_KEY=... WANDERLOG_COOKIE=... npx tsx --conditions react-server scripts/tool-token-report.mts
 *
 * Uses Gemini's countTokens endpoint, which is free. Needs the same env as the app (MCP servers, key).
 */
import { asSchema } from "ai";
import { getChatTools } from "../lib/tools";
import { getChatModelId } from "../lib/models";
import { SYSTEM_PROMPT } from "../lib/system-prompt";
import { TURN_CONTEXT_INSTRUCTIONS } from "../lib/turn-context";

const model = getChatModelId().split(":").slice(1).join(":");
const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";

type Decl = { name: string; description?: string; parameters?: unknown };

function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (schema && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema).filter(([k]) => k !== "$schema" && k !== "additionalProperties").map(([k, v]) => [k, clean(v)]),
    );
  }
  return schema;
}

const toDecl = (d: Decl) => ({ name: d.name, description: d.description, parametersJsonSchema: d.parameters });

async function count(body: Record<string, unknown>): Promise<number> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-goog-api-key": key } : {}) },
    body: JSON.stringify({ generateContentRequest: { model: `models/${model}`, contents: [{ role: "user", parts: [{ text: "hi" }] }], ...body } }),
  });
  if (!res.ok) throw new Error(`countTokens ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { totalTokens: number }).totalTokens;
}

const tools = await getChatTools();
const decls: Decl[] = [];
for (const [name, t] of Object.entries(tools)) {
  const schema = await asSchema(t.inputSchema as never).jsonSchema;
  decls.push({ name, description: t.description, parameters: clean(schema) });
}

const base = await count({});
const system = (await count({ systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\n${TURN_CONTEXT_INSTRUCTIONS} When a tool call is not approved, do not retry it.` }] } })) - base;
const rows: { name: string; tokens: number }[] = [{ name: "(system prompt)", tokens: system }];
let withAll = 0;
await Promise.all(
  decls.map(async (d) => {
    rows.push({ name: d.name, tokens: (await count({ tools: [{ functionDeclarations: [toDecl(d)] }] })) - base });
  }),
);
withAll = (await count({ tools: [{ functionDeclarations: decls.map(toDecl) }] })) - base;

rows.sort((a, b) => b.tokens - a.tokens);
for (const r of rows) console.log(`${String(r.tokens).padStart(6)}  ${r.name}`);
console.log(`${String(withAll).padStart(6)}  all ${decls.length} tool declarations together`);
console.log(`${String(withAll + system).padStart(6)}  fixed overhead per step (system + tools)`);

process.exit(0); // the MCP server's child process would otherwise keep this alive
