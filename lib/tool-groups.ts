/**
 * Tool groups: every tool belongs to one group, and a scheduled prompt stores which groups it may
 * use, so a run only sees the tools its task needs. Each MCP server is one group (named after the
 * server); the app's own tools are grouped by what they are for. This file holds the parts the
 * browser needs too (labels, descriptions, and how the approval card passes an override back);
 * which groups exist right now is decided on the server in lib/tools.ts.
 */

export type ToolGroupInfo = {
  id: string;
  /** Short name shown to people (Hebrew). */
  label: string;
  /** What the group is for, written for the model so it can choose which groups a task needs. */
  description: string;
};

/** The groups for the app's own tools, and the MCP servers that ship with it. */
export const KNOWN_GROUPS: Record<string, Omit<ToolGroupInfo, "id">> = {
  notifications: {
    label: "משפחה והתראות",
    description:
      "list_users (who the family members are) and send_notification (push notification and inbox message to everyone or one person). " +
      "A scheduled run has nobody watching, so enable this whenever the task should report a result or alert someone.",
  },
  elevenlabs: {
    label: "ElevenLabs: קול ווידאו",
    description:
      "Make ad media with ElevenLabs: list voices, generate speech from a script, make a presenter image, and render talking-head or scene videos " +
      "(videos always wait for a person's approval), plus the media library of what was made. Enable it for tasks that create audio, images or video.",
  },
  meta_ads: {
    label: "מטא: מודעות",
    description:
      "The Meta (Facebook and Instagram) ads account: read campaign, ad set and ad performance and insights, and create or change campaigns, ads and video ads " +
      "(changes always wait for a person's approval). Enable it for tasks about ad performance or about creating or updating ads.",
  },
  wanderlog: {
    label: "Wanderlog: טיולים",
    description: "The family's Wanderlog trip plans: read trips, places and itineraries and edit them (edits wait for a person's approval).",
  },
  charts: {
    label: "תרשימים והצגה",
    description: "Draw charts and composed reports in the chat. Needs a person looking at the chat, so it is not available to scheduled runs.",
  },
  schedules: {
    label: "תזמונים",
    description: "Create, list and delete scheduled prompts. Not available to scheduled runs, so a schedule can never spawn more schedules.",
  },
};

/** The label and description for a group id; an MCP server not listed above is described by its own config. */
export function describeGroup(id: string, fallbackDescription?: string): ToolGroupInfo {
  const known = KNOWN_GROUPS[id];
  return {
    id,
    label: known?.label ?? id,
    description: known?.description ?? fallbackDescription ?? `Tools from the "${id}" MCP server.`,
  };
}

/**
 * The approval card sends the person's group choice back as the approval's `reason`, because that
 * is the one free-form field an approval answer carries. The chat route reads it, checks it
 * against the groups that exist, and puts it into the tool call's input before the call runs.
 */
export const TOOL_GROUPS_REASON_PREFIX = "toolGroups:";

export function encodeToolGroupsReason(ids: readonly string[]): string {
  return TOOL_GROUPS_REASON_PREFIX + JSON.stringify(ids);
}

export function decodeToolGroupsReason(reason: string | undefined): string[] | undefined {
  if (!reason?.startsWith(TOOL_GROUPS_REASON_PREFIX)) return undefined;
  try {
    const parsed: unknown = JSON.parse(reason.slice(TOOL_GROUPS_REASON_PREFIX.length));
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}
