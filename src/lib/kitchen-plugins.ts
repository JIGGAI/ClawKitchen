import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { eq } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export interface KitchenPluginManifest {
  id: string;
  name: string;
  teamTypes: string[];
  tabs: {
    id: string;
    label: string;
    icon: string;
    bundle: string;
  }[];
  apiRoutes?: string;
  migrations?: string;
}

type PluginConfigRow = {
  value: string | null;
};

type PluginDb = {
  select(): {
    from(table: typeof configTable): {
      where(condition: unknown): {
        get(): PluginConfigRow | undefined;
      };
    };
  };
  insert(table: typeof configTable): {
    values(row: { key: string; value: string; updatedAt: string }): {
      onConflictDoUpdate(opts: {
        target: typeof configTable.key;
        set: { value: string; updatedAt: string };
      }): void;
    };
  };
};

export interface KitchenPluginContext {
  db: PluginDb;
  teamDir: string;
  encrypt(data: unknown): string;
  decrypt(blob: string): unknown;
  registerCron(opts: { schedule: string; handler: string }): void;
  getConfig(key: string): string | null;
  setConfig(key: string, value: string): void;
}

// Plugin config table schema
const configTable = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP'),
});

// Cache for discovered plugins
let cachedPlugins: Map<string, KitchenPluginManifest> | null = null;

/**
 * The canonical location for Kitchen plugins installed via CLI.
 */
export function getPluginsDir(): string {
  return join(homedir(), '.openclaw', 'kitchen', 'plugins');
}

/**
 * Scan a node_modules directory for Kitchen plugin manifests.
 */
function scanNodeModules(nodeModulesPath: string, plugins: Map<string, KitchenPluginManifest>): void {
  if (!existsSync(nodeModulesPath)) return;

  let entries: string[];
  try {
    entries = readdirSync(nodeModulesPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = join(nodeModulesPath, entry);

    if (entry.startsWith('@')) {
      // Scoped package - check subdirectories
      try {
        const scopedEntries = readdirSync(entryPath);
        for (const scopedEntry of scopedEntries) {
          const packagePath = join(entryPath, scopedEntry);
          const manifest = loadPluginManifest(packagePath);
          if (manifest && !plugins.has(manifest.id)) {
            plugins.set(manifest.id, manifest);
          }
        }
      } catch {
        // Ignore errors reading scoped directories
      }
    } else {
      // Regular package
      const manifest = loadPluginManifest(entryPath);
      if (manifest && !plugins.has(manifest.id)) {
        plugins.set(manifest.id, manifest);
      }
    }
  }
}

/**
 * Discover all Kitchen plugins.
 *
 * Search order (first match wins per plugin id):
 * 1. ~/.openclaw/kitchen/plugins/node_modules/  (CLI-installed plugins)
 * 2. CWD/node_modules/  (dev / legacy fallback)
 */
export function discoverKitchenPlugins(): Map<string, KitchenPluginManifest> {
  if (cachedPlugins) return cachedPlugins;

  const plugins = new Map<string, KitchenPluginManifest>();

  // Primary: dedicated plugins directory
  const pluginsDir = getPluginsDir();
  scanNodeModules(join(pluginsDir, 'node_modules'), plugins);

  // Fallback: CWD node_modules (useful for dev mode)
  scanNodeModules(resolve('node_modules'), plugins);

  cachedPlugins = plugins;
  return plugins;
}

/**
 * Load plugin manifest from a package directory
 */
function loadPluginManifest(packagePath: string): KitchenPluginManifest | null {
  try {
    const packageJsonPath = join(packagePath, 'package.json');
    if (!existsSync(packageJsonPath)) return null;

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const kitchenPlugin = packageJson.kitchenPlugin;

    if (!kitchenPlugin || typeof kitchenPlugin !== 'object') return null;

    // Validate required fields
    if (!kitchenPlugin.id || !kitchenPlugin.name || !Array.isArray(kitchenPlugin.teamTypes)) {
      console.warn(`Invalid Kitchen plugin manifest in ${packagePath}`);
      return null;
    }

    // Validate and resolve bundle paths
    const tabs = Array.isArray(kitchenPlugin.tabs) ? kitchenPlugin.tabs : [];
    for (const tab of tabs) {
      if (tab.bundle && !existsSync(join(packagePath, tab.bundle))) {
        console.warn(`Plugin ${kitchenPlugin.id}: bundle not found at ${tab.bundle}`);
        return null;
      }
    }

    return {
      id: String(kitchenPlugin.id),
      name: String(kitchenPlugin.name),
      teamTypes: kitchenPlugin.teamTypes as string[],
      tabs: tabs.map((tab: Record<string, unknown>) => ({
        id: String(tab.id || ''),
        label: String(tab.label || ''),
        icon: String(tab.icon || 'folder'),
        bundle: resolve(packagePath, String(tab.bundle || '')),
      })),
      apiRoutes: kitchenPlugin.apiRoutes ? resolve(packagePath, String(kitchenPlugin.apiRoutes)) : undefined,
      migrations: kitchenPlugin.migrations ? resolve(packagePath, String(kitchenPlugin.migrations)) : undefined,
    };
  } catch (error) {
    console.warn(`Failed to load plugin manifest from ${packagePath}:`, error);
    return null;
  }
}

/**
 * Create isolated SQLite database for a plugin
 */
export function createPluginDb(pluginId: string): PluginDb {
  const dbDir = resolve(homedir(), '.openclaw', 'kitchen', 'plugins', pluginId);
  const dbPath = join(dbDir, `${pluginId}.db`);

  // Ensure directory exists
  try {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      fs.mkdirSync(dbDir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  } catch {
    // Directory might already exist
  }

  // Lazy-load sqlite so plugin discovery routes do not require the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/better-sqlite3');

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema: { config: configTable } });

  // Create config table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db as unknown as PluginDb;
}

