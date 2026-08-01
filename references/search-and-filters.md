# Search and filters

Use the current endpoint:

```http
GET https://freesound.org/apiv2/search/
```

Older APIv1 search endpoints are end-of-life. Freesound's documentation notes that older search integrations should migrate directly to `/apiv2/search/`.

## Text query

Queries search weighted sound metadata including ID, tags, name, description, pack name, and uploader.

Examples:

```bash
node scripts/freesound.js search "car crash"
node scripts/freesound.js search '"bass drum" -double'
```

Freesound supports quoted phrases and negative terms. An empty query can return all sounds, but this skill requires at least one query or filter to avoid accidental broad crawling.

## Efficient fields

When `fields` is supplied, Freesound does not automatically add its default fields. The CLI therefore requests a complete useful set in each search request, including:

- identity, name, URL, username
- description and tags
- license and `gen_ai_preference`
- duration, format, channels, sample rate, size, MD5
- previews
- category/subcategory
- rating and download count

This avoids an extra `/sounds/{id}/` request for every result.

## Pagination

- Default API page: 1
- Default API page size: 15
- Maximum API page size: 150
- Skill result cap: 500

The skill does not perform unbounded pagination. Use the Data Packs process instead of paging through the full database.

## Sort modes

| CLI value | API value |
|---|---|
| `relevance` | `score` |
| `downloads` | `downloads_desc` |
| `rating` | `rating_desc` |
| `newest` | `created_desc` |
| `oldest` | `created_asc` |
| `shortest` | `duration_asc` |
| `longest` | `duration_desc` |

The API also accepts numeric descriptor targets such as `pitch:220,pitch_var:0.0`.

## Solr filters

Raw filters use Freesound's Solr-style syntax:

```text
tag:"field recording"
duration:[0.1 TO 5]
samplerate:[44100 TO *]
type:(wav OR flac)
avg_rating:[4 TO *]
created:[2025-01-01T00:00:00Z TO NOW]
```

`TO` in ranges must be uppercase. Multiple filters separated by spaces are combined. Boolean expressions can use `AND` and `OR`.

The response field `tags` is filtered using singular `tag`; comments similarly use singular `comment`.

Example:

```bash
node scripts/freesound.js search "rain" \
  --filter 'duration:[10 TO 120] samplerate:[44100 TO *] type:(wav OR flac)'
```

Raw filters are passed through intentionally. Prefer convenience flags when possible to reduce quoting mistakes.

## Convenience filters

```bash
--tag rain
--license cc-by
--commercial-safe
--duration-min 1 --duration-max 30
--type wav
--channels 2
--samplerate-min 44100
--category "Music"
--subcategory "Piano / Keyboard instruments"
--username ExampleUser
--geotagged
--created-after 2025-01-01T00:00:00Z
--gen-ai no-additional-preferences
```

`--commercial-safe` only filters sound licenses to CC0/CC BY. It does not grant commercial use of the hosted API.

## Audio descriptors

Automatically extracted fields can be searched with `--descriptor name=value`:

```bash
--descriptor 'bpm=[119 TO 121]'
--descriptor 'pitch=[435 TO 445]'
--descriptor 'note_confidence=[0.9 TO *]'
--descriptor 'loopable=true'
```

Descriptors include BPM, pitch, note, loudness, dynamic range, brightness, spectral measures, tonality, loopability, onset/beat data, MFCC, and HPCP. These are machine-generated estimates and can be wrong.

## Similarity search

By sound endpoint:

```bash
node scripts/freesound.js similar 1234
```

Through search:

```bash
node scripts/freesound.js search "impact" \
  --similar-to 1234 \
  --similarity-space laion_clap
```

Current documented spaces:

- `laion_clap`: 512-dimensional semantic/acoustic embedding
- `freesound_classic`: 100-dimensional low-level acoustic feature space

## Geospatial search

Basic geotag filtering is available through `--geotagged`. More advanced radius/rectangle expressions can be supplied through `--filter`, for example:

```text
{!geofilt sfield=geotag pt=41.3833,2.1833 d=10}
```

Only sounds with uploader-supplied geotags can match geospatial filters.
