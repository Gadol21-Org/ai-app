"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export function DeleteMediaButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    if (!window.confirm(t.mediaLibrary.confirmDelete)) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-destructive text-xs">{t.mediaLibrary.deleteFailed}</span>}
      <Button variant="ghost" size="sm" disabled={busy} onClick={remove}>
        <Trash2 />
        {busy ? t.mediaLibrary.deleting : t.mediaLibrary.delete}
      </Button>
    </span>
  );
}