/**
 * Create plugin context for a given plugin
 */
export function createPluginContext(
  pluginId: string,
  teamDir: string,
  authToken: string
): KitchenPluginContext {
  const db = createPluginDb(pluginId);

  // Simple AES-256-GCM encryption using auth token
  const encrypt = (data: unknown): string => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const key = crypto.pbkdf2Sync(authToken, 'kitchen-plugin-salt', 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', key);
    cipher.setAAD(iv);
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
  };

  const decrypt = (blob: string): unknown => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const key = crypto.pbkdf2Sync(authToken, 'kitchen-plugin-salt', 100000, 32, 'sha256');
    const buffer = Buffer.from(blob, 'base64');
    
    const iv = buffer.subarray(0, 16);
    const authTag = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32).toString('base64');
    
    const decipher = crypto.createDecipher('aes-256-gcm', key);
    decipher.setAAD(iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  };

  const registerCron = (opts: { schedule: string; handler: string }): void => {
    // Integration with OpenClaw cron system will be implemented in future versions
    console.log(`Plugin ${pluginId} registered cron:`, opts);
  };

  const getConfig = (key: string): string | null => {
    const result = db.select().from(configTable).where(eq(configTable.key, key)).get();
    return result?.value || null;
  };

  const setConfig = (key: string, value: string): void => {
    db.insert(configTable)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: configTable.key, set: { value, updatedAt: new Date().toISOString() } });
  };

  return {
    db,
    teamDir,
    encrypt,
    decrypt,
    registerCron,
    getConfig,
    setConfig,
  };
}

/**
 * Filter plugins by team type
 */
export function getPluginsForTeamType(teamType: string): KitchenPluginManifest[] {
  const plugins = discoverKitchenPlugins();
  return Array.from(plugins.values()).filter(plugin =>
    plugin.teamTypes.includes(teamType)
  );
}

/**
 * Clear plugin cache (for testing)
 */
export function clearPluginCache(): void {
  cachedPlugins = null;
}