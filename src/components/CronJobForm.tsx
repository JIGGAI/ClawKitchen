import React from "react";
import { CronJobFormData } from "@/hooks/useCronJobForm";

interface CronJobFormProps {
  formData: CronJobFormData;
  updateField: <K extends keyof CronJobFormData>(field: K, value: CronJobFormData[K]) => void;
}

export function CronJobForm({ formData, updateField }: CronJobFormProps) {
  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Name</span>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
            placeholder="Job name"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Agent ID</span>
          <input
            type="text"
            value={formData.agentId}
            onChange={(e) => updateField("agentId", e.target.value)}
            className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
            placeholder="Agent ID"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Description</span>
        <textarea
          value={formData.description}
          onChange={(e) => updateField("description", e.target.value)}
          className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)] placeholder:text-[color:var(--ck-text-tertiary)]"
          rows={2}
          placeholder="Optional description"
        />
      </label>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={formData.enabled}
          onChange={(e) => updateField("enabled", e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5"
        />
        <label htmlFor="enabled" className="ml-2 text-sm font-medium text-[color:var(--ck-text-primary)]">
          Enabled
        </label>
      </div>

      {/* Schedule */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="font-medium text-[color:var(--ck-text-primary)] mb-3">Schedule</h4>
        
        <label className="block mb-3">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Schedule Type</span>
          <select
            value={formData.scheduleKind}
            onChange={(e) => updateField("scheduleKind", e.target.value as "cron" | "every" | "at")}
            className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          >
            <option value="every">Every (interval)</option>
            <option value="cron">Cron expression</option>
            <option value="at">At specific time</option>
          </select>
        </label>

        {formData.scheduleKind === "every" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Every</span>
              <input
                type="number"
                value={formData.everyValue}
                onChange={(e) => updateField("everyValue", Number(e.target.value))}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                min="1"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Unit</span>
              <select
                value={formData.everyUnit}
                onChange={(e) => updateField("everyUnit", e.target.value as "s" | "m" | "h" | "d")}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              >
                <option value="s">Seconds</option>
                <option value="m">Minutes</option>
                <option value="h">Hours</option>
                <option value="d">Days</option>
              </select>
            </label>
          </div>
        )}

        {formData.scheduleKind === "cron" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Cron Expression</span>
              <input
                type="text"
                value={formData.cronExpr}
                onChange={(e) => updateField("cronExpr", e.target.value)}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                placeholder="0 * * * *"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Timezone (optional)</span>
              <input
                type="text"
                value={formData.timezone}
                onChange={(e) => updateField("timezone", e.target.value)}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                placeholder="UTC"
              />
            </label>
          </div>
        )}

        {formData.scheduleKind === "at" && (
          <label className="block">
            <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">At Time (ISO 8601)</span>
            <input
              type="text"
              value={formData.atValue}
              onChange={(e) => updateField("atValue", e.target.value)}
              className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              placeholder="2024-01-01T00:00:00Z"
            />
          </label>
        )}
      </div>

      {/* Payload */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="font-medium text-[color:var(--ck-text-primary)] mb-3">Payload</h4>
        
        <label className="block mb-3">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Payload Type</span>
          <select
            value={formData.payloadKind}
            onChange={(e) => updateField("payloadKind", e.target.value as "systemEvent" | "agentTurn")}
            className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          >
            <option value="agentTurn">Agent Turn</option>
            <option value="systemEvent">System Event</option>
          </select>
        </label>

        {formData.payloadKind === "systemEvent" ? (
          <label className="block">
            <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Event Text</span>
            <textarea
              value={formData.payloadText}
              onChange={(e) => updateField("payloadText", e.target.value)}
              className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              rows={3}
              placeholder="System event message"
            />
          </label>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Message</span>
              <textarea
                value={formData.payloadMessage}
                onChange={(e) => updateField("payloadMessage", e.target.value)}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                rows={3}
                placeholder="Agent message"
              />
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Model (optional)</span>
                <input
                  type="text"
                  value={formData.payloadModel}
                  onChange={(e) => updateField("payloadModel", e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  placeholder="Model ID"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Thinking (optional)</span>
                <input
                  type="text"
                  value={formData.payloadThinking}
                  onChange={(e) => updateField("payloadThinking", e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  placeholder="Thinking level"
                />
              </label>
            </div>
            
            <label className="block">
              <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Timeout (seconds)</span>
              <input
                type="number"
                value={formData.payloadTimeout}
                onChange={(e) => updateField("payloadTimeout", Number(e.target.value))}
                className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                min="1"
              />
            </label>
          </div>
        )}
      </div>

      {/* Delivery */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="font-medium text-[color:var(--ck-text-primary)] mb-3">Delivery</h4>
        
        <label className="block mb-3">
          <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Delivery Mode</span>
          <select
            value={formData.deliveryMode}
            onChange={(e) => updateField("deliveryMode", e.target.value as "none" | "announce")}
            className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
          >
            <option value="none">None</option>
            <option value="announce">Announce</option>
          </select>
        </label>

        {formData.deliveryMode === "announce" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Channel (optional)</span>
                <input
                  type="text"
                  value={formData.deliveryChannel}
                  onChange={(e) => updateField("deliveryChannel", e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  placeholder="Channel ID"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">To (optional)</span>
                <input
                  type="text"
                  value={formData.deliveryTo}
                  onChange={(e) => updateField("deliveryTo", e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
                  placeholder="Target"
                />
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="bestEffort"
                checked={formData.deliveryBestEffort}
                onChange={(e) => updateField("deliveryBestEffort", e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/5"
              />
              <label htmlFor="bestEffort" className="ml-2 text-sm text-[color:var(--ck-text-primary)]">
                Best effort delivery
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Advanced */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="font-medium text-[color:var(--ck-text-primary)] mb-3">Advanced</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Session Target (optional)</span>
            <input
              type="text"
              value={formData.sessionTarget}
              onChange={(e) => updateField("sessionTarget", e.target.value)}
              className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              placeholder="Session target"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[color:var(--ck-text-primary)]">Session Key (optional)</span>
            <input
              type="text"
              value={formData.sessionKey}
              onChange={(e) => updateField("sessionKey", e.target.value)}
              className="mt-2 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--ck-text-primary)]"
              placeholder="Session key"
            />
          </label>
        </div>
      </div>
    </div>
  );
}