import { describe, expect, it, beforeEach, vi } from "vitest";
import { discoverKitchenPlugins, clearPluginCache, createPluginContext } from "@/lib/kitchen-plugins";

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
}));

const mockDbExec = vi.fn();
const mockDbClose = vi.fn();

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      exec = mockDbExec;
      close = mockDbClose;
    }
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

vi.mock('drizzle-orm/sqlite-core', () => ({
  sqliteTable: vi.fn(() => ({})),
  text: vi.fn(() => ({})),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

describe("Kitchen Plugins", () => {
  beforeEach(() => {
    clearPluginCache();
    vi.clearAllMocks();
  });

  describe("discoverKitchenPlugins", () => {
    it("discovers valid kitchen plugins from package.json", () => {
      mockExistsSync.mockReturnValue(true);

      mockReaddirSync.mockImplementation((path: string) => {
        if (path.includes('node_modules') && !path.includes('@')) return ['@jiggai'];
        if (path.includes('@jiggai')) return ['kitchen-plugin-marketing'];
        return [];
      });

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
      mockExistsSync.mockReturnValue(true);

      mockReaddirSync.mockReturnValue(['regular-package']);

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
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockReturnValue(undefined);

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
