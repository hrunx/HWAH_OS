import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}


