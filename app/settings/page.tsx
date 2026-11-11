import { ArrowLeft, CalendarClock, ChevronRight } from "lucide-react";
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
import { formatBytes, formatCount, formatDay, formatUsd } from "@/lib/format";
import { getChatModelId } from "@/lib/models";
import { retentionDays } from "@/lib/retention";
import { getConversationSizes, getDatabaseSize } from "@/lib/storage";
import { getSpendSummary, type SpendTotals } from "@/lib/usage";

export const metadata: Metadata = { title: "Settings · Family AI" };
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
        {formatCount(totals.inputTokens)} tokens in · {formatCount(totals.outputTokens)} out ·{" "}
        {formatCount(totals.calls)} model calls
        <div className="mt-1 text-xs">{hint}</div>
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const [{ allTime, last30Days, byConversation, byModel }, db, sizes] = await Promise.all([
    getSpendSummary(),
    getDatabaseSize(),
    getConversationSizes(),
  ]);

  return (
    <div className="h-dvh overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to chat"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-sm font-medium">Settings</h1>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Link
          href="/settings/schedules"
          className="hover:bg-muted/50 flex items-center gap-3 rounded-lg border p-4 transition-colors"
        >
          <CalendarClock className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Scheduled prompts</div>
            <div className="text-muted-foreground text-sm">
              Prompts the assistant runs on its own, once or on a repeat.
            </div>
          </div>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        </Link>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Spend</h2>
            <p className="text-muted-foreground text-sm">
              Estimated from token counts and the model&apos;s list price. Your Google bill is the
              source of truth.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SpendCard label="Last 30 days" hint="Rolling window ending now" totals={last30Days} />
            <SpendCard label="All time" hint="Since the first recorded message" totals={allTime} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">By conversation</h2>
          {byConversation.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No spend yet. Costs appear here after the first reply.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conversation</TableHead>
                    <TableHead className="hidden sm:table-cell">Last used</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Tokens</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Stored</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byConversation.map((c) => (
                    <TableRow key={c.threadId ?? "none"}>
                      <TableCell className="max-w-0 w-full">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{c.title ?? "Untitled conversation"}</span>
                          {c.status === "deleted" && <Badge variant="outline">Deleted</Badge>}
                          {c.status === "archived" && <Badge variant="outline">Archived</Badge>}
                        </div>
                        <div className="text-muted-foreground text-xs sm:hidden">
                          {formatDay(c.lastUsedAt)} · {formatCount(c.inputTokens + c.outputTokens)} tokens ·{" "}
                          {c.threadId && sizes.has(c.threadId)
                            ? formatBytes(sizes.get(c.threadId)!.bytes)
                            : "no stored messages"}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {formatDay(c.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                        {formatCount(c.inputTokens + c.outputTokens)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                        {c.threadId && sizes.has(c.threadId)
                          ? formatBytes(sizes.get(c.threadId)!.bytes)
                          : "–"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
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
            <h2 className="text-lg font-semibold">Database size</h2>
            <p className="text-muted-foreground text-sm">
              Read live from MySQL: data plus indexes of this app&apos;s tables. The free instance&apos;s
              50 GiB is shared with other apps, and backups are not counted here.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardDescription>This app&apos;s database</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{formatBytes(db.totalBytes)}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm tabular-nums">
              {db.totalBytes.toLocaleString("en-US")} bytes
            </CardContent>
          </Card>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Rows</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Data</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Indexes</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {db.tables.map((t) => (
                  <TableRow key={t.table}>
                    <TableCell className="font-mono text-xs">{t.table}</TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {t.rows.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {formatBytes(t.dataBytes)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {formatBytes(t.indexBytes)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatBytes(t.dataBytes + t.indexBytes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground text-xs">
            The &quot;Stored&quot; column above is the size of each conversation&apos;s message content.
            MySQL allocates space in 16 KB pages, so each table takes at least 16 KB and small
            changes show up in steps. Row counts are MySQL&apos;s own approximation; the sizes are exact.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Model and storage</h2>
          <div className="rounded-lg border">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">In use now</TableCell>
                  <TableCell className="text-right font-mono text-xs">{getChatModelId()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Conversations kept for</TableCell>
                  <TableCell className="text-right">
                    {retentionDays() === 0
                      ? "Forever"
                      : `${retentionDays()} days after the last message`}
                  </TableCell>
                </TableRow>
                {byModel.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="text-muted-foreground">
                      Spent on <span className="font-mono text-xs">{m.model}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(m.costUsd)}</TableCell>
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
