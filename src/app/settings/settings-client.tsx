"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";

type Mode = "off" | "prompt" | "on";

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("prompt");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch("/api/settings/cron-installation", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load config");
        const v = String(json.value || "").trim();
        if (v === "off" || v === "prompt" || v === "on") setMode(v);
        else setMode("prompt");
      } catch (e: unknown) {
        setMsg(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(next: Mode) {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings/cron-installation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setMode(next);
      setMsg("Saved.");
    } catch (e: unknown) {
      setMsg(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const Option = ({ value, title, help }: { value: Mode; title: string; help: string }) => (
    <button
      type="button"
      onClick={() => save(value)}
      disabled={loading || saving}
      className={`ck-glass w-full text-left px-4 py-3 transition-colors hover:bg-white/10 ${
        mode === value ? "border-[color:var(--ck-accent-red)]" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-medium">{title}</div>
        {mode === value ? (
          <div className="text-xs font-medium text-[color:var(--ck-accent-red)]">Selected</div>
        ) : null}
      </div>
      <div className="mt-1 text-sm text-[color:var(--ck-text-secondary)]">{help}</div>
    </button>
  );

  return (
    <div className="space-y-3">
      <Option value="off" title="Off" help="Never install or reconcile recipe-defined cron jobs." />
      <Option
        value="prompt"
        title="Prompt (default)"
        help="Ask at scaffold time. Default answer should be No; jobs are installed disabled unless you opt in."
      />
      <Option value="on" title="On" help="Install/reconcile jobs during scaffold (enabledByDefault controls new jobs)." />

      {msg ? (
        <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3 text-sm">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
