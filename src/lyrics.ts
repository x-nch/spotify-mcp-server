import { z } from 'zod';
import type { SpotifyHandlerExtra, tool } from './types.js';
import { handleSpotifyRequest } from './utils.js';

function stripTimestamps(lyrics: string): string {
  return lyrics
    .split('\n')
    .map((line) => line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

async function fetchLyricsLrclib(
  artist: string,
  title: string,
  album?: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    artist_name: artist,
    track_name: title,
  });
  if (album) {
    params.append('album_name', album);
  }

  const response = await fetch(`https://lrclib.net/api/search?${params}`);
  if (!response.ok) {
    return null;
  }

  const matches = (await response.json()) as Array<{
    trackName: string;
    artistName: string;
    plainLyrics: string;
    syncedLyrics: string;
  }>;

  const match = matches.find((m) => m.plainLyrics || m.syncedLyrics);
  if (!match) {
    return null;
  }

  if (match.plainLyrics) {
    return match.plainLyrics.trim();
  }
  return stripTimestamps(match.syncedLyrics);
}

async function fetchLyricsOvh(
  artist: string,
  title: string,
): Promise<string | null> {
  const response = await fetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
  );
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { lyrics?: string };
  if (typeof data.lyrics !== 'string' || data.lyrics.trim().length === 0) {
    return null;
  }
  return data.lyrics.trim();
}

const getLyrics: tool<{
  trackName: z.ZodOptional<z.ZodString>;
  artistName: z.ZodOptional<z.ZodString>;
  albumName: z.ZodOptional<z.ZodString>;
}> = {
  name: 'getLyrics',
  description:
    'Get the lyrics for a track. If no track is specified, uses the currently playing track.',
  schema: {
    trackName: z
      .string()
      .optional()
      .describe(
        'The track name. Defaults to the currently playing track on Spotify.',
      ),
    artistName: z
      .string()
      .optional()
      .describe(
        'The artist name. Defaults to the artist of the currently playing track.',
      ),
    albumName: z
      .string()
      .optional()
      .describe('The album name, used to disambiguate between releases'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    let { trackName, artistName, albumName } = args;

    if (!(trackName && artistName)) {
      const playback = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.player.getPlaybackState();
      });

      const item = playback?.item;
      if (!(item && 'artists' in item && Array.isArray(item.artists))) {
        return {
          content: [
            {
              type: 'text',
              text: 'No track specified and nothing is currently playing on Spotify',
            },
          ],
        };
      }

      trackName = trackName || item.name;
      artistName = artistName || item.artists.map((a) => a.name).join(', ');
      if (!albumName) {
        albumName = item.album.name;
      }
    }

    if (!(trackName && artistName)) {
      return {
        content: [
          {
            type: 'text',
            text: 'No track specified and nothing is currently playing on Spotify',
          },
        ],
      };
    }

    try {
      const lrclibLyrics = await fetchLyricsLrclib(
        artistName,
        trackName,
        albumName,
      );
      const lyrics =
        lrclibLyrics || (await fetchLyricsOvh(artistName, trackName));

      if (!lyrics) {
        return {
          content: [
            {
              type: 'text',
              text: `Lyrics for "${trackName}" by ${artistName} were not found`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `# Lyrics: "${trackName}" by ${artistName}\n\n${lyrics}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching lyrics: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

export const lyricsTools = [getLyrics];
