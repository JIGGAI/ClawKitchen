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

      {!loading && availableProviders.length === 0 && providers.length > 0 && (
        <div className="rounded-[var(--ck-radius-sm)] border border-amber-500/20 bg-amber-500/10 p-3">
          <div className="text-[10px] text-amber-200 space-y-2">
            <p className="font-medium">⚠️ Media providers detected but not available</p>
            <div className="space-y-1">
              <p><strong>Common Issues:</strong></p>
              {providers.some(p => p.error?.includes('API key')) && (
                <p>• Missing API keys - Check provider selection below for specific requirements</p>
              )}
              {providers.some(p => p.error?.includes('not running')) && (
                <p>• Local services not running - Start Stable Diffusion, ComfyUI, etc.</p>
              )}
              <p>• <a href="https://docs.openclaw.ai/nodes/images" target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 hover:underline">Setup troubleshooting →</a></p>
            </div>
          </div>
        </div>
      )}

      {!loading && providers.length === 0 && (
        <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-[color:var(--ck-text-secondary)] space-y-2">
            <p className="font-medium text-[color:var(--ck-text-primary)]">⚠️ No media generation providers detected</p>
            <div className="space-y-1 text-[color:var(--ck-text-tertiary)]">
              <p><strong>Setup Options:</strong></p>
              <p>• <a href="https://docs.openclaw.ai/nodes/images" target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 hover:underline">Configure image generation models →</a></p>
              <p>• <a href="https://clawhub.ai/skills?q=image" target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 hover:underline">Install image generation skills →</a></p>
              <p>• <a href="https://docs.openclaw.ai/setup/providers#openai" target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 hover:underline">Add OpenAI API key for DALL-E →</a></p>
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
            <div className="mt-1 space-y-1">
              <div className="text-[10px] text-[color:var(--ck-text-tertiary)]">
                Supports: {selectedProvider.supportedTypes.join(', ')}
                {selectedProvider.models && selectedProvider.models.length > 0 && (
                  <span className="ml-2">• Models: {selectedProvider.models.join(', ')}</span>
                )}
              </div>
              {selectedProvider.error && (
                <div className="rounded-[var(--ck-radius-sm)] border border-red-200/50 bg-red-50/50 px-2 py-1">
                  <div className="text-[10px] text-red-700">
                    <span className="font-medium">⚠️ Setup Required:</span> {selectedProvider.error}
                  </div>
                  {selectedProvider.id === 'openai' && selectedProvider.error.includes('OPENAI_API_KEY') && (
                    <div className="mt-1 text-[9px] text-red-600">
                      Add your OpenAI API key to environment variables or OpenClaw config.{' '}
                      <a href="https://docs.openclaw.ai/setup/providers#openai" target="_blank" rel="noopener" className="underline">
                        Setup guide →
                      </a>
                    </div>
                  )}
                  {selectedProvider.id === 'skills' && selectedProvider.error.includes('API keys') && (
                    <div className="mt-1 text-[9px] text-red-600">
                      Skills require API keys (OPENAI_API_KEY, EVOLINK_API_KEY).{' '}
                      <a href="https://clawhub.ai/skills?q=image" target="_blank" rel="noopener" className="underline">
                        Browse skills →
                      </a>
                    </div>
                  )}
                  {selectedProvider.id.startsWith('http-') && (
                    <div className="mt-1 text-[9px] text-red-600">
                      Start the local service or configure a different endpoint.{' '}
                      <a href="https://docs.openclaw.ai/nodes/images#local-endpoints" target="_blank" rel="noopener" className="underline">
                        Local setup →
                      </a>
                    </div>
                  )}
                </div>
              )}
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
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-1 py-0.5 text-[10px] text-[color:var(--ck-text-secondary)]"
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
        <div className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-red-900/20 p-2">
          <div className="text-[10px] font-medium text-red-400 mb-1">Configuration Issues:</div>
          <div className="text-[10px] text-red-300 space-y-0.5">
            {errors.map((error, index) => (
              <div key={index}>• {error}</div>
            ))}
          </div>
        </div>
      )}


    </div>
  );
}