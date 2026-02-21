import { readOpenClawConfig } from "@/lib/paths";

type ToolsInvokeRequest = {
  tool: string;
  action?: string;
  args?: Record<string, unknown>;
  sessionKey?: string;
  dryRun?: boolean;
};

type ToolsInvokeResponse = {
  ok: boolean;
  result?: unknown;
  error?: { message?: string } | string;
};

type GatewayConfigGetResult = {
  path: string;
  exists: boolean;
  raw: string;
  hash: string;
};

type ToolTextEnvelope = {
  ok: boolean;
  result: GatewayConfigGetResult;
};

async function getGatewayBaseUrlAndToken() {
  // ClawKitchen runs in-process with the OpenClaw Gateway (as a plugin), so we can read
  // the gateway port/token from the loaded config.
  const cfg = await readOpenClawConfig();
  const port = cfg.gateway?.port ?? 18789;
  const token = cfg.gateway?.auth?.token;
  if (!token) throw new Error("Missing gateway token (gateway.auth.token in ~/.openclaw/openclaw.json)");

  const baseUrl = `http://127.0.0.1:${port}`;
  return { baseUrl, token };
}

export async function toolsInvoke<T = unknown>(req: ToolsInvokeRequest): Promise<T> {
  const { baseUrl, token } = await getGatewayBaseUrlAndToken();

  const res = await fetch(`${baseUrl}/tools/invoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });

  const json = (await res.json()) as ToolsInvokeResponse;
  if (!res.ok || !json.ok) {
    const msg =
      (typeof json.error === "object" && json.error?.message) ||
      (typeof json.error === "string" ? json.error : null) ||
      `tools/invoke failed (${res.status})`;
    throw new Error(msg);
  }

  return json.result as T;
}

export async function gatewayConfigGet(): Promise<{ raw: string; hash: string }> {
  const toolResult = await toolsInvoke<{ content: Array<{ type: string; text?: string }> }>({
    tool: "gateway",
    args: { action: "config.get", raw: "{}" },
  });

  const text = toolResult?.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("gateway config.get: missing text payload");

  const parsed = JSON.parse(text) as ToolTextEnvelope;
  const raw = String(parsed?.result?.raw ?? "");
  const hash = String(parsed?.result?.hash ?? "");
  if (!raw) throw new Error("gateway config.get: missing result.raw");
  if (!hash) throw new Error("gateway config.get: missing result.hash");
  return { raw, hash };
}

export async function gatewayConfigPatch(patch: unknown, note?: string) {
  const { hash } = await gatewayConfigGet();
  const raw = JSON.stringify(patch, null, 2);

  return toolsInvoke({
    tool: "gateway",
    args: {
      action: "config.patch",
      raw,
      baseHash: hash,
      note: note ?? "ClawKitchen settings update",
      restartDelayMs: 1000,
    },
  });
}
