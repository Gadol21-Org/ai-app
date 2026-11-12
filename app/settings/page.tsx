import { ArrowRight, Bell, CalendarClock, ChevronLeft, Clapperboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser, displayName } from "@/lib/auth";
import { listUsers } from "@/lib/users";
import { formatRelative } from "@/lib/relative-time";
import { t, formatNumber } from "@/lib/i18n";
import { formatBytes, formatCount, formatDay, formatUsd } from "@/lib/format";
import { getChatModelId } from "@/lib/models";
import { CHAT_MODEL_OPTIONS } from "@/lib/model-catalog";
import { currentPrice } from "@/lib/pricing";
import { retentionDays } from "@/lib/retention";
import { getConversationSizes, getDatabaseSize } from "@/lib/storage";
import { UserNameForm } from "./users/user-name-form";
import { getSpendSummary, type SpendTotals } from "@/lib/usage";

export const metadata: Metadata = { title: `${t.settings.pageTitle} · ${t.appName}` };
// Always read fresh numbers from the database.
export const dynamic = "force-dynamic";

function SpendCard({ label, hint, totals }: { label: string; hint: string; totals: SpendTotals }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{formatUsd(totals.costUsd)}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {formatCount(totals.inputTokens)} {t.settings.tokensIn} · {formatCount(totals.outputTokens)} {t.settings.tokensOut} ·{" "}
        {formatCount(totals.calls)} {t.settings.modelCalls}
        <div className="mt-1 text-xs">{hint}</div>
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const [{ allTime, last30Days, byConversation, byModel, byUser }, db, sizes, me, users] = await Promise.all([
    getSpendSummary(),
    getDatabaseSize(),
    getConversationSizes(),
    getCurrentUser(),
    listUsers(),
  ]);

  return (
    <div className="app-shell overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.settings.backToChat}
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowRight />
        </Button>
        <h1 className="text-sm font-medium">{t.settings.pageTitle}</h1>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Link
          href="/settings/schedules"
          className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
        >
          <CalendarClock className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.schedule.pageTitle}</div>
            <div className="text-muted-foreground text-sm">
              {t.settings.scheduledLinkDesc}
            </div>
          </div>
          <ChevronLeft className="text-muted-foreground size-4 shrink-0" />
        </Link>

        <Link
          href="/settings/media"
          className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
        >
          <Clapperboard className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.mediaLibrary.pageTitle}</div>
            <div className="text-muted-foreground text-sm">{t.mediaLibrary.linkDesc}</div>
          </div>
          <ChevronLeft className="text-muted-foreground size-4 shrink-0" />
        </Link>

        <Link
          href="/notifications"
          className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
        >
          <Bell className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.notifications.pageTitle}</div>
            <div className="text-muted-foreground text-sm">{t.notifications.settingsLinkDesc}</div>
          </div>
          <ChevronLeft className="text-muted-foreground size-4 shrink-0" />
        </Link>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.users.title}</h2>
            <p className="text-muted-foreground text-sm">{t.users.desc}</p>
          </div>
          <div className="flex flex-col gap-3">
            {users.map((u) => (
              <Card key={u.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{displayName(u)}</span>
                    {u.id === me?.id && <Badge variant="secondary">{t.users.you}</Badge>}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    <span dir="ltr" className="inline-block">{u.email}</span> · {t.users.lastSeen(formatRelative(u.lastSeenAt))}
                  </div>
                  <UserNameForm id={u.id} email={u.email} name={u.name} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.settings.spend}</h2>
            <p className="text-muted-foreground text-sm">
              {t.settings.spendDesc}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SpendCard label={t.settings.last30} hint={t.settings.last30Hint} totals={last30Days} />
            <SpendCard label={t.settings.allTime} hint={t.settings.allTimeHint} totals={allTime} />
          </div>
        </section>

        {users.length > 1 && byUser.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t.users.spendByUser}</h2>
            <div className="rounded-lg border">
              <Table>
                <TableBody>
                  {byUser.map((u) => (
                    <TableRow key={u.userId ?? "none"}>
                      <TableCell>{u.email ? displayName({ name: u.name, email: u.email }) : t.users.unknownUser}</TableCell>
                      <TableCell className="text-end font-medium tabular-nums">{formatUsd(u.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.settings.byConversation}</h2>
          {byConversation.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              {t.settings.noSpend}
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.settings.colConversation}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t.settings.colLastUsed}</TableHead>
                    <TableHead className="hidden text-end sm:table-cell">{t.settings.colTokens}</TableHead>
                    <TableHead className="hidden text-end sm:table-cell">{t.settings.colStored}</TableHead>
                    <TableHead className="text-end">{t.settings.colCost}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byConversation.map((c) => (
                    <TableRow key={c.threadId ?? "none"}>
                      <TableCell className="max-w-0 w-full">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{c.title ?? t.settings.untitled}</span>
                          {c.status === "deleted" && <Badge variant="outline">{t.settings.badgeDeleted}</Badge>}
                          {c.status === "archived" && <Badge variant="outline">{t.settings.badgeArchived}</Badge>}
                        </div>
                        <div className="text-muted-foreground text-xs sm:hidden">
                          {formatDay(c.lastUsedAt)} · {formatCount(c.inputTokens + c.outputTokens)} {t.settings.tokensWord} ·{" "}
                          {c.threadId && sizes.has(c.threadId)
                            ? formatBytes(sizes.get(c.threadId)!.bytes)
                            : t.settings.noStored}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {formatDay(c.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-end tabular-nums sm:table-cell">
                        {formatCount(c.inputTokens + c.outputTokens)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-end tabular-nums sm:table-cell">
                        {c.threadId && sizes.has(c.threadId)
                          ? formatBytes(sizes.get(c.threadId)!.bytes)
                          : "–"}
                      </TableCell>
                      <TableCell className="text-end font-medium tabular-nums">
                        {formatUsd(c.costUsd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.settings.dbSize}</h2>
            <p className="text-muted-foreground text-sm">
              {t.settings.dbSizeDesc}
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardDescription>{t.settings.dbThisApp}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{formatBytes(db.totalBytes)}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm tabular-nums">
              {formatNumber(db.totalBytes)} {t.settings.bytes}
            </CardContent>
          </Card>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.settings.colTable}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.settings.colRows}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.settings.colData}</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">{t.settings.colIndexes}</TableHead>
                  <TableHead className="text-end">{t.settings.colTotal}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {db.tables.map((tbl) => (
                  <TableRow key={tbl.table}>
                    <TableCell className="font-mono text-xs">{tbl.table}</TableCell>
                    <TableCell className="text-muted-foreground hidden text-end tabular-nums sm:table-cell">
                      {formatNumber(tbl.rows)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-end tabular-nums sm:table-cell">
                      {formatBytes(tbl.dataBytes)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-end tabular-nums sm:table-cell">
                      {formatBytes(tbl.indexBytes)}
                    </TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {formatBytes(tbl.dataBytes + tbl.indexBytes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground text-xs">
            {t.settings.dbNote}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.settings.modelAndStorage}</h2>
          <div className="rounded-lg border">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">{t.settings.inUse}</TableCell>
                  <TableCell className="text-end font-mono text-xs">{getChatModelId()}</TableCell>
                </TableRow>
                {CHAT_MODEL_OPTIONS.map((m) => {
                  const price = currentPrice(m.id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground">
                        {t.settings.availableModels}
                        <div className="font-mono text-xs">{m.id}</div>
                      </TableCell>
                      <TableCell className="text-end text-xs">
                        {m.label}
                        {price ? (
                          <div className="text-muted-foreground">
                            {t.settings.priceLine(formatUsd(price.input), formatUsd(price.output))}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell className="text-muted-foreground">{t.settings.keptFor}</TableCell>
                  <TableCell className="text-end">
                    {retentionDays() === 0
                      ? t.settings.forever
                      : t.settings.retentionDays(retentionDays())}
                  </TableCell>
                </TableRow>
                {byModel.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="text-muted-foreground">
                      {t.settings.spentOn} <span className="font-mono text-xs">{m.model}</span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatUsd(m.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
}
