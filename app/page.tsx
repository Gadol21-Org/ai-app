import { scheduleTimezone } from "@/lib/schedules/timing";
import { Assistant } from "./assistant";

// Read per request: the time zone comes from the SCHEDULE_TIMEZONE env var at runtime.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Assistant timezone={scheduleTimezone()} />;
}
