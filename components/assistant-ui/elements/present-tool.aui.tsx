"use client";

import { Component, type ReactNode, useMemo } from "react";
import {
  type GenerativeUILibrary,
  renderGenerativeUI,
} from "@assistant-ui/generative-ui/react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ChartView } from "@/components/assistant-ui/elements/chart-tool.aui";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { schemaOnlyVocabulary } from "@/lib/generative-ui-vocabulary";
import { dataChartSchema } from "@/lib/chart-spec";
import { t } from "@/lib/i18n";

/** The vocabulary with `DataChart` drawn by our Recharts chart. */
const library: GenerativeUILibrary = (() => {
  const lib = schemaOnlyVocabulary();
  lib.DataChart = {
    ...lib.DataChart!,
    render: (props) => {
      const parsed = dataChartSchema.safeParse(props);
      if (!parsed.success) {
        return (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            <span className="animate-pulse">{t.chart.drawing}</span>
          </div>
        );
      }
      const spec = parsed.data;
      return (
        <div data-slot="data-chart" className="flex w-full flex-col gap-1">
          {spec.yLabel && spec.type !== "pie" && (
            <span className="text-muted-foreground text-xs">{spec.yLabel}</span>
          )}
          <ChartView spec={spec} />
          {spec.xLabel && spec.type !== "pie" && (
            <span className="text-muted-foreground text-center text-xs">
              {spec.xLabel}
            </span>
          )}
        </div>
      );
    },
  };
  return lib;
})();

/** A bad tree from the model must not break the whole message: fall back to the plain tool card. */
class PresentBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Tool UI for `present`: the model composes cards, facts, tables and charts from a fixed
 * vocabulary and this draws the tree. Nothing the model writes is run, and a component name
 * outside the vocabulary is rejected.
 */
export const PresentTool: ToolCallMessagePartComponent = (props) => {
  const { args, status } = props;
  const running = status?.type === "running";
  const tree = useMemo(
    () =>
      args && Object.keys(args).length > 0
        ? renderGenerativeUI(args, library, {
            status: running ? "streaming" : "done",
          })
        : null,
    [args, running],
  );
  if (tree === null) {
    return running ? (
      <div
        data-slot="present-card"
        className="text-muted-foreground my-2 animate-pulse text-sm"
      >
        {t.chart.drawing}
      </div>
    ) : (
      <ToolFallback {...props} />
    );
  }
  return (
    <PresentBoundary fallback={<ToolFallback {...props} />}>
      <div data-slot="present-card" data-aui="root" className="my-2 w-full">
        {tree}
      </div>
    </PresentBoundary>
  );
};
