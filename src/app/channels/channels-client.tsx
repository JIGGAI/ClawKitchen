"use client";

import { useEffect, useMemo, useState } from "react";

type ChannelConfig = Record<string, unknown>;

type ChannelsResponse = {
  ok: boolean;
  channels?: Record<string, unknown>;
  error?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

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
  const base =
    "rounded-[var(--ck-radius-sm)] px-3 py-2 text-sm font-medium transition disabled:opacity-50 " +
    (kind === "primary"
      ? "bg-[var(--ck-accent-red)] text-white"
      : kind === "danger"
        ? "border border-red-400/40 text-red-200 hover:bg-red-500/10"
        : "border border-[color:var(--ck-border-subtle)] hover:bg-[color:var(--ck-bg-glass)]");
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

  async function fetchBindings(): Promise<{ ok: true; channels: Record<string, unknown> } | { ok: false; error: string }> {
    const res = await fetch("/api/channels/bindings", { cache: "no-store" });
    const data = (await res.json()) as ChannelsResponse;
    if (!res.ok || !data?.ok) {
      return { ok: false, error: String(data?.error ?? `Failed to load channels (${res.status})`) };
    }
    const ch = isRecord(data.channels) ? data.channels : {};
    return { ok: true, channels: ch };
  }

  async function refresh() {
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
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setChannels({});
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    const res = await fetch("/api/channels/bindings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: provider.trim(), config: parsed }),
    });
    const data = (await res.json()) as ChannelsResponse;
    if (!res.ok || !data?.ok) {
      setError(String(data?.error ?? "Failed to save"));
      setSaving(false);
      return;
    }

    await refresh();
    setSaving(false);
  }

  async function remove(p: string) {
    const ok = window.confirm(`Delete channel binding "${p}"?`);
    if (!ok) return;

    setSaving(true);
    setError(null);

    const res = await fetch("/api/channels/bindings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: p }),
    });
    const data = (await res.json()) as ChannelsResponse;
    if (!res.ok || !data?.ok) {
      setError(String(data?.error ?? "Failed to delete"));
      setSaving(false);
      return;
    }

    await refresh();
    setSaving(false);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
          <p className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">
            Source of truth: OpenClaw gateway config (patched via <code className="font-mono">gateway config.patch</code>).
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

      {error ? <div className="ck-glass p-4 text-sm text-red-300">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="ck-glass p-4">
          <div className="text-sm font-medium">Bindings</div>
          {loading ? (
            <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">Loading…</div>
          ) : providers.length === 0 ? (
            <div className="mt-3 text-sm text-[color:var(--ck-text-secondary)]">No bindings configured.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {providers.map((p) => (
                <button
                  key={p}
                  className={
                    "flex w-full items-center justify-between rounded-[var(--ck-radius-sm)] border px-3 py-2 text-left text-sm " +
                    (p === provider
                      ? "border-[var(--ck-accent-red)] bg-[color:var(--ck-bg-glass)]"
                      : "border-[color:var(--ck-border-subtle)] hover:bg-[color:var(--ck-bg-glass)]")
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

        <div className="ck-glass p-4 lg:col-span-2">
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
              className="mt-2 h-[420px] w-full rounded-[var(--ck-radius-sm)] border border-[color:var(--ck-border-subtle)] bg-transparent px-3 py-2 font-mono text-sm"
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
