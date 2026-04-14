import React, { useState, useEffect, useCallback } from 'react';

interface Plugin {
  id: string;
  name: string;
  teamTypes: string[];
  enabled: boolean;
  tabs: {
    id: string;
    label: string;
    icon: string;
  }[];
}

interface PluginTabsProps {
  teamType: string;
  teamId: string;
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ck-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/5"
      >
        <span
          className="text-xs text-[color:var(--ck-text-tertiary)] transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        {title}
      </button>
      {open && <div className="px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

export default function PluginTabs({ teamType, teamId }: PluginTabsProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activeTab, setActiveTab] = useState<Record<string, string>>({});
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingPluginId, setSavingPluginId] = useState<string>('');

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/teams/plugins?teamId=${encodeURIComponent(teamId)}`);
      const data = await response.json();
      if (data.ok && Array.isArray(data.plugins)) {
        setPlugins(data.plugins);
        const initial: Record<string, string> = {};
        for (const p of data.plugins) {
          if (p.enabled && p.tabs.length > 0) initial[p.id] = p.tabs[0].id;
        }
        setActiveTab(initial);
      }
    } catch (error) {
      console.error('Failed to load plugins:', error);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      KitchenPlugin: {
        registeredTabs: Map<string, React.ComponentType>;
        registerTab: (pluginId: string, tabId: string, component: React.ComponentType) => void;
        getTab: (pluginId: string, tabId: string) => React.ComponentType | undefined;
      };
      React: typeof React;
    };
    w.KitchenPlugin = {
      registeredTabs: new Map(),
      registerTab(pluginId, tabId, component) { this.registeredTabs.set(`${pluginId}:${tabId}`, component); },
      getTab(pluginId, tabId) { return this.registeredTabs.get(`${pluginId}:${tabId}`); },
    };
    w.React = React;
    import('react-dom').then((mod) => {
      (window as unknown as Record<string, unknown>).ReactDOM = mod;
    }).catch(() => { /* fallback: plugins render in-place */ });
  }, []);

  const loadPluginTab = useCallback(async (pluginId: string, tabId: string) => {
    const tabKey = `${pluginId}:${tabId}`;
    if (loadedTabs.has(tabKey)) return;
    try {
      const response = await fetch(`/api/plugins/${pluginId}/tabs/${tabId}?teamId=${encodeURIComponent(teamId)}`);
      const bundleCode = await response.text();
      new Function(bundleCode)();
      setLoadedTabs(prev => new Set([...prev, tabKey]));
    } catch (error) {
      console.error(`Failed to load plugin tab ${pluginId}:${tabId}:`, error);
    }
  }, [loadedTabs, teamId]);

  useEffect(() => {
    for (const plugin of plugins) {
      if (!plugin.enabled) continue;
      const tabId = activeTab[plugin.id];
      if (!tabId) continue;
      const tabKey = `${plugin.id}:${tabId}`;
      if (!loadedTabs.has(tabKey)) {
        void loadPluginTab(plugin.id, tabId);
      }
    }
  }, [plugins, activeTab, loadedTabs, loadPluginTab]);

  const handleTabClick = useCallback(async (pluginId: string, tabId: string) => {
    setActiveTab(prev => ({ ...prev, [pluginId]: tabId }));
    const tabKey = `${pluginId}:${tabId}`;
    if (!loadedTabs.has(tabKey)) await loadPluginTab(pluginId, tabId);
  }, [loadedTabs, loadPluginTab]);

  const handlePluginToggle = useCallback(async (pluginId: string, enabled: boolean) => {
    setSavingPluginId(pluginId);
    try {
      const response = await fetch('/api/teams/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, pluginId, enabled }),
      });
      if (!response.ok) throw new Error('Failed to update plugin');
      if (!enabled) {
        setLoadedTabs((prev) => new Set(Array.from(prev).filter((key) => !key.startsWith(`${pluginId}:`))));
      }
      await loadPlugins();
    } catch (error) {
      console.error('Failed to update plugin state:', error);
    } finally {
      setSavingPluginId('');
    }
  }, [loadPlugins, teamId]);

  const renderTabContent = (plugin: Plugin) => {
    const currentTabId = activeTab[plugin.id];
    if (!currentTabId) return null;

    const tabKey = `${plugin.id}:${currentTabId}`;
    const w = window as unknown as { KitchenPlugin?: { getTab: (p: string, t: string) => React.ComponentType | undefined } };
    const TabComponent = w.KitchenPlugin?.getTab(plugin.id, currentTabId);

    if (!loadedTabs.has(tabKey) || !TabComponent) {
      return (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--ck-text-tertiary)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          Loading…
        </div>
      );
    }

    const Comp = TabComponent as React.ComponentType<Record<string, unknown>>;
    return React.createElement(Comp, { teamId, teamType, pluginId: plugin.id });
  };

  if (loading) {
    return (
      <div className="ck-card p-4">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--ck-text-tertiary)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          Loading plugins…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Installing Plugins" defaultOpen={plugins.length === 0}>
        <div className="space-y-2 text-sm text-[color:var(--ck-text-secondary)]">
          <p>Install Kitchen plugins via the CLI:</p>
          <code className="block rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-[color:var(--ck-text-primary)]">
            openclaw kitchen plugins install &lt;package-name&gt;
          </code>
          <p className="text-xs text-[color:var(--ck-text-tertiary)]">
            Plugins are installed to <span className="font-mono">~/.openclaw/kitchen/plugins/</span> and discovered automatically.
            Restart Kitchen after installing.
          </p>
        </div>
      </Section>

      {plugins.map(plugin => (
        <Section key={plugin.id} title={plugin.name} defaultOpen>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm">
            <div>
              <div className="text-[color:var(--ck-text-primary)]">{plugin.enabled ? 'Enabled for this team' : 'Installed, but disabled for this team'}</div>
              <div className="text-xs text-[color:var(--ck-text-tertiary)]">
                Supported team types: {plugin.teamTypes.join(', ') || 'any'}
              </div>
            </div>
            <button
              type="button"
              disabled={savingPluginId === plugin.id}
              onClick={() => handlePluginToggle(plugin.id, !plugin.enabled)}
              className={plugin.enabled
                ? 'rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] hover:bg-white/10 disabled:opacity-60'
                : 'rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)] disabled:opacity-60'}
            >
              {savingPluginId === plugin.id ? 'Saving…' : plugin.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>

          {!plugin.enabled ? (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-[color:var(--ck-text-tertiary)]">
              Enable this plugin for this team to load its tabs.
            </div>
          ) : (
            <>
              <div className="mt-2 mb-4 flex flex-wrap gap-2">
                {plugin.tabs.map(tab => {
                  const isActive = activeTab[plugin.id] === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(plugin.id, tab.id)}
                      className={
                        isActive
                          ? "rounded-lg bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)]"
                          : "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10"
                      }
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {renderTabContent(plugin)}
            </>
          )}
        </Section>
      ))}

      {plugins.length === 0 && (
        <div className="ck-card p-4">
          <div className="py-8 text-center text-sm text-[color:var(--ck-text-tertiary)]">
            No Kitchen plugins are installed.
          </div>
        </div>
      )}
    </div>
  );
}
