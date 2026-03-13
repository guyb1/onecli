import { NextRequest, NextResponse } from "next/server";
import { db } from "@onecli/db";
import { z } from "zod";
import { getServerSession } from "@/lib/auth/server";
import { getProxyBaseUrl, getProxySecret } from "@/lib/proxy-secret";

const pairSchema = z.object({
  psk_hex: z.string().length(64, "PSK must be 64 hex characters"),
  fingerprint_hex: z
    .string()
    .length(64, "Fingerprint must be 64 hex characters"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = pairSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    // Forward to proxy's remote access pairing endpoint
    const proxySecret = getProxySecret();
    const proxyUrl = `${getProxyBaseUrl()}/api/remote/pair/psk`;

    const proxyResp = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(proxySecret ? { "x-proxy-secret": proxySecret } : {}),
      },
      body: JSON.stringify({
        psk_hex: parsed.data.psk_hex,
        fingerprint_hex: parsed.data.fingerprint_hex,
      }),
    });

    if (!proxyResp.ok) {
      const error = await proxyResp.text();
      return NextResponse.json(
        { error: `Proxy pairing failed: ${error}` },
        { status: proxyResp.status },
      );
    }

    // Store vault connection in database
    const user = await db.user.findUnique({
      where: { externalAuthId: session.id },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await db.vaultConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fingerprint: parsed.data.fingerprint_hex,
        status: "paired",
        lastConnectedAt: new Date(),
      },
      update: {
        fingerprint: parsed.data.fingerprint_hex,
        status: "paired",
        lastConnectedAt: new Date(),
      },
    });

    return NextResponse.json({ status: "paired" });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
