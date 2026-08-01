# Freesound APIv2 reference

Base URL: `https://freesound.org/apiv2`

Documentation: https://freesound.org/docs/api/

## Rate limits

Published standard limits:

- Ordinary API resources: 60 requests/minute and 2,000/day
- Upload, describe, comment, rate, and bookmark resources: 30/minute and 500/day

The CLI defaults below the ordinary limits at 55/minute and 1,900/day, tracks usage locally, limits result pagination, and retries HTTP 429 conservatively. Do not create additional keys to evade limits.

## Read endpoints used by this skill

| Endpoint | Purpose |
|---|---|
| `GET /search/` | Current text, metadata, descriptor, geospatial, and similarity search |
| `GET /sounds/{id}/` | Sound metadata and preview URLs |
| `GET /sounds/{id}/analysis/` | Extracted audio descriptors |
| `GET /sounds/{id}/similar/` | Similar sounds |
| `GET /sounds/{id}/comments/` | Sound comments (documented but no dedicated CLI command) |
| `GET /users/{username}/` | User profile metadata |
| `GET /users/{username}/sounds/` | User's sounds |
| `GET /users/{username}/packs/` | User's packs |
| `GET /packs/{id}/` | Pack metadata |
| `GET /packs/{id}/sounds/` | Pack sounds |
| `GET /me/` | OAuth-authenticated user verification |
| `GET /sounds/{id}/download/` | Original file; OAuth2 required |

## Search response

Paginated lists contain:

```json
{
  "count": 100,
  "next": "https://freesound.org/apiv2/search/?page=2...",
  "previous": null,
  "results": []
}
```

The API defaults to `id,name,tags,username,license` when no `fields` parameter is present. Once `fields` is explicitly supplied, default fields are not automatically included.

## Important sound fields

- `id`, `url`, `name`, `username`
- `description`, `tags`
- `category`, `subcategory`, `category_code`, `category_is_user_provided`
- `license`
- `gen_ai_preference`
- `type`, `channels`, `filesize`, `duration`, `samplerate`, `bitdepth`, `bitrate`
- `md5`: original-file checksum
- `previews`: generated MP3 and OGG variants
- `images`: waveform and spectrogram URLs
- `num_downloads`, `avg_rating`, `num_ratings`
- `is_remix`, `was_remixed`, `is_explicit`
- `geotag`, `is_geotagged`

Documented preview keys:

- `preview-hq-mp3` (~128 kbps)
- `preview-lq-mp3` (~64 kbps)
- `preview-hq-ogg` (~192 kbps)
- `preview-lq-ogg` (~80 kbps)

The original MD5 must not be applied to generated previews.

## Original downloads

`GET /sounds/{id}/download/` returns the uploader's original quality and format and requires an OAuth2 bearer token. Supported originals include WAV, AIFF/AIF, FLAC, OGG, MP3, and M4A according to current sound metadata documentation.

Pack ZIP download exists at `GET /packs/{id}/download/` with OAuth2 but is intentionally excluded from this skill because the size may be unknown and scope can be large.

## Analysis and similarity

`GET /sounds/{id}/analysis/` returns extracted audio descriptors and accepts a comma-separated `fields` parameter.

`GET /sounds/{id}/similar/` supports:

- `similarity_space`
- `fields`
- `filter`
- `page`
- `page_size` up to 150

Current spaces include `laion_clap` and `freesound_classic`.

## Write endpoints intentionally excluded

The API documents OAuth2 endpoints for:

- uploading and describing sounds
- pending uploads
- editing sound descriptions
- bookmarks
- ratings
- comments

This skill does not invoke them. These operations act as a user, can create public content, and may trigger moderation or irreversible community-visible effects.

## Response formats

Freesound can produce JSON, XML, and YAML, but recommends JSON and identifies it as the actively tested response format. The skill always requests JSON.

## Errors

| Status | Meaning |
|---|---|
| 400 | Missing or malformed parameters |
| 401 | Invalid, expired, or revoked credentials |
| 403 | Forbidden, including insecure HTTP for OAuth resources |
| 404 | Resource does not exist |
| 405 | Method unsupported |
| 409 | Valid request conflicts with current state |
| 429 | Rate limit exceeded |
| 5xx | Freesound-side error |

Error bodies normally contain a `detail` field. The CLI redacts secrets and reports this field without printing authorization headers.
