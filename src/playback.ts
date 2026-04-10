import { z } from 'zod';
import type { SpotifyHandlerExtra, tool } from './types.js';
import { spotifyApiRequest } from './utils.js';

const setRepeatMode: tool<{
  state: z.ZodEnum<['track', 'context', 'off']>;
  deviceId: z.ZodOptional<z.ZodString>;
}> = {
  name: 'setRepeatMode',
  description:
    'Set the repeat mode for Spotify playback. Requires Spotify Premium.',
  schema: {
    state: z
      .enum(['track', 'context', 'off'])
      .describe(
        'The repeat mode: track (repeat one), context (repeat all), or off',
      ),
    deviceId: z.string().optional().describe('The Spotify device ID'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { state, deviceId } = args;

    try {
      const deviceParam = deviceId ? `?device_id=${deviceId}` : '';
      await spotifyApiRequest(
        `/me/player/repeat?state=${state}${deviceParam}`,
        'PUT',
      );

      const stateDisplay =
        state === 'track'
          ? 'Repeat One'
          : state === 'context'
            ? 'Repeat All'
            : 'Off';
      return {
        content: [
          {
            type: 'text',
            text: `Repeat mode set to ${stateDisplay}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error setting repeat mode: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

const seekToPosition: tool<{
  positionMs: z.ZodNumber;
  deviceId: z.ZodOptional<z.ZodString>;
}> = {
  name: 'seekToPosition',
  description:
    'Seek to a specific position within the currently playing track. Requires Spotify Premium.',
  schema: {
    positionMs: z
      .number()
      .nonnegative()
      .describe('The position to seek to in milliseconds'),
    deviceId: z.string().optional().describe('The Spotify device ID'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { positionMs, deviceId } = args;

    try {
      const deviceParam = deviceId ? `?device_id=${deviceId}` : '';
      await spotifyApiRequest(
        `/me/player/seek?position_ms=${positionMs}${deviceParam}`,
        'PUT',
      );

      const seconds = Math.floor(positionMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      const formattedTime = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

      return {
        content: [
          {
            type: 'text',
            text: `Seeked to position ${formattedTime}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error seeking to position: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

export const playbackTools = [setRepeatMode, seekToPosition];
