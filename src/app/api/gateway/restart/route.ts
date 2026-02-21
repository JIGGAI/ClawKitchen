import { NextResponse } from "next/server";
import { runOpenClaw } from "@/lib/openclaw";

export async function POST() {
  try {
    // NOTE: Kitchen runs inside the OpenClaw gateway process.
    // If we synchronously restart the gateway while holding an HTTP request open, the browser
    // can see a client-side exception / aborted fetch.
    //
    // Schedule the restart and respond immediately.
    setTimeout(() => {
      void runOpenClaw(["gateway", "restart"]);
    }, 50);

    return NextResponse.json({ ok: true, scheduled: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
