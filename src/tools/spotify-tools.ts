import { spotifyMaintenanceSkill } from '../skills/spotify-maintenance.js';
import { spotifyPlaylistsSkill } from '../skills/spotify-playlists.js';

export const spotifyTools = [
  {
    name: 'spotify.createPlaylist',
    description:
      'Create a private Spotify playlist and add tracks to it in one operation.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Playlist name' },
        description: {
          type: 'string',
          description: 'Optional playlist description',
        },
        trackUris: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of Spotify track URIs (spotify:track:...)',
        },
      },
      required: ['name', 'trackUris'],
    },
    async handler(args: any) {
      return await spotifyPlaylistsSkill.createPlaylistFromTracks(args);
    },
  },
  {
    name: 'spotify.getPlaylist',
    description: 'Get details of a Spotify playlist by ID.',
    parameters: {
      type: 'object',
      properties: {
        playlistId: {
          type: 'string',
          description: 'The Spotify playlist ID',
        },
      },
      required: ['playlistId'],
    },
    async handler(args: any) {
      return await spotifyPlaylistsSkill.getPlaylist(args);
    },
  },
  {
    name: 'spotify.updatePlaylist',
    description:
      'Update a Spotify playlist (name, description, public, collaborative).',
    parameters: {
      type: 'object',
      properties: {
        playlistId: { type: 'string', description: 'The Spotify playlist ID' },
        name: { type: 'string', description: 'New playlist name' },
        description: { type: 'string', description: 'New description' },
        public: {
          type: 'boolean',
          description: 'Whether the playlist is public',
        },
        collaborative: {
          type: 'boolean',
          description: 'Whether the playlist is collaborative',
        },
      },
      required: ['playlistId'],
    },
    async handler(args: any) {
      return await spotifyPlaylistsSkill.updatePlaylist(args);
    },
  },
  {
    name: 'spotify.deletePlaylist',
    description: 'Unfollow/delete a Spotify playlist you own.',
    parameters: {
      type: 'object',
      properties: {
        playlistId: { type: 'string', description: 'The Spotify playlist ID' },
      },
      required: ['playlistId'],
    },
    async handler(args: any) {
      return await spotifyPlaylistsSkill.deletePlaylist(args);
    },
  },
  {
    name: 'spotify.refreshToken',
    description: 'Refresh the Spotify access token if it is near expiry.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      return await spotifyMaintenanceSkill.refreshToken();
    },
  },
  {
    name: 'spotify.healthCheck',
    description:
      'Verify Spotify API connectivity and return the authenticated user.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async handler() {
      return await spotifyMaintenanceSkill.health();
    },
  },
];

export default spotifyTools;
