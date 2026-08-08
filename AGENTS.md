# AGENTS.md — Spotify MCP Server

Instructions and session learnings for AI agents working in this repo.

## Project Overview

Spotify MCP server (TypeScript, `@spotify/web-api-ts-sdk`, Zod, stdio transport). Registers tools in `src/index.ts`; tool implementations live in `src/*.ts`; shared auth/helpers in `src/utils.ts`.

- **Build**: `npm run build` (tsc → `build/index.js`, chmod 755). Run before committing.
- **Typecheck**: `npx tsc --noEmit`.
- **Config**: `spotify-config.json` (gitignored) holds `clientId`, `clientSecret`, `redirectUri`, `accessToken`, `refreshToken`, `expiresAt`.

## CRITICAL — Spotify Feb 2026 Web API migration

The following API changes broke the SDK; all have workarounds already patched in this repo. Do NOT "fix" these back to the old SDK calls:

1. **`/playlists/{id}/tracks` (GET/POST/DELETE/PUT) returns 403** — removed. Replacements use `/playlists/{id}/items` and are **owner/collaborator only**.
   - Patch lives in `createSpotifyApi()` (src/utils.ts): overrides `getPlaylistItems`, `addItemsToPlaylist`, `removeItemsFromPlaylist`, `updatePlaylistItems`.
   - `getPlaylistItems` item shape changed: track is under `item.track`/`item` (see `isTrack` handling in src/read.ts:295).
   - `playlist.tracks.total` may be absent; fall back to `(playlist as any).items?.total` (src/read.ts, src/playlist.ts).
2. **Search `limit` max is now 10** (was 50). `searchSpotify` clamps to 10 (src/read.ts:44). Pass `10 as MaxInt<50>` to the SDK.
3. **`/artists/{id}/top-tracks` removed (403)** — `getArtistTopTracks` now does artist-scoped search + popularity sort (src/library.ts:293).
4. **SDK player methods (`player.startResumePlayback` etc.) return 403** — playback tools in src/play.ts use raw HTTP via `spotifyApiRequest` (`/me/player/play`, `/me/player/pause`, `/me/player/next`, `/me/player/queue`).

## Playback workflow (local user "Pavan")

- Device: **`nexi-edge`** (Computer). Prefer Web API: `PUT /v1/me/player/play` with `{"uris":[uri]}` or `{"context_uri":...}` (204 = success). Verify after with `GET /v1/me/player` or AppleScript.
- **Token refresh**: on 401, POST to `https://accounts.spotify.com/api/token` with `grant_type=refresh_token` + `refresh_token` + `client_id` + `client_secret`; update `accessToken`/`expiresAt` in spotify-config.json.
- **AppleScript fallback**: if `NO_ACTIVE_DEVICE` (404), or to play on the local app: `osascript -e 'tell application "Spotify" to play track "spotify:track:ID"'`. Check state via `osascript -e 'tell application "Spotify" to player state'` and track via `get name of current track`.
- **Gotcha learned**: ALWAYS use a track ID that came from a verified search result. Playing a hand-guessed/unverified ID stalls playback (API returns 204, app shows "stopped").
- Search: `GET /v1/search?q=...&type=track&limit=10` (auth: `Authorization: Bearer <accessToken>`).

## "Next" playback rule (vibe matching)

When the user says "Next" / "play next" / "next song":
**query agentmemory → match vibe → choose song → play**.

1. Query agentmemory (project `spotify-mcp-server`) for taste profile + mode playlist IDs. Concepts: `south-bgms-raw-seq`, `12-mood-modes`, `playlist-split`, `play-next-rule`, `spotify-applescript`.
2. Match vibe: build/deploy → `03_BUILD_MODE`; deep focus → `08_FOCUS_DEEP`; task boot → `00_BOOT_SEQUENCE`; creative → `04_CREATION_FLOW`; default `03_BUILD_MODE`. Follow explicit user artist/mood overrides over the mode system.
3. Choose next track from that mode's playlist (skip current, wrap at end).
4. Play via Web API; AppleScript fallback if no active device.

Full detail lives in the skill: `~/.agents/skills/play-next/SKILL.md`.

### 12 mode playlists (split from SOUTH_BGMS_RAW_SEQ = `4pLxLOiHisEwojUykj5nbH`, 83 tracks)

| Mode | Playlist ID |
|---|---|
| 00_BOOT_SEQUENCE | 1VjbNxMGhjFe0Y0PwGfmy5 |
| 01_IDLE_AWARENESS | 0J6GQGc8h6btWjTAAO5u8y |
| 02_THINK_MODE | 43MwiRIatN1WzfG5kYfX8G |
| 03_BUILD_MODE | 7FRG2h2eV7Rek8YhRo7lqZ |
| 04_CREATION_FLOW | 7sdRT3EC2jtFPu5xZXQx9Z |
| 05_RIDING_MODE | 5MJGqurLFzzNZzt1PuF2sx |
| 06_SOCIAL_MODE | 1O1xhESe3vCR34bUXQhkMI |
| 07_FAMILY_MODE | 0iNJtyYfPYWe8GIM3yeN6b |
| 08_FOCUS_DEEP | 6zifq0LbtJWuC0K8vQfmvq |
| 09_EMOTION_RELEASE | 7JrKcqBgJBjfWfAWip9lwG |
| 10_NIGHT_WATCH | 7Lt4lYk8lAFD2tH2vIwdxQ |
| 11_ASCENSION | 0JypyIGK29ZZruFNupAFpO |

## agentmemory server

- Live server: `http://192.168.1.10:3111`, secret `xnch-agentmemory-secret` (env: `AGENTMEMORY_URL`, `AGENTMEMORY_SECRET`). Tools exposed by the MCP shim (`npx -y @agentmemory/mcp`).
- Project scope key for saves: `spotify-mcp-server`.
- Query: `memory_recall` returns full `facts`/`narrative`; `memory_smart_search` returns titles (truncated) + `obsId` — use `memory_recall` for full content.

## User taste profile (from agentmemory)

- Pavan (Pavan Kumar Kalle) — Senior Platform & Infrastructure Engineer, prepping for Woven City Platform Engineer interview.
- Music: South Indian regional + desi hip-hop + Western rap (Eminem, Kendrick Lamar, 2Pac, N.W.A.); high-energy background scores (Anirudh, Thaman S); occasional devotional.
- Core artists: Anirudh Ravichander, Thaman S, SAMBATA, Raathee (Kannada rapper), Havoc Brothers (Kannada rap). "GODLY" (Arhan A Betur x Raathee) is a favorite.
- SAMBATA liked tracks: Pinnak, Gangster Shit 1st, Hood Life, Maaz Intro, Game, PROUD, Kaarte Nibaar (played), Palti Fire; also Kaim by NIJJAR.
- ~25 playlists, 235 liked songs. Playlist names are emoji-heavy/colloquial.

## Secrets hygiene

- `spotify-config.json` and `.opencode.json` (contains `AGENTMEMORY_SECRET`) are gitignored. Never commit tokens or secrets.
