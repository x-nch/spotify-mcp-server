import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '../spotify-config.json');

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // Unix timestamp in milliseconds
}

export function loadSpotifyConfig(): SpotifyConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(
      `Spotify configuration file not found at ${CONFIG_FILE}. Please create one with clientId, clientSecret, and redirectUri.`,
    );
  }

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!(config.clientId && config.clientSecret && config.redirectUri)) {
      throw new Error(
        'Spotify configuration must include clientId, clientSecret, and redirectUri.',
      );
    }
    return config;
  } catch (error) {
    throw new Error(
      `Failed to parse Spotify configuration: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function saveSpotifyConfig(config: SpotifyConfig): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

let cachedSpotifyApi: SpotifyApi | null = null;
let cachedExpiresAt: number | null = null;

export async function createSpotifyApi(): Promise<SpotifyApi> {
  const config = loadSpotifyConfig();
  const now = Date.now();

  if (config.accessToken && config.refreshToken) {
    const shouldRefresh = !config.expiresAt || config.expiresAt <= now;

    // Rebuild the cached API instance when the on-disk token was replaced
    // externally (e.g. a fresh `npm run auth`) so a long-lived process never
    // keeps serving an access token it obtained days ago.
    const configChanged =
      cachedExpiresAt !== null && cachedExpiresAt !== config.expiresAt;

    if (shouldRefresh) {
      console.log(
        'Access token expired or missing expiration time, refreshing...',
      );
      try {
        const tokens = await refreshAccessToken(config);
        config.accessToken = tokens.access_token;
        config.expiresAt = now + tokens.expires_in * 1000; // Convert seconds to milliseconds
        saveSpotifyConfig(config);
        console.log('Access token refreshed successfully');

        // Clear cached API instance to force recreation with new token
        cachedSpotifyApi = null;
        cachedExpiresAt = null;
      } catch (error) {
        console.error('Failed to refresh token:', error);
        throw new Error(
          'Failed to refresh access token. Please run "npm run auth" to re-authenticate.',
        );
      }
    } else if (configChanged) {
      // On-disk token was replaced without going through refresh (e.g. re-auth).
      // Recreate the instance so it uses the current access token.
      cachedSpotifyApi = null;
      cachedExpiresAt = null;
    }

    if (cachedSpotifyApi) {
      return cachedSpotifyApi;
    }

    const accessToken = {
      access_token: config.accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(
        ((config.expiresAt ?? now + 3600000) - now) / 1000,
      ),
      refresh_token: config.refreshToken,
    };

    cachedSpotifyApi = SpotifyApi.withAccessToken(config.clientId, accessToken);
    cachedExpiresAt = config.expiresAt ?? null;

    // Patch: Use /items instead of /tracks (SDK bug — Feb 2026 Web API change)
    cachedSpotifyApi.playlists.getPlaylistItems = function (
      playlistId: string,
      market?: string,
      fields?: string,
      limit?: number,
      offset?: number,
      additionalTypes?: string[],
    ) {
      const params = (this as any).paramsFor({
        market,
        fields,
        limit,
        offset,
        additional_types: additionalTypes?.join(','),
      });
      return (this as any).getRequest(`playlists/${playlistId}/items${params}`);
    };

    cachedSpotifyApi.playlists.addItemsToPlaylist = async function (
      playlistId: string,
      uris?: string[],
      position?: number,
    ) {
      await (this as any).postRequest(`playlists/${playlistId}/items`, {
        position,
        uris,
      });
    };

    cachedSpotifyApi.playlists.removeItemsFromPlaylist = async function (
      playlistId: string,
      request: { tracks: Array<{ uri: string }>; snapshot_id?: string },
    ) {
      await (this as any).deleteRequest(`playlists/${playlistId}/items`, {
        items: request.tracks,
        snapshot_id: request.snapshot_id,
      });
    };

    cachedSpotifyApi.playlists.updatePlaylistItems = function (
      playlistId: string,
      request: {
        uris?: string[];
        range_start?: number;
        insert_before?: number;
        range_length?: number;
        snapshot_id?: string;
      },
    ) {
      return (this as any).putRequest(`playlists/${playlistId}/items`, request);
    };

    return cachedSpotifyApi;
  }

  // Fallback to client credentials if no user tokens available
  cachedSpotifyApi = SpotifyApi.withClientCredentials(
    config.clientId,
    config.clientSecret,
  );

  return cachedSpotifyApi;
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        b % 62,
      ),
    )
    .join('');
}

export function base64Encode(str: string): string {
  return Buffer.from(str).toString('base64');
}

async function exchangeCodeForToken(
  code: string,
  config: SpotifyConfig,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', config.redirectUri);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to exchange code for token: ${errorData}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
  };
}

export async function refreshAccessToken(config: SpotifyConfig): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  if (!config.refreshToken) {
    throw new Error('No refresh token available');
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = `Basic ${base64Encode(`${config.clientId}:${config.clientSecret}`)}`;

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
    const errorData = await response.text();
    throw new Error(`Failed to refresh access token: ${errorData}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  };
}

