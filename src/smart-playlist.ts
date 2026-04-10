import type { MaxInt } from '@spotify/web-api-ts-sdk';
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

const createPlaylistFromTracks: tool<{
  name: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  trackUris: z.ZodArray<z.ZodString>;
}> = {
  name: 'createPlaylistFromTracks',
  description:
    'Create a new playlist and add tracks to it in one atomic operation',
  schema: {
    name: z.string().describe('The name of the playlist'),
    description: z
      .string()
      .optional()
      .describe('The description of the playlist'),
    trackUris: z
      .array(z.string())
      .describe('Array of Spotify track URIs to add to the playlist'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { name, description, trackUris } = args;

    if (trackUris.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: No track URIs provided',
          },
        ],
      };
    }

    try {
      const result = await handleSpotifyRequest(async (spotifyApi) => {
        const me = await spotifyApi.currentUser.profile();

        const playlist = await spotifyApi.playlists.createPlaylist(me.id, {
          name,
          description: description || '',
        });

        const trackUrisWithPrefix = trackUris.map((uri) =>
          uri.startsWith('spotify:track:') ? uri : `spotify:track:${uri}`,
        );

        await spotifyApi.playlists.addItemsToPlaylist(
          playlist.id,
          trackUrisWithPrefix,
        );

        return playlist;
      });

      if (!result) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: Playlist creation returned no result`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Successfully created playlist "${name}" with ${trackUris.length} tracks\nPlaylist ID: ${result.id}\nPlaylist URL: ${result.external_urls.spotify}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating playlist: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const getRecommendations: tool<{
  seedTrackUris: z.ZodOptional<z.ZodArray<z.ZodString>>;
  seedGenres: z.ZodOptional<z.ZodArray<z.ZodString>>;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getRecommendations',
  description:
    'Get Spotify track recommendations based on seed tracks or genres',
  schema: {
    seedTrackUris: z
      .array(z.string())
      .max(5)
      .optional()
      .describe('Array of Spotify track URIs to seed recommendations (max 5)'),
    seedGenres: z
      .array(z.string())
      .max(5)
      .optional()
      .describe('Array of genre seeds (e.g., jazz, soul, rock, electronic)'),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of recommendations to return (1-100)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { seedTrackUris, seedGenres, limit = 20 } = args;

    try {
      const seedTrackIds = (seedTrackUris || []).map((uri) => {
        if (uri.includes(':track:')) {
          return uri.split(':track:')[1];
        }
        return uri;
      });

      let recommendations: any;
      try {
        recommendations = await handleSpotifyRequest(async (spotifyApi) => {
          return await (spotifyApi.recommendations as any).get({
            seed_tracks: seedTrackIds.length > 0 ? seedTrackIds : undefined,
            seed_genres:
              seedGenres && seedGenres.length > 0 ? seedGenres : undefined,
            limit: limit as MaxInt<100>,
          });
        });
      } catch (apiError) {
        if (seedGenres && seedGenres.length > 0) {
          return {
            content: [
              {
                type: 'text',
                text: `The Spotify recommendations API is currently unavailable. Try searching for "${seedGenres[0]}" tracks instead.`,
              },
            ],
          };
        }
        throw apiError;
      }

      if (!recommendations.tracks || recommendations.tracks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No recommendations found',
            },
          ],
        };
      }

      const formattedTracks = recommendations.tracks
        .map((track: any, i: number) => {
          if (!isTrack(track)) return `${i + 1}. Unknown track`;

          const artists = track.artists.map((a) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          return `${i + 1}. "${track.name}" by ${artists} (${duration}) - ID: ${track.id}`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Track Recommendations\n\n${formattedTracks}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting recommendations: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

export const smartPlaylistTools = [
  createPlaylistFromTracks,
  getRecommendations,
];
