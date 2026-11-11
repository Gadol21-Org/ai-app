/**
 * What the app does when something needs a person's decision while nobody is looking at the
 * screen (today: a scheduled run that reaches a tool needing approval).
 *
 * Only the interface and a no-op implementation exist. To add push notifications, implement
 * `Notifier` (Web Push, ntfy, Telegram, ...) and call `setNotifier()` once at startup (see
 * instrumentation.ts). Callers never change.
 */
export type PendingApprovalNotice = {
  approvalId: string;
  /** What is waiting: e.g. the scheduled prompt's title. */
  title: string;
  toolName: string;
  /** Where in the app the person decides. */
  url: string;
};

export interface Notifier {
  /** Must not throw into the caller; the pending approval is already saved when this runs. */
  notifyPendingApproval(notice: PendingApprovalNotice): Promise<void>;
}

/** Does nothing: approvals just wait in the database until someone opens the app. */
export const noopNotifier: Notifier = {
  async notifyPendingApproval() {},
};

const globalForNotifier = globalThis as unknown as { __notifier?: Notifier };

export function setNotifier(notifier: Notifier) {
  globalForNotifier.__notifier = notifier;
}

export function getNotifier(): Notifier {
  return globalForNotifier.__notifier ?? noopNotifier;
}
