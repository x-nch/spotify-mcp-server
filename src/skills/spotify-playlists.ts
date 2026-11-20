import { handleSpotifyRequest, spotifyApiRequest } from '../utils.js';

export const spotifyPlaylistsSkill = {
  name: 'spotify-playlists',
  description:
    'Create, read, update, and delete Spotify playlists, and add or remove tracks.',
  version: '1.0.0',

  /** Create a private playlist and add tracks in one operation. */
  async createPlaylistFromTracks(args: {
    name: string;
    description?: string;
    trackUris: string[];
  }) {
    const { name, description, trackUris } = args;
    if (!trackUris || trackUris.length === 0) {
      return { ok: false, error: 'No track URIs provided' };
    }

    return await handleSpotifyRequest(async (_spotifyApi) => {
      // Spotify Feb 2026 migration: POST /users/{id}/playlists returns 403.
      // Use POST /me/playlists instead.
      const created = await spotifyApiRequest('/me/playlists', 'POST', {
        name,
        description: description || '',
        public: false,
      });

      const trackUrisWithPrefix = trackUris.map((uri) =>
        uri.startsWith('spotify:track:') ? uri : `spotify:track:${uri}`,
      );

      await spotifyApiRequest(`/playlists/${created.id}/items`, 'POST', {
        uris: trackUrisWithPrefix,
      });

      return {
        ok: true,
        playlist: {
          id: created.id,
          name: created.name,
          url: created.external_urls?.spotify,
          public: created.public,
          trackCount: trackUris.length,
        },
      };
    });
  },

  /** Get a playlist by ID. */
  async getPlaylist(args: { playlistId: string }) {
    return await handleSpotifyRequest(async (spotifyApi) => {
      const playlist = await spotifyApi.playlists.getPlaylist(args.playlistId);
      return {
        ok: true,
        playlist: {
          id: playlist.id,
          name: playlist.name,
          url: playlist.external_urls?.spotify,
          public: playlist.public,
          owner: playlist.owner?.display_name ?? playlist.owner?.id,
          trackTotal:
            (playlist as any).items?.total ?? playlist.tracks?.total ?? 0,
        },
      };
    });
  },

  /** Update playlist details (name, description, public, collaborative). */
  async updatePlaylist(args: {
    playlistId: string;
    name?: string;
    description?: string;
    public?: boolean;
    collaborative?: boolean;
  }) {
    const { playlistId, ...body } = args;
    if (
      body.name === undefined &&
      body.description === undefined &&
      body.public === undefined &&
      body.collaborative === undefined
    ) {
      return { ok: false, error: 'At least one field to update is required' };
    }

    await handleSpotifyRequest(async (spotifyApi) => {
      await spotifyApi.playlists.changePlaylistDetails(playlistId, body);
    });

    return { ok: true, playlistId, updated: Object.keys(body) };
  },

  /** Delete (unfollow) a playlist. */
  async deletePlaylist(args: { playlistId: string }) {
    await handleSpotifyRequest(async (spotifyApi) => {
      await spotifyApi.currentUser.playlists.unfollow(args.playlistId);
    });
    return { ok: true, playlistId: args.playlistId };
  },
};

export default spotifyPlaylistsSkill;
