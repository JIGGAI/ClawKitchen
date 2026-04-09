"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { fetchJson } from "@/lib/fetch-json";
import { isRecord } from "@/lib/type-guards";

type ChannelConfig = Record<string, unknown>;

type ChannelsResponse = {
  ok: boolean;
  channels?: Record<string, unknown>;
  error?: string;
};

function Button({
  children,
  onClick,
  kind,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  kind?: "primary" | "danger";
  disabled?: boolean;
}) {
  let base = "rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ";
  if (kind === "primary") base += "bg-[var(--ck-accent-red)] text-white";
  else if (kind === "danger")
    base +=
      "border border-[color:rgba(255,59,48,0.45)] bg-[color:rgba(255,59,48,0.08)] text-[color:var(--ck-accent-red)] hover:bg-[color:rgba(255,59,48,0.12)]";
  else base += "border border-[color:var(--ck-border-subtle)] hover:bg-white/5";
  return (
    <button className={base} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function ChannelsClient() {
  const [channels, setChannels] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<string>("telegram");
  const [configJson, setConfigJson] = useState<string>("{\n  \"enabled\": true\n}\n");
  const [saving, setSaving] = useState(false);

  const [deleteProvider, setDeleteProvider] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState<string>("");

  const isGatewayToolNotAvailable = useMemo(() => {
    const msg = String(error ?? "");
    return /Tool not available:\s*gateway/i.test(msg);
  }, [error]);

  async function fetchBindings(): Promise<{ ok: true; channels: Record<string, unknown> } | { ok: false; error: string }> {
    try {
      const data = await fetchJson<ChannelsResponse>("/api/channels/bindings", { cache: "no-store" });
      const ch = isRecord(data.channels) ? data.channels : {};
      return { ok: true, channels: ch };
    } catch (e: unknown) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBindings();
      if (!result.ok) {
        setError(result.error);
        setChannels({});
        setLoading(false);
        return;
      }
      setChannels(result.channels);
      setLoading(false);
    } catch (e: unknown) {
      const msg = errorMessage(e);
      setError(msg);
      setChannels({});
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const providers = useMemo(() => {
    const keys = Object.keys(channels);
    keys.sort();
    return keys.filter((k) => channels[k] != null);
  }, [channels]);

  function selectProvider(p: string) {
    setProvider(p);
    const cfg = channels[p];
    setConfigJson(JSON.stringify(cfg ?? {}, null, 2) + "\n");
  }

  async function mutate(
    method: "PUT" | "DELETE",
    body: { provider: string; config?: Record<string, unknown>; confirm?: string }
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const data = await fetchJson<ChannelsResponse>("/api/channels/bindings", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!data?.ok) return { ok: false, error: String(data?.error ?? `Failed to ${method === "PUT" ? "save" : "delete"}`) };
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  async function upsert() {
    setSaving(true);
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      setError("Config must be valid JSON");
      setSaving(false);
      return;
    }
    if (!isRecord(parsed)) {
      setError("Config must be a JSON object");
      setSaving(false);
      return;
    }

    const result = await mutate("PUT", { provider: provider.trim(), config: parsed });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    await refresh();
    setSaving(false);
  }


  async function remove(p: string) {
    const expected = String(p ?? "").trim();
    if (!expected) return;

    // Avoid browser-native dialogs (prompt/confirm) since they can be blocked or unreliable
    // in some environments (e.g., embedded webviews). Use an in-app typed-confirm modal instead.
    setDeleteProvider(expected);
    setDeleteTyped("");
  }

  async function confirmDelete() {
    const expected = String(deleteProvider ?? "").trim();
    if (!expected) return;

    const confirm = String(deleteTyped ?? "").trim();
    if (confirm !== expected) return;

    setSaving(true);
    setError(null);

    const result = await mutate("DELETE", { provider: expected, confirm });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    setDeleteProvider(null);
    setDeleteTyped("");
    await refresh();
    setSaving(false);
  }

  function cancelDelete() {
    setDeleteProvider(null);
    setDeleteTyped("");
  }

  function addBinding() {
    const p = window.prompt("Provider id (e.g. telegram)", "telegram");
    const next = String(p ?? "").trim();
    if (!next) return;
    setProvider(next);
    setConfigJson("{\n  \"enabled\": true\n}\n");
  }

  const selectedConfig = useMemo(() => {
    const v = channels[provider];
    return isRecord(v) ? (v as ChannelConfig) : null;
  }, [channels, provider]);

  return (
    <div className="space-y-6">
      {deleteProvider ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="ck-card w-full max-w-lg border border-[color:var(--ck-border-subtle)] p-4">
            <div className="text-sm font-medium text-red-200">Confirm destructive delete</div>
            <div className="mt-2 text-sm text-[color:var(--ck-text-secondary)]">
              This will <span className="font-medium text-red-200">DELETE</span> the channel binding
              <span className="mx-1 font-mono">{deleteProvider}</span>
              from <span className="font-mono">~/.openclaw/openclaw.json</span>.
            </div>
            <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
              Type <code className="font-mono">{deleteProvider}</code> to confirm.
            </div>
            <input
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm"
              placeholder={deleteProvider}
              autoFocus
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button onClick={cancelDelete} disabled={saving}>
                Cancel
              </Button>
              <Button kind="danger" onClick={() => void confirmDelete()} disabled={saving || deleteTyped.trim() != deleteProvider}>
                {saving ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            Source of truth: <code className="font-mono">~/.openclaw/openclaw.json</code>.
            This page intentionally avoids calling the Gateway tool.
            Some changes may require a gateway restart depending on provider.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void refresh()} disabled={saving}>
            Refresh
          </Button>
          <Button kind="primary" onClick={addBinding} disabled={saving}>
            Add binding
          </Button>
        </div>
      </div>

      {isGatewayToolNotAvailable ? (
        <div className="ck-card p-4 text-sm">
          <div className="font-medium text-yellow-200">Kitchen looks out of date</div>
          <div className="mt-1 text-[color:var(--ck-text-secondary)]">
            This endpoint used to go through the Gateway tool and would fail on hardened systems. Update the Kitchen plugin
            and restart the gateway to pick up the fix.
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-[color:var(--ck-border-subtle)] bg-white/5 p-3 text-xs">
openclaw plugins update
openclaw gateway restart
          </pre>
          <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
            Last resort (not recommended): temporarily allow the <code className="font-mono">gateway</code> tool.
          </div>
        </div>
      ) : null}

      {error ? <div className="ck-card p-4 text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="ck-card p-4">
          <div className="text-sm font-medium">Bindings</div>
          {loading && <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">Loading…</div>}
          {!loading && providers.length === 0 && (
            <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">No bindings configured.</div>
          )}
          {!loading && providers.length > 0 && (
            <div className="mt-3 space-y-2">
              {providers.map((p) => (
                <button
                  key={p}
                  className={
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm " +
                    (p === provider
                      ? "border-[var(--ck-accent-red)] bg-white/5"
                      : "border-[color:var(--ck-border-subtle)] hover:bg-white/5")
                  }
                  onClick={() => selectProvider(p)}
                >
                  <span className="font-mono">{p}</span>
                  <span className="text-xs text-[color:var(--ck-text-tertiary)]">edit</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ck-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Edit</div>
              <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
                Provider: <code className="font-mono">{provider}</code>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button kind="danger" onClick={() => void remove(provider)} disabled={saving}>
                Delete
              </Button>
              <Button kind="primary" onClick={() => void upsert()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-[color:var(--ck-text-tertiary)]">Config (JSON)</div>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="mt-2 h-[420px] w-full rounded-lg border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm"
              placeholder={"{\n  \"enabled\": true\n}"}
            />
            <div className="mt-2 text-xs text-[color:var(--ck-text-tertiary)]">
              Validation:
              <ul className="list-disc pl-5">
                <li>Telegram requires <code className="font-mono">botToken</code>.</li>
                <li>Other providers can be edited as raw JSON in v1.</li>
              </ul>
            </div>

            {selectedConfig ? (
              <div className="mt-3 text-xs text-[color:var(--ck-text-tertiary)]">
                Current keys: <code className="font-mono">{Object.keys(selectedConfig).join(", ") || "(none)"}</code>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
