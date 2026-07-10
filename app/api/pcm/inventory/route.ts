import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
import { fetchRenewalInventory } from "@pcm/_lib/inventory.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pcm/inventory?branch=<code>
// Renewal students who paid within 3 days of their session — the gift list.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const branch = new URL(req.url).searchParams.get("branch");
    const items = await fetchRenewalInventory(branch);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[/api/pcm/inventory] failed:", err);
    return NextResponse.json({ error: "Failed to load inventory" }, { status: 500 });
  }
}
