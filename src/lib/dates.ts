import { connection } from "next/server";

/** Her business runs on Las Vegas time; the server runs on UTC. */
export const APP_TIME_ZONE = "America/Los_Angeles";

/** Today's date (YYYY-MM-DD) in her time zone. Marks the render as request-time. */
export async function todayIso(): Promise<string> {
  await connection();
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
}
