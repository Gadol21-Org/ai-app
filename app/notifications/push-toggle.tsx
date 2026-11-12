"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type State =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "off"
  | "on";

const toKey = (base64Url: string) => {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Subscribes this device to Web Push. The subscription's keys let the server encrypt for this device only. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        return setState("unsupported");
      }
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      if (!key) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        return setState(permission === "denied" ? "denied" : "off");
      const { key } = await fetch("/api/push/key").then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(key),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(false);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    await fetch("/api/push/test", { method: "POST" });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }

  const message: Partial<Record<State, string>> = {
    unsupported: t.notifications.pushUnsupported,
    unconfigured: t.notifications.pushNotConfigured,
    denied: t.notifications.pushDenied,
    on: t.notifications.pushOn,
    off: t.notifications.pushOff,
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-medium">{t.notifications.pushTitle}</h2>
        <p className="text-muted-foreground text-sm">
          {t.notifications.pushDesc}
        </p>
      </div>
      {state !== "loading" && <p className="text-sm">{message[state]}</p>}
      {error && (
        <p className="text-destructive text-sm">{t.notifications.pushError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "off" && (
          <Button onClick={enable} disabled={busy}>
            <BellRing /> {t.notifications.pushEnable}
          </Button>
        )}
        {state === "on" && (
          <>
            <Button variant="outline" onClick={disable} disabled={busy}>
              <BellOff /> {t.notifications.pushDisable}
            </Button>
            <Button variant="secondary" onClick={sendTest}>
              {testSent ? t.users.saved : t.notifications.pushTest}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
