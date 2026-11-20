#!/usr/bin/env node
/**
 * Spotify MCP CLI — auth, maintain, install, health-check.
 * Auto-injects the plugin into ~/.config/opencode/opencode.json on first run.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, name, version } from './plugin.js';
import {
  createSpotifyApi,
  loadSpotifyConfig,
  saveSpotifyConfig,
} from './utils.js';
import { refreshAccessToken } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _CONFIG_FILE = path.join(__dirname, '..', 'spotify-config.json');

function log(msg: string): void {
  console.log(`[spotify-mcp] ${msg}`);
}

function err(msg: string): void {
  console.error(`[spotify-mcp] ERROR: ${msg}`);
}

async function cmdInstall(): Promise<void> {
  const result = install();
  if (result.changed) {
    log(`Installed into ${result.config} (MCP entry + plugin entry added).`);
  } else {
    log(`Already installed in ${result.config}. No changes.`);
  }
}

async function cmdAuth(): Promise<void> {
  // Ensure plugin is installed first
  install();

  const { authorizeSpotify } = await import('./utils.js');
  try {
    await authorizeSpotify();
    log('Authentication complete. Tokens saved to spotify-config.json.');
  } catch (error) {
    err(
      `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

async function cmdMaintain(): Promise<void> {
  install();
  const config = loadSpotifyConfig();
  const now = Date.now();
  const expiresAt = config.expiresAt ? Number(config.expiresAt) : 0;
  const threshold = 10 * 60 * 1000; // 10 min

  if (!config.accessToken || expiresAt <= now + threshold) {
    const tokens = await refreshAccessToken(config);
    config.accessToken = tokens.access_token;
    config.expiresAt = now + tokens.expires_in * 1000;
    if (tokens.refresh_token) config.refreshToken = tokens.refresh_token;
    saveSpotifyConfig(config);
    log(
      `Token refreshed. Expires at ${new Date(config.expiresAt).toISOString()}.`,
    );
  } else {
    const minsLeft = Math.round((expiresAt - now) / 60000);
    log(`Token valid for ~${minsLeft} more minutes.`);
  }

  // Health check
  const api = await createSpotifyApi();
  const me = await api.currentUser.profile();
  log(`Health check OK — authenticated as ${me.display_name} (${me.id}).`);
}

async function cmdHealth(): Promise<void> {
  install();
  try {
    const api = await createSpotifyApi();
    const me = await api.currentUser.profile();
    log(
      `Health OK — user: ${me.display_name} (${me.id}), product: ${me.product}.`,
    );
  } catch (error) {
    err(
      `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const command = process.argv[2] ?? 'help';

switch (command) {
  case 'install':
    await cmdInstall();
    break;
  case 'auth':
    await cmdAuth();
    break;
  case 'maintain':
    await cmdMaintain();
    break;
  case 'health':
    await cmdHealth();
    break;
  case 'version':
    console.log(`${name} v${version}`);
    break;
  case 'help':
  default:
    console.log(`
@xnch/spotify-mcp-plugin v${version}

Usage: spotify-mcp <command>

Commands:
  install     Auto-inject plugin into ~/.config/opencode/opencode.json
  auth        Run Spotify OAuth flow and save tokens
  maintain    Refresh access token if near expiry + health check
  health      Verify Spotify API connectivity
  version     Show version
  help        Show this help

On first run of any command, the plugin is auto-injected into your OpenCode config.
`);
    break;
}
