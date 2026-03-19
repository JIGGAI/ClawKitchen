import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync, existsSync } from 'fs';
import { discoverKitchenPlugins, clearPluginCache, createPluginContext } from "@/lib/kitchen-plugins";

vi.mock('fs');
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => ({
      exec: vi.fn(),
      close: vi.fn(),
    }))
  };
});

vi.mock('drizzle-orm/better-sqlite3', () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => ({ value: 'test-value' }))
        }))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn()
      }))
    }))
  }))
}));

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);

describe("Kitchen Plugins", () => {
  beforeEach(() => {
    clearPluginCache();
    vi.clearAllMocks();
  });

  describe("discoverKitchenPlugins", () => {
    it("discovers valid kitchen plugins from package.json", () => {
      // Mock filesystem structure
      mockExistsSync.mockReturnValue(true);

      // Mock readdirSync to return plugin packages
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      fs.readdirSync = vi.fn().mockImplementation((path: string) => {
        if (path.includes('node_modules')) return ['@jiggai'];
        if (path.includes('@jiggai')) return ['kitchen-plugin-marketing'];
        return [];
      });

      // Mock package.json content
      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: '@jiggai/kitchen-plugin-marketing',
        version: '1.0.0',
        kitchenPlugin: {
          id: 'marketing',
          name: 'Marketing Suite',
          teamTypes: ['marketing-team'],
          tabs: [
            {
              id: 'content-library',
              label: 'Content Library',
              icon: 'library',
              bundle: './dist/tabs/content-library.js'
            }
          ],
          apiRoutes: './dist/api/routes.js',
          migrations: './db/migrations'
        }
      }));

      const plugins = discoverKitchenPlugins();
      
      expect(plugins.size).toBe(1);
      expect(plugins.has('marketing')).toBe(true);
      
      const marketingPlugin = plugins.get('marketing');
      expect(marketingPlugin?.name).toBe('Marketing Suite');
      expect(marketingPlugin?.teamTypes).toEqual(['marketing-team']);
      expect(marketingPlugin?.tabs).toHaveLength(1);
      expect(marketingPlugin?.tabs[0]?.id).toBe('content-library');
    });

    it("ignores packages without kitchenPlugin manifest", () => {
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes('node_modules')) return true;
        if (path.includes('package.json')) return true;
        return false;
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      fs.readdirSync = vi.fn().mockReturnValue(['regular-package']);

      mockReadFileSync.mockReturnValue(JSON.stringify({
        name: 'regular-package',
        version: '1.0.0'
      }));

      const plugins = discoverKitchenPlugins();
      expect(plugins.size).toBe(0);
    });
  });

  describe("createPluginContext", () => {
    it("creates plugin context with encryption capabilities", () => {
      const context = createPluginContext('test-plugin', '/test/team', 'test-token');
      
      expect(context).toBeDefined();
      expect(context.teamDir).toBe('/test/team');
      expect(typeof context.encrypt).toBe('function');
      expect(typeof context.decrypt).toBe('function');
      expect(typeof context.getConfig).toBe('function');
      expect(typeof context.setConfig).toBe('function');
    });
  });
});