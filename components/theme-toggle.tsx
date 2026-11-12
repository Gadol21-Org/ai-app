"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const options = [
  { value: "light", label: t.theme.light, Icon: Sun },
  { value: "system", label: t.theme.system, Icon: Monitor },
  { value: "dark", label: t.theme.dark, Icon: Moon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label={t.theme.label}
      className="bg-sidebar-accent grid grid-cols-3 gap-1 rounded-lg p-1"
    >
      {options.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "text-muted-foreground flex h-8 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
