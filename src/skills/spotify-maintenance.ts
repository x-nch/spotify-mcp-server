import {
  healthCheck,
  loadSpotifyConfig,
  refreshAccessToken,
  saveSpotifyConfig,
} from '../utils.js';

export const spotifyMaintenanceSkill = {
  name: 'spotify-maintenance',
  description:
    'Maintains the Spotify MCP server: refreshes the access token before expiry, runs health checks, and self-heals on 401/403 errors.',
  version: '1.0.0',

  /** Refresh the access token if it expires within 10 minutes. */
  async refreshToken() {
    const config = loadSpotifyConfig();
    const now = Date.now();
    const expiresAt = config.expiresAt ? Number(config.expiresAt) : 0;
    const threshold = 10 * 60 * 1000;

    if (!config.accessToken || expiresAt <= now + threshold) {
      const tokens = await refreshAccessToken(config);
      config.accessToken = tokens.access_token;
      config.expiresAt = now + tokens.expires_in * 1000;
      if (tokens.refresh_token) config.refreshToken = tokens.refresh_token;
      saveSpotifyConfig(config);
      return {
        refreshed: true,
        expiresAt: config.expiresAt,
        expiresAtIso: new Date(config.expiresAt).toISOString(),
      };
    }
    const minsLeft = Math.round((expiresAt - now) / 60000);
    return {
      refreshed: false,
      minutesLeft: minsLeft,
      expiresAtIso: new Date(expiresAt).toISOString(),
    };
  },

  /** Verify Spotify API connectivity and return the authenticated user. */
  async health() {
    return await healthCheck();
  },
};

export default spotifyMaintenanceSkill;
