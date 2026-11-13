import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MediaPreview } from "@/components/media-preview";
import { formatBytes, formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { isPresenter, listMedia } from "@/lib/media/store";
import { DeleteMediaButton } from "./delete-media-button";
import { PresenterUpload } from "./presenter-upload";

export const metadata: Metadata = { title: `${t.mediaLibrary.pageTitle} · ${t.appName}` };
export const dynamic = "force-dynamic";

const kindLabel = { audio: t.mediaLibrary.kindAudio, image: t.mediaLibrary.kindImage, video: t.mediaLibrary.kindVideo } as const;

export default async function MediaPage() {
  const items = await listMedia({ limit: 100 });
  const presenters = items.filter(isPresenter);
  const total = items.reduce((n, m) => n + (m.bytes ?? 0), 0);

  return (
    <div className="app-shell overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button variant="ghost" size="icon" aria-label={t.settings.pageTitle} nativeButton={false} render={<Link href="/settings" />}>
          <ArrowRight />
        </Button>
        <h1 className="text-sm font-medium">{t.mediaLibrary.pageTitle}</h1>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <section className="flex flex-col gap-3" aria-labelledby="presenters-title">
          <div>
            <h2 id="presenters-title" className="text-lg font-semibold">{t.mediaLibrary.presenters}</h2>
            <p className="text-muted-foreground text-sm">{t.mediaLibrary.presentersDesc}</p>
          </div>
          {presenters.length === 0 && <p className="text-muted-foreground text-sm">{t.mediaLibrary.presenterEmpty}</p>}
          {presenters.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {presenters.map((m, i) => (
                <Card key={m.id}>
                  <CardContent className="flex flex-col gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/media/${m.id}`} alt={m.title} className="aspect-[3/4] w-full rounded-md object-cover" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{m.title}</span>
                      {i === 0 && <Badge variant="secondary">{t.mediaLibrary.presenterDefault}</Badge>}
                    </div>
                    <DeleteMediaButton id={m.id} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Card>
            <CardContent>
              <PresenterUpload />
            </CardContent>
          </Card>
        </section>

        <p className="text-muted-foreground text-sm">
          {t.mediaLibrary.intro} {items.length > 0 && t.mediaLibrary.totalSize(formatBytes(total))}
        </p>
        {items.filter((m) => !isPresenter(m)).length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">{t.mediaLibrary.empty}</p>}
        {items.filter((m) => !isPresenter(m)).map((m) => (
          <Card key={m.id} id={m.id}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.title}</span>
                <Badge variant="secondary">{kindLabel[m.kind]}</Badge>
                <span className="text-muted-foreground text-xs">
                  {formatDateTime(m.createdAt)}
                  {m.bytes ? ` · ${formatBytes(m.bytes)}` : ""}
                </span>
              </div>
              <MediaPreview id={m.id} kind={m.kind} status={m.status} title={m.title} />
              {m.error && <p className="text-destructive text-xs break-words">{m.error}</p>}
              {m.prompt && (
                <details className="text-sm">
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    {m.kind === "image" ? t.mediaLibrary.prompt : t.mediaLibrary.script}
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap">{m.prompt}</p>
                </details>
              )}
              <div className="-mb-2 flex justify-end">
                <DeleteMediaButton id={m.id} />
              </div>
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  );
}
