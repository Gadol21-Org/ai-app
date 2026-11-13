"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ToolGroupInfo } from "@/lib/tool-groups";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * The tool groups of a scheduled prompt. Folded, it is one wrapping line naming the enabled groups;
 * unfolded, every group has a checkbox. Used on the add-schedule approval card and in Settings.
 */
export function ToolGroupPicker({
  groups,
  value,
  onChange,
  disabled,
  className,
}: {
  groups: ToolGroupInfo[];
  /** Ids of the enabled groups. */
  value: readonly string[];
  /** Left out when the list is only shown, not editable. */
  onChange?: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const labelOf = (id: string) => groups.find((g) => g.id === id)?.label ?? id;
  // Ids no longer offered (a removed server) are still named, so nothing disappears silently.
  const enabled = [...groups.map((g) => g.id).filter((id) => value.includes(id)), ...value.filter((id) => !groups.some((g) => g.id === id))];
  const summary = enabled.length > 0 ? enabled.map(labelOf).join(" · ") : t.schedule.groupsNone;
  const editable = !!onChange && !disabled;

  const toggle = (id: string) => onChange?.(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div data-slot="tool-group-picker" className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted/60 -mx-1.5 flex items-start gap-2 rounded-md px-1.5 py-1 text-start"
      >
        <span className="min-w-0 flex-1 text-sm leading-6 break-words">{summary}</span>
        <ChevronDown className={cn("text-muted-foreground mt-1 size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul id={panelId} className="bg-muted/40 flex flex-col gap-0.5 rounded-md p-1.5">
          {groups.map((g) => (
            <li key={g.id}>
              <label
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                  editable ? "hover:bg-muted cursor-pointer" : "opacity-70",
                )}
              >
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={value.includes(g.id)}
                  disabled={!editable}
                  onChange={() => toggle(g.id)}
                />
                {g.label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
