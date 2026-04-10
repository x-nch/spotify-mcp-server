import type { Market, MaxInt } from '@spotify/web-api-ts-sdk';
import { z } from 'zod';
import type { SpotifyHandlerExtra, SpotifyTrack, tool } from './types.js';
import { formatDuration, handleSpotifyRequest } from './utils.js';

function isTrack(item: any): item is SpotifyTrack {
  return (
    item &&
    item.type === 'track' &&
    Array.isArray(item.artists) &&
    item.album &&
    typeof item.album.name === 'string'
  );
}

const saveTrack: tool<{
  trackId: z.ZodString;
}> = {
  name: 'saveTrack',
  description: 'Save/like a track to the user\'s "Liked Songs" library',
  schema: {
    trackId: z.string().describe('The Spotify track ID to save'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { trackId } = args;

    try {
      await handleSpotifyRequest(async (spotifyApi) => {
        await spotifyApi.currentUser.tracks.saveTracks([trackId]);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully saved track (ID: ${trackId})`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error saving track: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const removeTrack: tool<{
  trackId: z.ZodString;
}> = {
  name: 'removeTrack',
  description: 'Remove unlike a track from the user\'s "Liked Songs" library',
  schema: {
    trackId: z.string().describe('The Spotify track ID to remove'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { trackId } = args;

    try {
      await handleSpotifyRequest(async (spotifyApi) => {
        await spotifyApi.currentUser.tracks.removeSavedTracks([trackId]);
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully removed track (ID: ${trackId})`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error removing track: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const checkIfTrackSaved: tool<{
  trackId: z.ZodString;
}> = {
  name: 'checkIfTrackSaved',
  description: 'Check if a track is saved in the user\'s "Liked Songs" library',
  schema: {
    trackId: z.string().describe('The Spotify track ID to check'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { trackId } = args;

    try {
      const savedStatus = await handleSpotifyRequest(async (spotifyApi) => {
        const result = await spotifyApi.currentUser.tracks.hasSavedTracks([
          trackId,
        ]);
        return result[0];
      });

      return {
        content: [
          {
            type: 'text',
            text: `Track (ID: ${trackId}) is ${savedStatus ? 'saved' : 'not saved'} in your Liked Songs`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error checking track: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const getTopTracks: tool<{
  timeRange: z.ZodOptional<
    z.ZodEnum<['short_term', 'medium_term', 'long_term']>
  >;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getTopTracks',
  description: "Get the user's top tracks based on listening history",
  schema: {
    timeRange: z
      .enum(['short_term', 'medium_term', 'long_term'])
      .optional()
      .describe(
        'Time range: short_term (4 weeks), medium_term (6 months), long_term (years)',
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of tracks to return (1-50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { timeRange, limit = 20 } = args;

    try {
      const topTracks = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.currentUser.topItems(
          'tracks',
          timeRange || 'medium_term',
          limit as MaxInt<50>,
        );
      });

      if (!topTracks.items || topTracks.items.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No top tracks found',
            },
          ],
        };
      }

      const formattedTracks = topTracks.items
        .map((track: any, i: number) => {
          if (!isTrack(track)) return `${i + 1}. Unknown track`;

          const artists = track.artists.map((a: any) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          return `${i + 1}. "${track.name}" by ${artists} (${duration}) - ID: ${track.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Your Top Tracks (${timeRange || 'medium_term'})\n\n${formattedTracks}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting top tracks: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const getTopArtists: tool<{
  timeRange: z.ZodOptional<
    z.ZodEnum<['short_term', 'medium_term', 'long_term']>
  >;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getTopArtists',
  description: "Get the user's top artists based on listening history",
  schema: {
    timeRange: z
      .enum(['short_term', 'medium_term', 'long_term'])
      .optional()
      .describe(
        'Time range: short_term (4 weeks), medium_term (6 months), long_term (years)',
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of artists to return (1-50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { timeRange, limit = 20 } = args;

    try {
      const topArtists = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.currentUser.topItems(
          'artists',
          timeRange || 'medium_term',
          limit as MaxInt<50>,
        );
      });

      if (!topArtists.items || topArtists.items.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No top artists found',
            },
          ],
        };
      }

      const formattedArtists = topArtists.items
        .map((artist: any, i: number) => {
          const genres = artist.genres
            ? artist.genres.slice(0, 3).join(', ')
            : 'Unknown genre';
          return `${i + 1}. ${artist.name} (${genres}) - ID: ${artist.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Your Top Artists (${timeRange || 'medium_term'})\n\n${formattedArtists}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting top artists: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const getArtistTopTracks: tool<{
  artistId: z.ZodString;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getArtistTopTracks',
  description: 'Get the top tracks for an artist',
  schema: {
    artistId: z.string().describe('The Spotify artist ID'),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of tracks to return (1-50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { artistId, limit = 10 } = args;

    try {
      const topTracks = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.artists.topTracks(artistId, 'US' as Market);
      });

      if (!topTracks?.tracks?.length) {
        return {
          content: [
            {
              type: 'text',
              text: 'No top tracks found for this artist',
            },
          ],
        };
      }

      const tracksToShow: any[] = topTracks.tracks.slice(0, limit);
      const formattedTracks = tracksToShow
        .map((track, i) => {
          if (!isTrack(track)) return `${i + 1}. Unknown track`;

          const artists = track.artists.map((a: any) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          const popularity =
            (track as any).popularity !== undefined
              ? `${(track as any).popularity}% popular`
              : '';
          return `${i + 1}. "${track.name}" by ${artists} (${duration}) ${popularity} - ID: ${track.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Top Tracks for Artist\n\n${formattedTracks}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting artist top tracks: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

export const libraryTools = [
  saveTrack,
  removeTrack,
  checkIfTrackSaved,
  getTopTracks,
  getTopArtists,
  getArtistTopTracks,
];
