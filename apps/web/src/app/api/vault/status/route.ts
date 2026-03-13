import { NextResponse } from "next/server";
import { db } from "@onecli/db";
import { getServerSession } from "@/lib/auth/server";
import { getProxyBaseUrl, getProxySecret } from "@/lib/proxy-secret";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { externalAuthId: session.id },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get local DB record
    const connection = await db.vaultConnection.findUnique({
      where: { userId: user.id },
      select: {
        fingerprint: true,
        name: true,
        status: true,
        lastConnectedAt: true,
        createdAt: true,
      },
    });

    // Get live status from proxy
    const proxySecret = getProxySecret();
    const proxyUrl = `${getProxyBaseUrl()}/api/remote/status`;

    let proxyStatus = null;
    try {
      const proxyResp = await fetch(proxyUrl, {
        headers: proxySecret ? { "x-proxy-secret": proxySecret } : {},
      });
      if (proxyResp.ok) {
        proxyStatus = await proxyResp.json();
      }
    } catch {
      // Proxy unreachable — return DB-only status
    }

    return NextResponse.json({
      connection,
      proxy: proxyStatus,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
