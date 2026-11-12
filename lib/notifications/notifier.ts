import "server-only";
import type { Notifier } from "@/lib/approvals/notifier";
import { t } from "@/lib/i18n";
import { sendNotification } from "./service";

/** The hook the scheduled-prompts feature left: a run waiting for approval notifies everyone. */
export const pushNotifier: Notifier = {
  async notifyPendingApproval({ title, url }) {
    await sendNotification({
      title: t.notifications.approvalTitle,
      body: t.notifications.approvalBody(title),
      url,
    });
  },
};
