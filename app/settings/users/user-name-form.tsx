"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";

export function UserNameForm({
  id,
  email,
  name,
}: {
  id: string;
  email: string;
  name: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = value.trim() !== (name ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={80}
        placeholder={t.users.namePlaceholder}
        aria-label={t.users.nameLabel(email)}
      />
      <Button
        type="submit"
        variant={saved ? "secondary" : "default"}
        disabled={busy || (!dirty && !saved)}
      >
        {saved ? <Check /> : null}
        {saved ? t.users.saved : t.users.save}
      </Button>
    </form>
  );
}
