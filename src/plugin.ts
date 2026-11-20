import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  spotifyMaintenanceSkill,
  spotifyPlaylistsSkill,
} from './skills/index.js';
import { spotifyTools } from './tools/spotify-tools.js';

export const name = '@xnch/spotify-mcp-plugin';
export const version = '2.0.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENARC_CONFIG = path.join(
  process.env.OPENARC_CONFIG_DIR ?? os.homedir(),
  '.config',
  'opencode',
  'opencode.json',
);

/**
 * Returns the MCP server registration config for this plugin.
 * OpenCode merges this into opencode.json `mcp.spotify`.
 */
export function setup() {
  return {
    mcp: {
      spotify: {
        type: 'local',
        command: ['node', path.join(__dirname, 'index.js')],
        enabled: true,
      },
    },
    plugin: [name],
  };
}

/**
 * Auto-inject this plugin into the user's OpenCode config.
 * Called on first CLI run (`spotify-mcp install` or `spotify-mcp auth`).
 * Creates a backup before writing.
 */
export function install(): { ok: boolean; config: string; changed: boolean } {
  let config: any = { mcp: {}, plugin: [] };
  let changed = false;

  if (fs.existsSync(OPENARC_CONFIG)) {
    try {
      config = JSON.parse(fs.readFileSync(OPENARC_CONFIG, 'utf8'));
    } catch {
      config = { mcp: {}, plugin: [] };
    }
  }

  config.mcp ??= {};
  config.plugin ??= [];

  const mcpEntry = {
    type: 'local',
    command: ['node', path.join(__dirname, 'index.js')],
    enabled: true,
  };

  const existing = config.mcp.spotify;
  const same =
    existing &&
    existing.type === mcpEntry.type &&
    existing.enabled === mcpEntry.enabled &&
    JSON.stringify(existing.command) === JSON.stringify(mcpEntry.command);

  if (!same) {
    config.mcp.spotify = mcpEntry;
    changed = true;
  }

  if (!config.plugin.includes(name)) {
    config.plugin.push(name);
    changed = true;
  }

  if (changed) {
    const backup = `${OPENARC_CONFIG}.bak`;
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(OPENARC_CONFIG, backup);
    }
    fs.writeFileSync(OPENARC_CONFIG, JSON.stringify(config, null, 2), 'utf8');
  }

  return { ok: true, config: OPENARC_CONFIG, changed };
}

/** Default export for OpenCode plugin loading. */
export default {
  name,
  version,
  setup,
  install,
  tools: spotifyTools,
  skills: {
    maintenance: spotifyMaintenanceSkill,
    playlists: spotifyPlaylistsSkill,
  },
};
