import { z } from "zod";

/**
 * The data behind a chart the agent draws with `render_chart`. It is plain data, not a library's
 * props, so the chart can be redrawn by any renderer later and saved conversations keep working.
 * Shared by the server tool (which validates what the model sends) and the chat UI (which draws it).
 */
export const CHART_TYPES = ["line", "bar", "area", "pie", "scatter"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const MAX_ROWS = 500;
export const MAX_SERIES = 6;

const cell = z.union([z.string(), z.number(), z.null()]);

export const chartSpecSchema = z
  .object({
    type: z
      .enum(CHART_TYPES)
      .describe(
        "line: trend over time. bar: compare categories (use stacked for parts of a total). area: trend of a total or cumulative values. pie: share of a whole, 2 to 8 slices, one series. scatter: relationship between two numbers, one series (xKey and the series key must both be numeric).",
      ),
    title: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "Short chart title. Write it in Hebrew unless the user used another language.",
      ),
    description: z
      .string()
      .max(240)
      .optional()
      .describe(
        "Optional one-line subtitle, such as the period or the data source.",
      ),
    xKey: z
      .string()
      .min(1)
      .describe(
        "The field in each data row used for the x axis (or for the slice name in a pie).",
      ),
    series: z
      .array(
        z.object({
          key: z
            .string()
            .min(1)
            .describe(
              "The field in each data row holding this series' number.",
            ),
          label: z
            .string()
            .min(1)
            .max(60)
            .describe("Legend label, in the user's language."),
        }),
      )
      .min(1)
      .max(MAX_SERIES)
      .describe(
        "One entry per line, bar group or pie measure. A pie or scatter takes exactly one.",
      ),
    data: z
      .array(z.record(z.string(), cell))
      .min(1)
      .max(MAX_ROWS)
      .describe(
        'The rows, e.g. [{ "day": "א׳", "spend": 210, "revenue": 640 }]. Use the real numbers from your tools, never invented ones. Numbers must be plain numbers, not strings.',
      ),
    stacked: z
      .boolean()
      .optional()
      .describe("Stack the series (bar and area only)."),
    xLabel: z
      .string()
      .max(60)
      .optional()
      .describe(
        "Optional title for the x axis, in the user's language. Useful for scatter charts.",
      ),
    yLabel: z
      .string()
      .max(60)
      .optional()
      .describe("Optional title for the y axis, in the user's language."),
    unit: z
      .string()
      .max(12)
      .optional()
      .describe("A unit shown after values, such as ₪ or %."),
  })
  .superRefine((spec, ctx) => {
    if (
      (spec.type === "pie" || spec.type === "scatter") &&
      spec.series.length !== 1
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["series"],
        message: `A ${spec.type} chart takes exactly one series.`,
      });
    }
    const seen = new Set<string>();
    spec.series.forEach((s, i) => {
      if (seen.has(s.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["series", i, "key"],
          message: `Duplicate series key "${s.key}".`,
        });
      }
      seen.add(s.key);
    });
    spec.data.forEach((row, i) => {
      if (!(spec.xKey in row) || row[spec.xKey] === null) {
        ctx.addIssue({
          code: "custom",
          path: ["data", i, spec.xKey],
          message: `Row ${i} has no "${spec.xKey}".`,
        });
      }
      for (const s of spec.series) {
        const v = row[s.key];
        if (v !== null && v !== undefined && typeof v !== "number") {
          ctx.addIssue({
            code: "custom",
            path: ["data", i, s.key],
            message: `"${s.key}" in row ${i} must be a number.`,
          });
        }
      }
      if (spec.type === "scatter" && typeof row[spec.xKey] !== "number") {
        ctx.addIssue({
          code: "custom",
          path: ["data", i, spec.xKey],
          message: `Scatter x values must be numbers (row ${i}).`,
        });
      }
    });
  });

export type ChartSpec = z.infer<typeof chartSpecSchema>;

/** The result the tool returns, so the model knows the chart was shown and can add its insight. */
export type ChartToolResult = {
  shown: true;
  type: ChartType;
  rows: number;
  series: number;
};