export async function authorizeSpotify(): Promise<void> {
  const config = loadSpotifyConfig();

  const redirectUri = new URL(config.redirectUri);
  if (
    redirectUri.hostname !== 'localhost' &&
    redirectUri.hostname !== '127.0.0.1'
  ) {
    console.error(
      'Error: Redirect URI must use localhost for automatic token exchange',
    );
    console.error(
      'Please update your spotify-config.json with a localhost redirect URI',
    );
    console.error('Example: http://127.0.0.1:8888/callback');
    process.exit(1);
  }

  const port = redirectUri.port || '80';
  const callbackPath = redirectUri.pathname || '/callback';

  const state = generateRandomString(16);

  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-modify-private',
    'playlist-modify-public',
    'user-library-read',
    'user-library-modify',
    'user-read-recently-played',
    'user-top-read',
    'user-follow-read',
    'user-read-playback-position',
  ];

  const authParams = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: scopes.join(' '),
    state: state,
    show_dialog: 'true',
  });

  const authorizationUrl = `https://accounts.spotify.com/authorize?${authParams.toString()}`;

  const authPromise = new Promise<void>((resolve, reject) => {
    // Create HTTP server to handle the callback
    const server = http.createServer(async (req, res) => {
      if (!req.url) {
        return res.end('No URL provided');
      }

      const reqUrl = new URL(req.url, `http://localhost:${port}`);

      if (reqUrl.pathname === callbackPath) {
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (error) {
          console.error(`Authorization error: ${error}`);
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(new Error(`Authorization failed: ${error}`));
          return;
        }

        if (returnedState !== state) {
          console.error('State mismatch error');
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>State verification failed. Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(new Error('State mismatch'));
          return;
        }

        if (!code) {
          console.error('No authorization code received');
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>No authorization code received. Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        try {
          const tokens = await exchangeCodeForToken(code, config);

          config.accessToken = tokens.access_token;
          config.refreshToken = tokens.refresh_token;
          config.expiresAt = Date.now() + tokens.expires_in * 1000; // Convert seconds to milliseconds
          saveSpotifyConfig(config);

          res.end(
            '<html><body><h1>Authentication Successful!</h1><p>You can now close this window and return to the application.</p></body></html>',
          );
          console.log(
            'Authentication successful! Access token has been saved.',
          );

          server.close();
          resolve();
        } catch (error) {
          console.error('Token exchange error:', error);
          res.end(
            '<html><body><h1>Authentication Failed</h1><p>Failed to exchange authorization code for tokens. Please close this window and try again.</p></body></html>',
          );
          server.close();
          reject(error);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(Number.parseInt(port), '127.0.0.1', () => {
      console.log(
        `Listening for Spotify authentication callback on port ${port}`,
      );
      console.log('Opening browser for authorization...');

      open(authorizationUrl).catch((_error: Error) => {
        console.log(
          'Failed to open browser automatically. Please visit this URL to authorize:',
        );
        console.log(authorizationUrl);
      });
    });

    server.on('error', (error) => {
      console.error(`Server error: ${error.message}`);
      reject(error);
    });
  });

  await authPromise;
}

export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds.padStart(2, '0')}`;
}

export async function handleSpotifyRequest<T>(
  action: (spotifyApi: SpotifyApi) => Promise<T>,
): Promise<T> {
  let attempts = 0;
  const maxAttempts = 3;
  const backoffMs = 800;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const spotifyApi = await createSpotifyApi();
      return await action(spotifyApi);
    } catch (error) {
      if (error instanceof Error) {
        const isJsonParseError =
          error.message.includes('Unexpected token') ||
          error.message.includes('Unexpected non-whitespace character') ||
          error.message.includes('Exponent part is missing a number in JSON');
        if (isJsonParseError) {
          throw new Error(
            'Operation completed but received unexpected response format from Spotify',
          );
        }
      }
      if (attempts >= maxAttempts) {
        throw error;
      }
      if (
        error instanceof Error &&
        /401|403|invalid.*token|expired|refresh/i.test(error.message)
      ) {
        // Force a fresh instance so the next attempt uses a refreshed token.
        // This keeps long-lived processes self-healing without manual re-auth.
        cachedSpotifyApi = null;
        cachedExpiresAt = null;
        // Exponential backoff before retrying.
        await new Promise((resolve) =>
          setTimeout(resolve, backoffMs * attempts),
        );
        continue;
      }
      throw error;
    }
  }
  throw new Error('Unexpected end of retry loop');
}

export async function spotifyApiRequest(
  endpoint: string,
  method = 'GET',
  body?: object,
): Promise<any> {
  const config = loadSpotifyConfig();
  if (!config.accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.error?.message || `API request failed: ${response.status}`,
      );
    }
    throw new Error(`API request failed: ${response.status}`);
  }

  if (response.status === 204 || response.status === 200) {
    const text = await response.text();
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return true;
      }
    }
    return true;
  }

  const text = await response.text();
  if (!text) {
    return true;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function healthCheck(): Promise<{
  ok: boolean;
  user?: { id: string; display_name: string; product: string };
  error?: string;
}> {
  try {
    const api = await createSpotifyApi();
    const me = await api.currentUser.profile();
    return {
      ok: true,
      user: {
        id: me.id,
        display_name: me.display_name ?? 'Unknown',
        product: me.product ?? 'Unknown',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
