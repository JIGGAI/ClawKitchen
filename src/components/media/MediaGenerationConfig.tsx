'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { MediaGenerationConfig, MediaProvider, validateMediaConfig, buildTemplateVariables, PROMPT_TEMPLATES } from '@/lib/workflows/media-nodes';
import type { WorkflowFileV1 } from '@/lib/workflows/types';

interface MediaGenerationConfigProps {
  config: MediaGenerationConfig;
  onChange: (config: MediaGenerationConfig) => void;
  teamId: string;
  /** Full workflow object for outputFields-aware variable insertion */
  workflow?: WorkflowFileV1;
  /** All node IDs in the workflow (for building {{nodeId.output}} variable suggestions) */
  workflowNodeIds?: string[];
  /** Workflow edges for determining upstream nodes */
  workflowEdges?: { from: string; to: string }[];
  /** The current node's ID (excluded from variable suggestions) */
  currentNodeId?: string;
}

export function MediaGenerationConfigComponent({ config, onChange, teamId, workflow, workflowNodeIds, workflowEdges, currentNodeId }: MediaGenerationConfigProps) {
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

  // --- Variables dropdown logic ---
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [isVarsOpen, setIsVarsOpen] = useState(false);
  const varsDropdownRef = useRef<HTMLDivElement>(null);

  const globalVariables = useMemo(
    () => [
      { variable: '{{run.id}}', type: 'text' },
      { variable: '{{workflow.name}}', type: 'text' },
      { variable: '{{workflow.id}}', type: 'text' },
      { variable: '{{node.id}}', type: 'text' },
      { variable: '{{date}}', type: 'text' },
    ],
    []
  );

  const upstreamVariables = useMemo(() => {
    if (!workflowNodeIds || !workflowEdges || !currentNodeId) return [];

    // If we have the full workflow with nodes, use outputFields-aware logic
    if (workflow && workflow.nodes) {
      const upstream = new Set<string>();
      const queue = [currentNodeId];
      const visited = new Set<string>();
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const e of (workflow.edges ?? [])) {
          if (e.to === cur && e.from !== currentNodeId && !upstream.has(e.from)) {
            upstream.add(e.from);
            queue.push(e.from);
          }
        }
      }

      const vars: Array<{ nodeId: string; nodeName: string; fieldName: string; fieldType: string }> = [];
      for (const nId of upstream) {
        if (nId === 'start' || nId === 'end') continue;
        const node = workflow.nodes.find((n) => n.id === nId);
        if (!node) continue;
        const nodeName = String((node as Record<string, unknown>).name ?? node.id);

        vars.push({ nodeId: nId, nodeName, fieldName: 'output', fieldType: 'text' });
        vars.push({ nodeId: nId, nodeName, fieldName: 'text', fieldType: 'text' });

        const cfg = (node as Record<string, unknown>).config as Record<string, unknown> | undefined;
        const outputFields = cfg?.outputFields as Array<{ name?: string; type?: string }> | undefined;
        if (Array.isArray(outputFields)) {
          for (const f of outputFields) {
            const name = String(f.name ?? '').trim();
            if (!name || name === 'output' || name === 'text') continue;
            vars.push({ nodeId: nId, nodeName, fieldName: name, fieldType: String(f.type ?? 'text') });
          }
        }
      }
      return vars;
    }

    // Fallback: use old buildTemplateVariables (just {{nodeId.output}} list)
    return buildTemplateVariables(workflowNodeIds, workflowEdges, currentNodeId)
      .filter(v => v.includes('.output') && v.startsWith('{{'))
      .map(v => {
        const inner = v.slice(2, -2); // strip {{ }}
        const dotIdx = inner.indexOf('.');
        const nodeId = inner.substring(0, dotIdx);
        return { nodeId, nodeName: nodeId, fieldName: 'output', fieldType: 'text' };
      });
  }, [workflow, workflowNodeIds, workflowEdges, currentNodeId]);

  const groupedUpstream = useMemo(() => {
    const groups: Record<string, { nodeId: string; nodeName: string; fields: Array<{ name: string; type: string }> }> = {};
    for (const v of upstreamVariables) {
      const key = v.nodeId + '|' + v.nodeName;
      if (!groups[key]) groups[key] = { nodeId: v.nodeId, nodeName: v.nodeName, fields: [] };
      groups[key].fields.push({ name: v.fieldName, type: v.fieldType });
    }
    return Object.values(groups);
  }, [upstreamVariables]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (varsDropdownRef.current && !varsDropdownRef.current.contains(event.target as Node)) {
        setIsVarsOpen(false);
      }
    }
    if (isVarsOpen) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [isVarsOpen]);

  const insertVariable = (variable: string) => {
    const textarea = promptRef.current;
    if (!textarea) {
      // Fallback: just append
      updateConfig({ prompt: config.prompt + (config.prompt ? ' ' : '') + variable });
      setIsVarsOpen(false);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = textarea.value;
    const nextValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
    updateConfig({ prompt: nextValue });
    setTimeout(() => {
      textarea.focus();
      const newPos = start + variable.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
    setIsVarsOpen(false);
  };

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center gap-2 text-[10px] text-[color:var(--ck-text-tertiary)]">
          <div className="animate-spin w-3 h-3 border border-[color:var(--ck-border-subtle)] border-t-transparent rounded-full"></div>
          Detecting providers...
        </div>
      )}

      {!loading && availableProviders.length === 0 && providers.length > 0 && (
        <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-50">
          <div className="space-y-1">
            <div className="font-medium">⚠️ Media providers detected but not available</div>
            <div>
              <strong>Common Issues:</strong>
            </div>
            {providers.some(p => p.error?.includes('API key')) && (
              <div>• Missing API keys - Check provider selection below for specific requirements</div>
            )}
            {providers.some(p => p.error?.includes('not running')) && (
              <div>• Local services not running - Start Stable Diffusion, ComfyUI, etc.</div>
            )}
            <div>
              • <a href="https://docs.openclaw.ai/nodes/images" target="_blank" rel="noopener" className="text-amber-100 underline hover:text-amber-50">
                Setup troubleshooting →
              </a>
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
                <div className="mt-2 rounded-[var(--ck-radius-sm)] border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-100">
                  <div>
                    <span className="font-medium">⚠️ Setup Required:</span> {selectedProvider.error}
                  </div>
                  {selectedProvider.id === 'openai' && selectedProvider.error.includes('OPENAI_API_KEY') && (
                    <div className="mt-1">
                      Add your OpenAI API key to environment variables or OpenClaw config.{' '}
                      <a href="https://docs.openclaw.ai/setup/providers#openai" target="_blank" rel="noopener" className="text-red-200 underline hover:text-red-100">
                        Setup guide →
                      </a>
                    </div>
                  )}
                  {selectedProvider.id === 'skills' && selectedProvider.error.includes('API keys') && (
                    <div className="mt-1">
                      Skills require API keys (OPENAI_API_KEY, EVOLINK_API_KEY).{' '}
                      <a href="https://clawhub.ai/skills?q=image" target="_blank" rel="noopener" className="text-red-200 underline hover:text-red-100">
                        Browse skills →
                      </a>
                    </div>
                  )}
                  {selectedProvider.id.startsWith('http-') && (
                    <div className="mt-1">
                      Start the local service or configure a different endpoint.{' '}
                      <a href="https://docs.openclaw.ai/nodes/images#local-endpoints" target="_blank" rel="noopener" className="text-red-200 underline hover:text-red-100">
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

      {/* Prompt with {{}} variables dropdown */}
      <label className="block">
        <div className="text-[10px] uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">prompt</div>
        <div className="relative">
          <textarea
            ref={promptRef}
            value={config.prompt}
            onChange={(e) => updateConfig({ prompt: e.target.value })}
            placeholder="Describe the image or video you want to generate..."
            rows={3}
            className="mt-1 w-full resize-none rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/25 p-2 pr-12 text-xs text-[color:var(--ck-text-primary)]"
          />

          {/* Variables dropdown */}
          <div className="absolute top-1 right-1" ref={varsDropdownRef}>
            <button
              type="button"
              onClick={() => setIsVarsOpen(!isVarsOpen)}
              className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-black/30 px-2 py-1 text-[9px] text-[color:var(--ck-text-secondary)] hover:bg-white/10 hover:text-[color:var(--ck-text-primary)]"
              title="Insert variable"
            >
              {'{{}}'}
            </button>

            {isVarsOpen && (
              <div className="absolute right-0 top-8 z-50 w-72 max-h-80 overflow-auto rounded-[var(--ck-radius-sm)] border border-white/15 bg-black/80 backdrop-blur shadow-[var(--ck-shadow-1)]">
                <div className="p-1">
                  <div>
                    <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                      Globals
                    </div>
                    {globalVariables.map(({ variable, type }) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => insertVariable(variable)}
                        className="w-full flex items-center justify-between gap-2 rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-xs text-[color:var(--ck-text-primary)] hover:bg-white/10 cursor-pointer"
                      >
                        <span className="font-mono">{variable}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded-sm bg-black/30 text-blue-400">
                          {type}
                        </span>
                      </button>
                    ))}
                  </div>

                  {groupedUpstream.map(group => (
                    <div key={group.nodeId}>
                      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--ck-text-tertiary)]">
                        {group.nodeName}
                      </div>
                      {group.fields.map(field => {
                        const variable = `{{${group.nodeId}.${field.name}}}`;
                        const badgeColor = field.type === 'text' ? 'text-blue-400' :
                                         field.type === 'list' ? 'text-green-400' :
                                         field.type === 'json' ? 'text-amber-400' : 'text-gray-400';

                        return (
                          <button
                            key={`${group.nodeId}.${field.name}`}
                            type="button"
                            onClick={() => insertVariable(variable)}
                            className="w-full flex items-center justify-between gap-2 rounded-[var(--ck-radius-sm)] px-2 py-1 text-left text-xs text-[color:var(--ck-text-primary)] hover:bg-white/10 cursor-pointer"
                          >
                            <span className="font-mono">{variable}</span>
                            <span className={`text-[9px] px-1 py-0.5 rounded-sm bg-black/30 ${badgeColor}`}>
                              {field.type}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}

                  {groupedUpstream.length === 0 && (
                    <div className="px-2 py-3 text-xs text-[color:var(--ck-text-secondary)]">
                      Tip: Add output fields to upstream nodes to see node-specific variables here.
                    </div>
                  )}
                </div>
              </div>
            )}
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
