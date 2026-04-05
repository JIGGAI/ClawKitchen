import React, { useState, useEffect } from 'react';

interface Plugin {
  id: string;
  name: string;
  teamTypes: string[];
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

const ICON_MAP: Record<string, string> = {
  library: '📚',
  calendar: '📅',
  chart: '📊',
  users: '👥',
  folder: '📁',
};

export default function PluginTabs({ teamType }: PluginTabsProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  /* ---- discover plugins ---- */
  useEffect(() => {
    async function loadPlugins() {
      try {
        const response = await fetch(`/api/plugins?teamType=${encodeURIComponent(teamType)}`);
        const data = await response.json();
        if (data.success) {
          setPlugins(data.plugins);
          if (data.plugins.length > 0 && data.plugins[0].tabs.length > 0) {
            setActiveTab(`${data.plugins[0].id}:${data.plugins[0].tabs[0].id}`);
          }
        }
      } catch (error) {
        console.error('Failed to load plugins:', error);
      } finally {
        setLoading(false);
      }
    }
    loadPlugins();
  }, [teamType]);

  /* ---- expose KitchenPlugin global for tab bundles ---- */
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
  }, []);

  /* ---- lazy-load a tab bundle ---- */
  const loadPluginTab = async (pluginId: string, tabId: string) => {
    const tabKey = `${pluginId}:${tabId}`;
    if (loadedTabs.has(tabKey)) return;
    try {
      const response = await fetch(`/api/plugins/${pluginId}/tabs/${tabId}`);
      const bundleCode = await response.text();
       
      new Function(bundleCode)();
      setLoadedTabs(prev => new Set([...prev, tabKey]));
    } catch (error) {
      console.error(`Failed to load plugin tab ${pluginId}:${tabId}:`, error);
    }
  };

  const handleTabClick = async (pluginId: string, tabId: string) => {
    const tabKey = `${pluginId}:${tabId}`;
    setActiveTab(tabKey);
    if (!loadedTabs.has(tabKey)) await loadPluginTab(pluginId, tabId);
  };

  /* ---- render active tab component ---- */
  const renderActiveTab = () => {
    if (!activeTab) return null;
    const [pluginId, tabId] = activeTab.split(':');
    const w = window as unknown as { KitchenPlugin?: { getTab: (p: string, t: string) => React.ComponentType | undefined } };
    const TabComponent = w.KitchenPlugin?.getTab(pluginId, tabId);

    if (!TabComponent) {
      return (
        <div className="ck-glass p-4">
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--ck-text-tertiary)]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            Loading…
          </div>
        </div>
      );
    }

    return (
      <div className="ck-glass p-4">
        {React.createElement(TabComponent)}
      </div>
    );
  };

  /* ---- loading state ---- */
  if (loading) {
    return (
      <div className="ck-glass p-4">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-[color:var(--ck-text-tertiary)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          Loading plugins…
        </div>
      </div>
    );
  }

  /* ---- empty state ---- */
  if (plugins.length === 0) {
    return (
      <div className="ck-glass p-4">
        <div className="py-8 text-center text-sm text-[color:var(--ck-text-tertiary)]">
          <p>No plugins available for team type: <span className="font-mono">{teamType}</span></p>
          <p className="mt-2">
            Install plugins with{' '}
            <code className="rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs">
              openclaw kitchen plugins install &lt;package&gt;
            </code>
          </p>
        </div>
      </div>
    );
  }

  /* ---- collect all tabs across plugins ---- */
  const allTabs = plugins.flatMap(plugin =>
    plugin.tabs.map(tab => ({ plugin, tab }))
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="ck-glass p-4">
        <div className="text-sm font-medium text-[color:var(--ck-text-primary)]">
          {plugins.length === 1 ? plugins[0].name : 'Plugins'}
        </div>
        <div className="mt-1 text-xs text-[color:var(--ck-text-tertiary)]">
          {plugins.length === 1
            ? `${allTabs.length} tabs available`
            : `${plugins.length} plugins · ${allTabs.length} tabs`}
        </div>
      </div>

      {/* Pill tabs */}
      <div className="flex flex-wrap gap-2">
        {allTabs.map(({ plugin, tab }) => {
          const tabKey = `${plugin.id}:${tab.id}`;
          const isActive = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              onClick={() => handleTabClick(plugin.id, tab.id)}
              className={
                isActive
                  ? "rounded-[var(--ck-radius-sm)] bg-[var(--ck-accent-red)] px-3 py-2 text-sm font-medium text-white shadow-[var(--ck-shadow-1)]"
                  : "rounded-[var(--ck-radius-sm)] border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-[color:var(--ck-text-primary)] shadow-[var(--ck-shadow-1)] hover:bg-white/10"
              }
            >
              {ICON_MAP[tab.icon] || ICON_MAP.folder} {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active tab content in glass card */}
      {renderActiveTab()}
    </div>
  );
}
