import { NextResponse } from "next/server";
import { seedDb } from "@pa-os/db";

export const runtime = "nodejs";

export async function POST() {
  const result = await seedDb();
  return NextResponse.json({ ok: true, result });
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST /api/db/seed to seed the database." },
    { status: 405 },
  );
}


