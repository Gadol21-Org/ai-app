"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ToolGroupPicker } from "@/components/tool-group-picker";
import type { ToolGroupInfo } from "@/lib/tool-groups";
import { t } from "@/lib/i18n";

/** Edits which tool groups a saved schedule may use; every change is saved right away. */
export function ScheduleToolGroups({
  id,
  groups,
  initial,
  legacy,
}: {
  id: string;
  groups: ToolGroupInfo[];
  initial: string[];
  /** The schedule has no saved list yet (it predates tool groups), so it runs with every group. */
  legacy: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isLegacy, setLegacy] = useState(legacy);
  // The latest save wins, so quick successive clicks can't land out of order.
  const latest = useRef(0);

  const change = async (next: string[]) => {
    setValue(next);
    setError(null);
    const mine = ++latest.current;
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolGroups: next }),
      });
      if (!res.ok) throw new Error();
      if (mine === latest.current) {
        setLegacy(false);
        router.refresh();
      }
    } catch {
      if (mine === latest.current) setError(t.schedule.genericError);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">{t.schedule.groupsLabel}</p>
      <ToolGroupPicker groups={groups} value={value} onChange={change} />
      {isLegacy && <p className="text-muted-foreground text-xs">{t.schedule.groupsLegacy}</p>}
      <p className="text-muted-foreground text-xs">{t.schedule.groupsApprovalNote}</p>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
