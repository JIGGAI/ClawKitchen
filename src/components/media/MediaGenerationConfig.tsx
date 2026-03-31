'use client';

import React, { useState, useEffect } from 'react';
import { MediaGenerationConfig, MediaProvider, validateMediaConfig, buildTemplateVariables, PROMPT_TEMPLATES } from '@/lib/workflows/media-nodes';

interface MediaGenerationConfigProps {
  config: MediaGenerationConfig;
  onChange: (config: MediaGenerationConfig) => void;
  teamId: string;
  workflowNodeIds?: string[];
  workflowEdges?: { from: string; to: string }[];
  currentNodeId?: string;
}

export function MediaGenerationConfigComponent({ config, onChange, teamId, workflowNodeIds, workflowEdges, currentNodeId }: MediaGenerationConfigProps) {
  const [providers, setProviders] = useState<MediaProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    async function loadProviders() {
      try {
        const response = await fetch(`/api/teams/${teamId}/media-providers`);
        if (response.ok) {
          const data = await response.json();
          setProviders(data);
        }
      } catch (error) {
        console.error('Failed to load media providers:', error);
      } finally {
        setLoading(false);
      }
    }
    loadProviders();
  }, [teamId]);

  useEffect(() => {
    const configErrors = validateMediaConfig(config);
    setErrors(configErrors);
  }, [config]);

  const updateConfig = (updates: Partial<MediaGenerationConfig>) => {
    onChange({ ...config, ...updates });
  };

  const availableProviders = providers.filter(p => p.available);
  const selectedProvider = providers.find(p => p.id === config.provider);

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center gap-2 text-[10px] text-[color:var(--ck-text-tertiary)]">
          <div className="animate-spin w-3 h-3 border border-[color:var(--ck-border-subtle)] border-t-transparent rounded-full"></div>
          Scanning installed skills...
        </div>
      )}

      {!loading && providers.length === 0 && (
        <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-[color:var(--ck-text-secondary)] space-y-2">
            <p className="font-medium text-[color:var(--ck-text-primary)]">No media generation skills installed</p>
            <div className="text-[color:var(--ck-text-tertiary)]">
              <p>Install a skill to enable media generation:</p>
              <p className="mt-1">
                <a href="https://clawhub.ai/skills?q=image" target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 hover:underline">
                  Browse media skills on ClawHub →
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      {!loading && providers.length > 0 && (
        <label className="block">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">skill</div>
          <select
            value={config.provider}
            onChange={(e) => updateConfig({ provider: e.target.value })}
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
          >
            <option value="">Select a skill...</option>
            {availableProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} — {provider.supportedTypes.join(', ')}
              </option>
            ))}
            {providers.filter(p => !p.available).length > 0 && (
              <optgroup label="Unavailable (missing config)">
                {providers.filter(p => !p.available).map((provider) => (
                  <option key={provider.id} value={provider.id} disabled>
                    {provider.name} ({provider.error})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selectedProvider && (
            <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
              {selectedProvider.description}
            </div>
          )}
        </label>
      )}

      {/* Prompt */}
      <label className="block">
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">prompt</div>
        <div className="relative">
          <textarea
            value={config.prompt}
            onChange={(e) => updateConfig({ prompt: e.target.value })}
            placeholder={config.mediaType === 'video' ? 'Describe the video you want to generate...' : 'Describe the image you want to generate...'}
            rows={3}
            className="mt-1 w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 text-xs text-[color:var(--ck-text-primary)]"
          />
          <div className="absolute top-1 right-1">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  const newPrompt = config.prompt + (config.prompt ? ' ' : '') + e.target.value;
                  updateConfig({ prompt: newPrompt });
                  e.target.value = '';
                }
              }}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-1 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]"
            >
              <option value="">+ Variables</option>
              {buildTemplateVariables(workflowNodeIds ?? [], workflowEdges ?? [], currentNodeId ?? '').map(variable => (
                <option key={variable} value={variable}>{variable}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick prompt templates */}
        <div className="mt-1 flex gap-1 flex-wrap">
          {Object.entries(PROMPT_TEMPLATES).map(([key, template]) => (
            <button
              key={key}
              onClick={() => updateConfig({ prompt: template })}
              className="rounded-[var(--ck-radius-sm)] bg-black/20 px-2 py-0.5 text-[9px] text-[color:var(--ck-text-tertiary)] hover:bg-black/30"
              type="button"
            >
              {key}
            </button>
          ))}
        </div>
      </label>

      {/* Image-specific options */}
      {config.mediaType === 'image' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">size</div>
            <select
              value={config.size || '1024x1024'}
              onChange={(e) => updateConfig({ size: e.target.value })}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
            >
              <option value="1024x1024">Square (1024×1024)</option>
              <option value="1792x1024">Landscape (1792×1024)</option>
              <option value="1024x1792">Portrait (1024×1792)</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">quality</div>
            <select
              value={config.quality || 'standard'}
              onChange={(e) => updateConfig({ quality: e.target.value as 'standard' | 'hd' })}
              className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
            >
              <option value="standard">Standard</option>
              <option value="hd">HD</option>
            </select>
          </label>
        </div>
      )}

      {/* Video-specific options */}
      {config.mediaType === 'video' && (
        <label className="block">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">duration</div>
          <input
            type="text"
            value={config.duration || '5s'}
            onChange={(e) => updateConfig({ duration: e.target.value })}
            placeholder="e.g., 5s, 10s"
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
          />
        </label>
      )}

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">
          <div className="font-medium mb-1">Configuration Issues:</div>
          <div className="space-y-0.5">
            {errors.map((error, index) => (
              <div key={index}>• {error}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
