import {
  defaultGenerativeUILibrary,
  type GenerativeUILibrary,
} from "@assistant-ui/generative-ui/react";
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
