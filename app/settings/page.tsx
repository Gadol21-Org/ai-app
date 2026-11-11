import { ArrowLeft } from "lucide-react";
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
import { formatCount, formatDay, formatUsd } from "@/lib/format";
import { getChatModelId } from "@/lib/models";
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
  const { allTime, last30Days, byConversation, byModel } = await getSpendSummary();

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
                          {formatDay(c.lastUsedAt)} · {formatCount(c.inputTokens + c.outputTokens)} tokens
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {formatDay(c.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                        {formatCount(c.inputTokens + c.outputTokens)}
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
          <h2 className="text-lg font-semibold">Model</h2>
          <div className="rounded-lg border">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-muted-foreground">In use now</TableCell>
                  <TableCell className="text-right font-mono text-xs">{getChatModelId()}</TableCell>
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
