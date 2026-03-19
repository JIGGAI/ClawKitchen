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

export default function PluginTabs({ teamType }: PluginTabsProps) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPlugins() {
      try {
        const response = await fetch(`/api/plugins?teamType=${encodeURIComponent(teamType)}`);
        const data = await response.json();
        
        if (data.success) {
          setPlugins(data.plugins);
          // Auto-select first tab if available
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

  useEffect(() => {
    // Ensure KitchenPlugin global is available
    if (typeof window !== 'undefined') {
      (window as unknown as { KitchenPlugin: { registeredTabs: Map<string, React.ComponentType>; registerTab: (pluginId: string, tabId: string, component: React.ComponentType) => void; getTab: (pluginId: string, tabId: string) => React.ComponentType | undefined } }).KitchenPlugin = {
        registeredTabs: new Map(),
        registerTab(pluginId: string, tabId: string, component: React.ComponentType) {
          this.registeredTabs.set(`${pluginId}:${tabId}`, component);
        },
        getTab(pluginId: string, tabId: string) {
          return this.registeredTabs.get(`${pluginId}:${tabId}`);
        }
      };

      // Make React available globally for plugins
      (window as unknown as { React: typeof React }).React = React;
    }
  }, []);

  const loadPluginTab = async (pluginId: string, tabId: string) => {
    const tabKey = `${pluginId}:${tabId}`;
    
    if (loadedTabs.has(tabKey)) {
      return; // Already loaded
    }

    try {
      // Dynamically load the plugin tab bundle
      const response = await fetch(`/api/plugins/${pluginId}/tabs/${tabId}`);
      const bundleCode = await response.text();
      
      // Execute the bundle code (using Function constructor as safer alternative to eval)
      // eslint-disable-next-line no-new-func
      new Function(bundleCode)();
      
      setLoadedTabs(prev => new Set([...prev, tabKey]));
    } catch (error) {
      console.error(`Failed to load plugin tab ${pluginId}:${tabId}:`, error);
    }
  };

  const handleTabClick = async (pluginId: string, tabId: string) => {
    const tabKey = `${pluginId}:${tabId}`;
    setActiveTab(tabKey);
    
    if (!loadedTabs.has(tabKey)) {
      await loadPluginTab(pluginId, tabId);
    }
  };

  const renderActiveTab = () => {
    if (!activeTab) return null;

    const [pluginId, tabId] = activeTab.split(':');
    const TabComponent = (window as unknown as { KitchenPlugin?: { getTab: (pluginId: string, tabId: string) => React.ComponentType } }).KitchenPlugin?.getTab(pluginId, tabId);

    if (!TabComponent) {
      return (
        <div className="p-6 text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          Loading plugin tab...
        </div>
      );
    }

    return React.createElement(TabComponent);
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-gray-500">Loading plugins...</p>
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>No plugins available for team type: {teamType}</p>
        <p className="text-sm mt-2">
          Install plugins with <code className="bg-gray-100 px-2 py-1 rounded">openclaw kitchen plugin add &lt;package&gt;</code>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Plugin and tab navigation */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-8 px-6">
          {plugins.map(plugin => (
            <div key={plugin.id} className="flex space-x-2">
              <span className="text-sm font-medium text-gray-500 py-2">{plugin.name}:</span>
              {plugin.tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(plugin.id, tab.id)}
                  className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === `${plugin.id}:${tab.id}`
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{getIconForTab(tab.icon)}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Active tab content */}
      <div className="flex-1 overflow-auto">
        {renderActiveTab()}
      </div>
    </div>
  );
}

function getIconForTab(iconName: string): string {
  const icons: Record<string, string> = {
    library: '📚',
    calendar: '📅',
    chart: '📊',
    users: '👥',
    folder: '📁',
  };
  
  return icons[iconName] || icons.folder;
}