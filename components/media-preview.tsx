"use client";

import { DownloadIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type MediaPreviewProps = {
  id: string;
  kind: "audio" | "image" | "video";
  status: "generating" | "ready" | "failed";
  title: string;
  className?: string;
};

/** Shows a stored file (audio, image or video) with a download link; also used inside chat tool cards. */
export function MediaPreview({ id, kind, status: initialStatus, title, className }: MediaPreviewProps) {
  // A video still rendering when the chat saved it: ask the server until it is ready or failed.
  const [status, setStatus] = useState(initialStatus);
  useEffect(() => {
    setStatus(initialStatus);
    if (initialStatus !== "generating") return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/media/${id}/status`, { cache: "no-store" });
        const next = res.ok ? ((await res.json()) as { status: MediaPreviewProps["status"] }).status : undefined;
        if (!stopped && next && next !== "generating") return setStatus(next);
      } catch {}
      if (!stopped) timer = setTimeout(poll, 8000);
    };
    let timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, initialStatus]);
  const src = `/api/media/${id}`;
  if (status === "generating")
    return (
      <div className={cn("bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-md p-3 text-sm", className)}>
        <LoaderIcon className="size-4 shrink-0 animate-spin" />
        <span>{t.mediaLibrary.statusGenerating}</span>
        <Link href="/settings/media" className="ms-auto text-xs underline underline-offset-2">
          {t.mediaLibrary.openLibrary}
        </Link>
      </div>
    );
  if (status === "failed")
    return (
      <div className={cn("bg-destructive/10 text-destructive flex items-center gap-2 rounded-md p-3 text-sm", className)}>
        <TriangleAlertIcon className="size-4 shrink-0" />
        {t.mediaLibrary.statusFailed}
      </div>
    );
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {kind === "video" && (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={title}
          className="max-h-96 w-auto max-w-full rounded-md bg-black"
        />
      )}
      {kind === "audio" && <audio src={src} controls preload="metadata" aria-label={title} className="w-full max-w-md" />}
      {kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} className="max-h-96 w-auto max-w-full rounded-md object-contain" loading="lazy" />
      )}
      <a
        href={`${src}?download=1`}
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-xs underline-offset-2 hover:underline"
      >
        <DownloadIcon className="size-3.5" />
        {t.mediaLibrary.download}
      </a>
    </div>
  );
}

