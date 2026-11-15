import {
  defaultGenerativeUILibrary,
  type GenerativeUILibrary,
} from "@assistant-ui/generative-ui/react";
import type { JSONSchema7 } from "ai";
import { dataChartSchema } from "@/lib/chart-spec";

/**
 * What the model may compose with the `present` tool: a small set of layout and text pieces from
 * assistant-ui's generative UI, plus `DataChart`, our Recharts chart. Kept small on purpose:
 * every component adds to the tool's schema, which is sent to the model on every request, and the
 * app has no use yet for forms, maps or other interactive pieces.
 */
export const PRESENT_COMPONENTS = [
  "Col",
  "Row",
  "Card",
  "Header",
  "Text",
  "Caption",
  "Fact",
  "Badge",
  "Alert",
  "Divider",
  "Table",
] as const;

export const DATA_CHART_DESCRIPTION =
  "A chart of numbers you already have: line, bar, area, pie or scatter, with real axes, a legend and tooltips. " +
  "Use it inside a Card or Col next to Fact and Table pieces. Same data format as the render_chart tool.";

/** The vocabulary without any rendering, for the server, which only needs the schemas. */
export function schemaOnlyVocabulary(): GenerativeUILibrary {
  const lib: GenerativeUILibrary = {};
  for (const name of PRESENT_COMPONENTS) {
    const c = defaultGenerativeUILibrary[name];
    if (c) lib[name] = c;
  }
  lib.DataChart = {
    description: DATA_CHART_DESCRIPTION,
    properties: dataChartSchema,
    render: () => null,
  };
  return lib;
}

/**
 * What the model is told about `present`, written by hand and kept short: the generated schema for
 * the whole vocabulary (every prop, with each component's long description) was over 7,000 tokens,
 * and it is sent on every step of every chat. This lists only the pieces and props worth using;
 * the renderer still accepts anything in {@link PRESENT_COMPONENTS}.
 */
export const presentParameters: JSONSchema7 = {
  $ref: "#/$defs/node",
  $defs: {
    node: {
      type: "object",
      properties: {
        _type: {
          type: "string",
          enum: ["Col", "Row", "Card", "Header", "Text", "Fact", "Table", "DataChart"],
          description:
            "Col: vertical stack. Row: horizontal row. Card: titled panel (do not nest cards or wrap the whole answer). Header: heading. Text: paragraph. Fact: label with a big value and optional change. Table. DataChart: a chart of numbers you already have.",
        },
        children: { type: "array", items: { $ref: "#/$defs/node" }, description: "Nested nodes (Col, Row, Card)." },
        gap: { type: "number", description: "Col/Row: spacing." },
        align: { type: "string", enum: ["start", "center", "end"], description: "Col/Row: alignment." },
        title: { type: "string", description: "Card or DataChart title." },
        text: { type: "string", description: "Header: the heading." },
        value: { type: ["string", "number"], description: "Text or Fact: the value." },
        size: { type: "string", enum: ["sm", "md", "lg", "xl", "2xl", "3xl"], description: "Header or Text size." },
        label: { type: "string", description: "Fact: what the value is." },
        delta: { type: "string", description: "Fact: the change, e.g. +12%." },
        trend: { type: "string", enum: ["up", "down", "flat"], description: "Fact: direction of the change." },
        upIsGood: { type: "boolean", description: "Fact: false when up is bad (e.g. spend)." },
        columns: {
          type: "array",
          description: "Table: one per column.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              align: { type: "string", enum: ["start", "end"] },
              format: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["number", "currency", "percent", "date"], description: "percent takes a fraction (0.25 is 25%)." },
                  currency: { type: "string" },
                  decimals: { type: "number" },
                },
                required: ["kind"],
              },
            },
            required: ["label"],
          },
        },
        rows: {
          type: "array",
          description: "Table: rows of cells, in column order.",
          items: { type: "array", items: { type: ["string", "number", "boolean"] } },
        },
        type: {
          type: "string",
          enum: ["line", "bar", "area", "pie", "scatter"],
          description: "DataChart: line (trend), bar (compare; stacked for parts), area, pie (2-8 slices, one series), scatter (numeric x, one series).",
        },
        xKey: { type: "string", description: "DataChart: row field for the x axis (slice name in a pie)." },
        series: {
          type: "array",
          description: "DataChart: one per line/bar group (pie and scatter take one).",
          items: {
            type: "object",
            properties: { key: { type: "string", description: "Row field with the number." }, label: { type: "string", description: "Legend label." } },
            required: ["key", "label"],
          },
        },
        data: {
          type: "array",
          description: 'DataChart: rows, e.g. [{"day":"א׳","spend":210}]. Real numbers from your tools, as numbers.',
          items: { type: "object", additionalProperties: { type: ["string", "number", "null"] } },
        },
        stacked: { type: "boolean", description: "DataChart: stack bar/area series." },
        xLabel: { type: "string", description: "DataChart: x axis title." },
        yLabel: { type: "string", description: "DataChart: y axis title." },
        unit: { type: "string", description: "DataChart: unit after values, e.g. ₪." },
      },
      required: ["_type"],
    },
  },
};
