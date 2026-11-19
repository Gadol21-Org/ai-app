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

const chartFields = {
    type: z
      .enum(CHART_TYPES)
      .describe(
        "line: trend over time. bar: compare categories. area: trend of a total. pie: share of a whole (2-8 slices, one series). scatter: two numbers (one series, xKey numeric).",
      ),
    title: z
      .string()
      .min(1)
      .max(120)
      .describe(
        "Short title.",
      ),
    description: z
      .string()
      .max(240)
      .optional()
      .describe(
        "Optional subtitle.",
      ),
    xKey: z
      .string()
      .min(1)
      .describe(
        "Row field for the x axis (pie: slice name).",
      ),
    series: z
      .array(
        z.object({
          key: z
            .string()
            .min(1)
            .describe(
              "Row field holding the number.",
            ),
          label: z
            .string()
            .min(1)
            .max(60)
            .describe("Legend label."),
        }),
      )
      .min(1)
      .max(MAX_SERIES)
      .describe(
        "One per line or bar group; pie and scatter take one.",
      ),
    data: z
      .array(z.record(z.string(), cell))
      .min(1)
      .max(MAX_ROWS)
      .describe(
        'Rows, e.g. [{"day":"א׳","spend":210}]. Real numbers only, as numbers not strings.',
      ),
    stacked: z
      .boolean()
      .optional()
      .describe("Stack series (bar, area)."),
    xLabel: z
      .string()
      .max(60)
      .optional()
      .describe(
        "X axis title.",
      ),
    yLabel: z
      .string()
      .max(60)
      .optional()
      .describe("Y axis title."),
    unit: z
      .string()
      .max(12)
      .optional()
      .describe("Unit after values, e.g. ₪ or %."),
  };

type ChartCheckInput = {
  type: (typeof CHART_TYPES)[number];
  xKey: string;
  series: { key: string; label: string }[];
  data: Record<string, string | number | null>[];
};

/** Checks that the rows actually match the declared keys, so a bad call fails before anything is drawn. */
function checkChart(spec: ChartCheckInput, ctx: z.RefinementCtx) {
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
}

export const chartSpecSchema = z.object(chartFields).superRefine(checkChart);

/**
 * The chart as a piece of generative UI. The surrounding Card or Header carries the title, so this
 * has no title or description of its own, which also keeps its props from clashing with theirs.
 */
export const dataChartSchema = z
  .object(chartFields)
  .omit({ title: true, description: true })
  .superRefine(checkChart);

export type ChartSpec = z.infer<typeof chartSpecSchema>;

/** The result the tool returns, so the model knows the chart was shown and can add its insight. */
export type ChartToolResult = {
  shown: true;
  type: ChartType;
  rows: number;
  series: number;
};
