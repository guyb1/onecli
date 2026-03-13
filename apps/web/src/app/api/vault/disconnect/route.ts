import { NextResponse } from "next/server";
import { db } from "@onecli/db";
import { getServerSession } from "@/lib/auth/server";
import { getProxyBaseUrl, getProxySecret } from "@/lib/proxy-secret";

export async function DELETE() {
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

    // Forward disconnect to proxy
    const proxySecret = getProxySecret();
    const proxyUrl = `${getProxyBaseUrl()}/api/remote/pair`;

    try {
      await fetch(proxyUrl, {
        method: "DELETE",
        headers: proxySecret ? { "x-proxy-secret": proxySecret } : {},
      });
    } catch {
      // Proxy unreachable — still remove DB record
    }

    // Remove DB record
    await db.vaultConnection.deleteMany({
      where: { userId: user.id },
    });

    return NextResponse.json({ status: "disconnected" });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
