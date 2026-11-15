"use client";

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { chartSpecSchema, type dataChartSchema } from "@/lib/chart-spec";
import type { z } from "zod";
import { LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

const numberFormat = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 2,
});
const compactFormat = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const withUnit = (value: number, unit?: string) =>
  `${numberFormat.format(value)}${unit ? ` ${unit}` : ""}`;

/**
 * The chart itself, drawn from a `render_chart` spec. The plot is forced left-to-right: in a
 * right-to-left page Recharts mirrors the axis labels but not the marks, which would put each
 * label under the wrong bar. The title and legend text around it stay right-to-left.
 */
/** What the plot needs: a `render_chart` spec without its title and description. */
export type ChartData = z.infer<typeof dataChartSchema>;

export const ChartView = memo(function ChartView({
  spec,
}: {
  spec: ChartData;
}) {
  const { type, xKey, series, data, stacked, unit } = spec;
  const config = useMemo<ChartConfig>(() => {
    if (type === "pie") {
      return Object.fromEntries(
        data.map((row, i) => [
          String(row[xKey]),
          { label: String(row[xKey]), color: PALETTE[i % PALETTE.length] },
        ]),
      );
    }
    return Object.fromEntries(
      series.map((s, i) => [
        s.key,
        { label: s.label, color: PALETTE[i % PALETTE.length] },
      ]),
    );
  }, [type, data, xKey, series]);

  const tooltip = (
    <ChartTooltipContent
      formatter={(value, name) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="text-muted-foreground">
            {config[String(name)]?.label ?? name}
          </span>
          <span className="font-mono font-medium tabular-nums">
            {typeof value === "number" ? withUnit(value, unit) : value}
          </span>
        </div>
      )}
    />
  );
  const legend =
    series.length > 1 || type === "pie" ? (
      <ChartLegend
        content={
          <ChartLegendContent nameKey={type === "pie" ? xKey : undefined} />
        }
      />
    ) : null;
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      width={48}
      tickFormatter={(v: number) => compactFormat.format(v)}
    />
  );
  const xAxis = (
    <XAxis
      dataKey={xKey}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={12}
    />
  );
  const grid = <CartesianGrid vertical={false} />;
  const stackId = stacked ? "stack" : undefined;

  let plot;
  if (type === "line") {
    plot = (
      <LineChart data={data} accessibilityLayer>
        {grid}
        {xAxis}
        {yAxis}
        <ChartTooltip content={tooltip} />
        {legend}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            dot={data.length <= 24}
          />
        ))}
      </LineChart>
    );
  } else if (type === "bar") {
    plot = (
      <BarChart data={data} accessibilityLayer>
        {grid}
        {xAxis}
        {yAxis}
        <ChartTooltip content={tooltip} />
        {legend}
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stackId}
            fill={`var(--color-${s.key})`}
            radius={stacked ? 0 : 4}
          />
        ))}
      </BarChart>
    );
  } else if (type === "area") {
    plot = (
      <AreaChart data={data} accessibilityLayer>
        {grid}
        {xAxis}
        {yAxis}
        <ChartTooltip content={tooltip} />
        {legend}
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stackId={stackId}
            stroke={`var(--color-${s.key})`}
            fill={`var(--color-${s.key})`}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    );
  } else if (type === "pie") {
    const key = series[0]!.key;
    plot = (
      <PieChart accessibilityLayer>
        <ChartTooltip content={tooltip} />
        {legend}
        <Pie
          data={data}
          dataKey={key}
          nameKey={xKey}
          innerRadius="45%"
          outerRadius="80%"
          strokeWidth={2}
        >
          {data.map((row, i) => (
            <Cell key={String(row[xKey])} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  } else {
    const s = series[0]!;
    plot = (
      <ScatterChart accessibilityLayer>
        {grid}
        <XAxis
          dataKey={xKey}
          type="number"
          name={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v: number) => compactFormat.format(v)}
        />
        <YAxis
          dataKey={s.key}
          type="number"
          name={s.label}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={48}
          tickFormatter={(v: number) => compactFormat.format(v)}
        />
        <ChartTooltip content={tooltip} />
        <Scatter
          isAnimationActive={false}
          data={data}
          fill={`var(--color-${s.key})`}
        />
      </ScatterChart>
    );
  }

  return (
    <div dir="ltr" className="w-full">
      <ChartContainer
        config={config}
        className={cn("w-full", type === "pie" ? "h-64" : "h-60 sm:h-72")}
      >
        {plot}
      </ChartContainer>
    </div>
  );
});

/** Tool UI for `render_chart`: a card with the chart, or a short placeholder while the call is still being written. */
export const RenderChartTool: ToolCallMessagePartComponent = (props) => {
  const { args, status } = props;
  const parsed = useMemo(() => chartSpecSchema.safeParse(args), [args]);
  const running = status?.type === "running";
  const failed = status?.type === "incomplete" && status.reason !== "cancelled";

  if (!parsed.success) {
    // Still arriving (arguments are partial while the model is writing them).
    if (running) {
      return (
        <div
          data-slot="chart-card"
          className="bg-card text-muted-foreground my-2 flex h-40 items-center justify-center rounded-xl border text-sm"
        >
          <span className="animate-pulse">{t.chart.drawing}</span>
        </div>
      );
    }
    // Finished but the spec is unusable: fall back to the stock tool card so the error is visible.
    return <ToolFallback {...props} />;
  }
  if (failed) return <ToolFallback {...props} />;

  const spec = parsed.data;
  return (
    <figure
      data-slot="chart-card"
      aria-label={t.chart.chartLabel(spec.title)}
      className="bg-card my-2 flex w-full flex-col gap-3 rounded-xl border p-4"
    >
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-pretty">{spec.title}</span>
        {spec.description && (
          <span className="text-muted-foreground text-xs text-pretty">
            {spec.description}
          </span>
        )}
      </figcaption>
      {spec.yLabel && spec.type !== "pie" && (
        <span className="text-muted-foreground -mb-1 text-xs">
          {spec.yLabel}
        </span>
      )}
      <ChartView spec={spec} />
      {spec.xLabel && spec.type !== "pie" && (
        <span className="text-muted-foreground -mt-1 text-center text-xs">
          {spec.xLabel}
        </span>
      )}
    </figure>
  );
};
