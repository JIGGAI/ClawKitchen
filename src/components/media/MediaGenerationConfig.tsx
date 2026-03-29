'use client';

import React, { useState, useEffect } from 'react';
import { MediaGenerationConfig, MediaProvider, validateMediaConfig, TEMPLATE_VARIABLES, PROMPT_TEMPLATES } from '@/lib/workflows/media-nodes';

interface MediaGenerationConfigProps {
  config: MediaGenerationConfig;
  onChange: (config: MediaGenerationConfig) => void;
  teamId: string;
}

export function MediaGenerationConfigComponent({ config, onChange, teamId }: MediaGenerationConfigProps) {
  const [providers, setProviders] = useState<MediaProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  // Load available providers
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

  // Validate config on change
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
          Detecting providers...
        </div>
      )}

      {!loading && availableProviders.length === 0 && (
        <div className="rounded-[var(--ck-radius-sm)] border border-amber-200/50 bg-amber-50/50 p-3">
          <div className="text-[10px] text-amber-900 space-y-2">
            <p className="font-medium">⚠️ No media generation providers available</p>
            <div className="space-y-1">
              <p><strong>Setup Options:</strong></p>
              <p>• <a href="https://docs.openclaw.ai/nodes/images" target="_blank" rel="noopener" className="text-blue-700 hover:underline">Configure image generation models →</a></p>
              <p>• <a href="https://clawhub.ai/skills?q=image" target="_blank" rel="noopener" className="text-blue-700 hover:underline">Install image generation skills →</a></p>
              <p>• <a href="https://docs.openclaw.ai/setup/providers#openai" target="_blank" rel="noopener" className="text-blue-700 hover:underline">Add OpenAI API key for DALL-E →</a></p>
            </div>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      {(!loading && providers.length > 0) && (
        <label className="block">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">provider</div>
          <select
            value={config.provider}
            onChange={(e) => updateConfig({ provider: e.target.value })}
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
          >
            <option value="auto">Auto-detect (recommended)</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {provider.available 
                  ? (provider.models && provider.models.length > 0 
                     ? ` (${provider.models.join(', ')})` 
                     : ' ✓'
                    )
                  : ' ⚠️'
                }
              </option>
            ))}
          </select>
          {selectedProvider && (
            <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
              Supports: {selectedProvider.supportedTypes.join(', ')}
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
            placeholder="Describe the image or video you want to generate..."
            rows={3}
            className="mt-1 w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 text-xs text-[color:var(--ck-text-primary)]"
          />
          {/* Template variable selector */}
          <div className="absolute top-1 right-1">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  const newPrompt = config.prompt + (config.prompt ? ' ' : '') + e.target.value;
                  updateConfig({ prompt: newPrompt });
                  e.target.value = '';
                }
              }}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-1 py-0.5 text-[9px] text-[color:var(--ck-text-secondary)]"
            >
              <option value="">+ Variables</option>
              {TEMPLATE_VARIABLES.map(variable => (
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
        <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
          Use template variables for dynamic content. Quick templates available above.
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
              <option value="512x512">Small Square (512×512)</option>
            </select>
          </label>

          {selectedProvider?.id === 'openai' && (
            <label className="block">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">quality</div>
              <select
                value={config.quality || 'standard'}
                onChange={(e) => updateConfig({ quality: e.target.value as 'standard' | 'hd' })}
                className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
              >
                <option value="standard">Standard</option>
                <option value="hd">HD (higher cost)</option>
              </select>
            </label>
          )}
        </div>
      )}

      {selectedProvider?.id === 'openai' && config.mediaType === 'image' && (
        <label className="block">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">style</div>
          <select
            value={config.style || 'natural'}
            onChange={(e) => updateConfig({ style: e.target.value as 'natural' | 'vivid' })}
            className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
          >
            <option value="natural">Natural</option>
            <option value="vivid">Vivid</option>
          </select>
        </label>
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
          <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
            Duration in seconds (e.g., &quot;5s&quot;, &quot;10s&quot;)
          </div>
        </label>
      )}

      {/* Output Path */}
      <label className="block">
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">outputPath</div>
        <input
          type="text"
          value={config.outputPath}
          onChange={(e) => updateConfig({ outputPath: e.target.value })}
          placeholder="shared-context/media/{{run.id}}_image.png"
          className="mt-1 w-full rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 px-2 py-1 text-xs text-[color:var(--ck-text-primary)]"
        />
        <div className="mt-1 text-[10px] text-[color:var(--ck-text-tertiary)]">
          File path where the generated media will be saved. Use template variables for dynamic naming.
        </div>
      </label>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="rounded-[var(--ck-radius-sm)] border border-red-200 bg-red-50 p-2">
          <div className="text-[10px] font-medium text-red-800 mb-1">Configuration Issues:</div>
          <div className="text-[10px] text-red-700 space-y-0.5">
            {errors.map((error, index) => (
              <div key={index}>• {error}</div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Status */}
      {!loading && providers.length > 0 && (
        <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">
          <div className="font-medium mb-1">Detected Providers:</div>
          <div className="space-y-0.5">
            {providers.map((provider) => (
              <div key={provider.id} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${provider.available ? 'bg-green-400' : 'bg-red-400'}`}></span>
                <span className="font-medium">{provider.name}</span>
                <span className="opacity-75">
                  ({provider.supportedTypes.join(', ')})
                  {provider.models && provider.models.length > 0 && ` • ${provider.models.join(', ')}`}
                </span>
                {provider.error && <span className="text-red-400 ml-auto">({provider.error})</span>}
              </div>
            ))}
          </div>
          {providers.filter(p => !p.available).length > 0 && (
            <div className="mt-2 text-[9px] opacity-75">
              ⚠️ Unavailable providers can be configured via{' '}
              <a href="https://docs.openclaw.ai/nodes/images" target="_blank" rel="noopener" className="text-blue-600 hover:underline">
                setup docs
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}