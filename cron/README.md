# Spotify MCP Maintenance Cron

Refreshes the Spotify access token before it expires so playlist creation
and playback never hit a 401 mid-flight.

## Install

```bash
crontab /Users/xnch/work/mcps/spotify-mcp-server/cron/spotify-mcp-maintain.cron
```

## Verify

```bash
crontab -l
```

## Logs

Cron output goes to the system mail unless redirected. The crontab below
appends a timestamped log line to `scripts/maintain.log`.
