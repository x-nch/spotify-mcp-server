#!/usr/bin/env node
/**
 * Spotify MCP maintenance script.
 *
 * - Reads spotify-config.json
 * - Refreshes access token if it expires within 10 minutes
 * - Writes refreshed tokens back to spotify-config.json
 * - Verifies connectivity via GET /v1/me
 * - Prints one-line status: OK | REFRESHED | FAILED
 *
 * Run manually or via cron every 30 minutes.
 */

import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = path.join(
  process.env.SPOTIFY_CONFIG_DIR ?? '/Users/xnch/work/mcps/spotify-mcp-server',
  'spotify-config.json',
);
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function base64Encode(str) {
  return Buffer.from(str).toString('base64');
}

function readConfig() {
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

async function refreshAccessToken(config) {
  if (!config.refreshToken) {
    throw new Error('No refresh token available');
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(
    `${config.clientId}:${config.clientSecret}`,
  )}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', config.refreshToken);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text().catch(() => '');
    throw new Error(
      `Failed to refresh access token: ${response.status} ${errorData}`,
    );
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  };
}

async function verifyConnectivity(accessToken) {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  let status = 'OK';
  let _refreshed = false;

  try {
    const config = readConfig();
    const now = Date.now();
    const expiresAt = config.expiresAt ? Number(config.expiresAt) : 0;

    const needsRefresh =
      !config.accessToken || expiresAt <= now + REFRESH_THRESHOLD_MS;

    if (needsRefresh) {
      const tokens = await refreshAccessToken(config);
      config.accessToken = tokens.access_token;
      config.expiresAt = now + tokens.expires_in * 1000;
      if (tokens.refresh_token) {
        config.refreshToken = tokens.refresh_token;
      }
      writeConfig(config);
      _refreshed = true;
      status = 'REFRESHED';
      console.log(
        `Token refreshed. New expiresAt: ${config.expiresAt} (${new Date(config.expiresAt).toISOString()})`,
      );
    } else {
      const minsLeft = Math.round((expiresAt - now) / 60000);
      console.log(`Token valid for ~${minsLeft} more minutes.`);
    }

    const ok = await verifyConnectivity(config.accessToken);
    if (!ok) {
      status = 'FAILED';
      console.error('Connectivity check failed: GET /v1/me returned non-200');
      process.exit(1);
    }

    console.log(`${status} - Spotify MCP token is healthy.`);
    process.exit(0);
  } catch (error) {
    status = 'FAILED';
    console.error(
      `Maintenance failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

main();
