"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";

export function PresenterUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError(t.mediaLibrary.uploadNoFile);
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("name", name);
      const res = await fetch("/api/media/presenters", { method: "POST", body });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? String(res.status));
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.mediaLibrary.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="flex flex-col gap-2">
      <Input
        id="presenter-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.mediaLibrary.presenterNamePlaceholder}
        aria-label={t.mediaLibrary.presenterNamePlaceholder}
        maxLength={100}
      />
      <input
        id="presenter-file"
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t.mediaLibrary.presenterChoose}
        className="text-sm file:me-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          <Upload />
          {busy ? t.mediaLibrary.uploading : t.mediaLibrary.presenterUpload}
        </Button>
        {error && <span className="text-destructive text-xs">{error}</span>}
      </div>
    </form>
  );
}
