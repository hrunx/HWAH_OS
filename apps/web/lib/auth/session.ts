import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "paos_session";

export type SessionPayload = {
  personId: string;
  companyId: string;
};

function getSessionSecret(): Uint8Array | null {
  const key = process.env.TOKEN_ENC_KEY;
  if (!key) return null;
  // For auth signing we can treat the string itself as the HMAC secret.
  return new TextEncoder().encode(key);
}

export async function createSessionToken(payload: SessionPayload) {
  const secret = getSessionSecret();
  if (!secret) throw new Error("TOKEN_ENC_KEY is required to sign sessions");

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const personId = payload.personId;
    const companyId = payload.companyId;
    if (typeof personId !== "string" || typeof companyId !== "string") return null;
    return { personId, companyId };
  } catch {
    return null;
  }
}


