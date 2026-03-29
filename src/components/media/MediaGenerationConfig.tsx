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
    <div className="space-y-4 p-4 border rounded-lg bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{config.mediaType === 'image' ? '🎨' : '🎬'}</span>
        <h3 className="text-lg font-semibold">
          {config.mediaType === 'image' ? 'Image' : 'Video'} Generation
        </h3>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          Detecting providers...
        </div>
      )}

      {!loading && availableProviders.length === 0 && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
          <p className="text-yellow-800 dark:text-yellow-200">
            ⚠️ No media generation providers available. Configure an API key or install media generation skills.
          </p>
        </div>
      )}

      {/* Provider Selection */}
      {!loading && availableProviders.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-2">Provider</label>
          <select
            value={config.provider}
            onChange={(e) => updateConfig({ provider: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="auto">Auto-detect (recommended)</option>
            {availableProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {provider.models && ` (${provider.models.join(', ')})`}
              </option>
            ))}
          </select>
          {selectedProvider && (
            <p className="text-xs text-gray-600 mt-1">
              Supports: {selectedProvider.supportedTypes.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Prompt <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <textarea
            value={config.prompt}
            onChange={(e) => updateConfig({ prompt: e.target.value })}
            placeholder="Describe the image or video you want to generate..."
            rows={3}
            className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700 resize-none"
          />
          {/* Template variable hints */}
          <div className="absolute top-1 right-1">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  const newPrompt = config.prompt + (config.prompt ? ' ' : '') + e.target.value;
                  updateConfig({ prompt: newPrompt });
                  e.target.value = '';
                }
              }}
              className="text-xs bg-gray-100 dark:bg-gray-600 border-0 rounded px-1"
            >
              <option value="">+ Variables</option>
              {TEMPLATE_VARIABLES.map(variable => (
                <option key={variable} value={variable}>{variable}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Quick prompt templates */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {Object.entries(PROMPT_TEMPLATES).map(([key, template]) => (
            <button
              key={key}
              onClick={() => updateConfig({ prompt: template })}
              className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              type="button"
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Image-specific options */}
      {config.mediaType === 'image' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Size</label>
            <select
              value={config.size || '1024x1024'}
              onChange={(e) => updateConfig({ size: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="1024x1024">Square (1024×1024)</option>
              <option value="1792x1024">Landscape (1792×1024)</option>
              <option value="1024x1792">Portrait (1024×1792)</option>
              <option value="512x512">Small Square (512×512)</option>
            </select>
          </div>

          {selectedProvider?.id === 'openai' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Quality</label>
                <select
                  value={config.quality || 'standard'}
                  onChange={(e) => updateConfig({ quality: e.target.value as 'standard' | 'hd' })}
                  className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="standard">Standard</option>
                  <option value="hd">HD (higher cost)</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-medium mb-2">Style</label>
                <select
                  value={config.style || 'natural'}
                  onChange={(e) => updateConfig({ style: e.target.value as 'natural' | 'vivid' })}
                  className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="natural">Natural</option>
                  <option value="vivid">Vivid</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Video-specific options */}
      {config.mediaType === 'video' && (
        <div>
          <label className="block text-sm font-medium mb-2">Duration</label>
          <input
            type="text"
            value={config.duration || '5s'}
            onChange={(e) => updateConfig({ duration: e.target.value })}
            placeholder="e.g., 5s, 10s"
            className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700"
          />
          <p className="text-xs text-gray-600 mt-1">
            Duration in seconds (e.g., &quot;5s&quot;, &quot;10s&quot;)
          </p>
        </div>
      )}

      {/* Output Path */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Output Path <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.outputPath}
          onChange={(e) => updateConfig({ outputPath: e.target.value })}
          placeholder="shared-context/media/{{run.id}}_image.png"
          className="w-full p-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-700"
        />
        <p className="text-xs text-gray-600 mt-1">
          File path where the generated media will be saved. Use template variables for dynamic naming.
        </p>
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Configuration Issues:
          </p>
          <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Provider Status */}
      {!loading && (
        <div className="text-xs text-gray-600 space-y-1">
          <p className="font-medium">Available Providers:</p>
          {providers.map((provider) => (
            <div key={provider.id} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${provider.available ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span>{provider.name}</span>
              {provider.error && <span className="text-red-500">({provider.error})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}