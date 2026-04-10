import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { albumTools } from './albums.js';
import { deviceTools } from './devices.js';
import { libraryTools } from './library.js';
import { playTools } from './play.js';
import { playbackTools } from './playback.js';
import { playlistTools } from './playlist.js';
import { readTools } from './read.js';
import { smartPlaylistTools } from './smart-playlist.js';

const server = new McpServer({
  name: 'spotify-controller',
  version: '1.0.0',
});

[
  ...readTools,
  ...playTools,
  ...albumTools,
  ...playlistTools,
  ...playbackTools,
  ...libraryTools,
  ...smartPlaylistTools,
  ...deviceTools,
].forEach((tool) => {
  server.tool(tool.name, tool.description, tool.schema, tool.handler);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
