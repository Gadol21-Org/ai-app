import { listScheduleToolGroups } from "@/lib/tools";

/** The tool groups a scheduled prompt can enable, for the add-schedule approval card. */
export async function GET() {
  return Response.json(listScheduleToolGroups());
}
