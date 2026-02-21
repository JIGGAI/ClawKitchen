// NOTE: This file is compiled by Next.js.
// Do not import `openclaw/plugin-sdk` here (it is provided by the gateway runtime, not as an npm dep).

type KitchenApi = {
  config: unknown;
  runtime: {
    system: { runCommandWithTimeout: (argv: string[], opts: { timeoutMs: number }) => Promise<{ stdout?: string; stderr?: string }> };
  };
};

export function getKitchenApi(): KitchenApi {
  const api = (globalThis as unknown as { __clawkitchen_api?: KitchenApi }).__clawkitchen_api;
  if (!api) {
    throw new Error(
      "ClawKitchen: OpenClaw plugin API not available. (This should only happen if Kitchen is started outside the gateway process.)",
    );
  }
  return api;
}
