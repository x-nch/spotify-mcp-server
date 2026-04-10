import { z } from 'zod';
import type { SpotifyHandlerExtra, tool } from './types.js';
import { spotifyApiRequest } from './utils.js';

const transferPlayback: tool<{
  deviceId: z.ZodString;
}> = {
  name: 'transferPlayback',
  description:
    'Transfer Spotify playback to a different device. Requires Spotify Premium.',
  schema: {
    deviceId: z
      .string()
      .describe('The Spotify device ID to transfer playback to'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { deviceId } = args;

    try {
      await spotifyApiRequest('/me/player', 'PUT', {
        device_ids: [deviceId],
        play: true,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Playback transferred to device (ID: ${deviceId})`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error transferring playback: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};

export const deviceTools = [transferPlayback];
