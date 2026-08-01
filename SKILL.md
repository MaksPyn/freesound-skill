---
name: freesound
description: Search, inspect, filter, preview, download, and attribute Creative Commons audio from Freesound APIv2. Use when a user mentions Freesound, needs sound effects, field recordings, samples, audio metadata or descriptors, similar-sound search, pack browsing, preview files, original audio, or license-compliant attribution.
compatibility: Requires Node.js 18+, network access to freesound.org, and a Freesound API key. Original-quality downloads additionally require an OAuth2 access token.
metadata:
  version: "1.0.0"
  api: "https://freesound.org/apiv2"
---

# Freesound

Use the bundled dependency-free CLI to discover and safely retrieve sounds through the current Freesound APIv2.

## Non-negotiable rules

1. Never ask the user to paste API keys, OAuth tokens, client secrets, or refresh tokens into chat. Use environment variables.
2. Never put API keys in query strings or command arguments. The CLI sends `Authorization: Token` or `Authorization: Bearer` headers.
3. Separate the **API terms** from each **sound's Creative Commons license**. Commercially usable sound content does not make commercial API usage free.
4. Freesound's free API terms cover non-commercial use. For a commercial API application, direct the user to negotiate terms with UPF before relying on the API.
5. Always show the sound license, creator, source URL, and `gen_ai_preference` when recommending or downloading a sound.
6. Do not call upload, edit, comment, rate, bookmark, or other write endpoints. This skill is read-focused.
7. Do not use the API for bulk dataset crawling. For large AI/research datasets, direct the user to Freesound's Data Packs Portal/contact process.
8. Preview and original downloads are dry-run by default. Use `--yes` only after the exact variant, size, license, and destination are acceptable.
9. Prefer `GET /apiv2/search/`. APIv1 is end-of-life, and older search routes are deprecated.

Read [licenses and attribution](references/licenses-and-attribution.md) before advising on commercial use, redistribution, publication, remixing, or attribution. Read [generative AI](references/generative-ai.md) for dataset/model work. Read [authentication](references/authentication.md) for credential setup.

## Setup

Apply for one API credential per application while logged in:

https://freesound.org/apiv2/apply/

The CLI automatically loads a user-level credentials file outside the skill and Git repositories:

```text
Windows: %APPDATA%\pi-freesound\credentials.env
Other:   ~/.config/pi-freesound/credentials.env
```

Add the key manually:

```env
FREESOUND_API_KEY=your-api-key
FREESOUND_OAUTH_ACCESS_TOKEN=
FREESOUND_USER_AGENT=Pi-Freesound-Skill/1.0
```

Existing process environment variables take precedence over the file. Override its location with `FREESOUND_ENV_FILE` or `--credentials-file <path>`.

Alternatively configure the API key directly in the process environment:

PowerShell:

```powershell
$env:FREESOUND_API_KEY = "your-api-key"
```

Windows Command Prompt:

```bat
set FREESOUND_API_KEY=your-api-key
```

POSIX shell:

```bash
export FREESOUND_API_KEY="your-api-key"
```

Check configuration without revealing secrets:

```bash
node scripts/freesound.js auth status
node scripts/freesound.js auth status --verify
```

Original-quality downloads require `FREESOUND_OAUTH_ACCESS_TOKEN`. Token authentication is enough for search, metadata, analysis, similarity, users, packs, and preview URL retrieval.

## Recommended workflow

1. Clarify the sound, intended use, commercial/non-commercial context, format, duration, and quality.
2. If commercial use is involved, explain both the API commercial restriction and the individual sound-license requirements.
3. Search with useful metadata fields in one request; avoid one metadata request per result.
4. Present a small set including ID, name, uploader, duration, license, and Gen-AI preference.
5. Inspect the selected sound with `sound <id>`.
6. For ordinary auditioning, choose an HQ MP3 or OGG preview.
7. For production-quality originals, verify OAuth availability, original format, file size, and MD5.
8. Run the download command without `--yes` and review the plan.
9. Download only after approval. Preserve generated `ATTRIBUTION.md` and `attribution.json` with the project.

## Discover sounds

```bash
node scripts/freesound.js search "thunder storm" --limit 10
node scripts/freesound.js search "piano note" --tag piano --duration-max 5
node scripts/freesound.js search "door slam" --license cc0 --sort downloads
```

Use `--json` for programmatic output.

Useful filters:

```bash
--tag field-recording
--license cc0
--commercial-safe
--duration-min 0.2 --duration-max 5
--type wav
--channels 2
--samplerate-min 44100
--category "Sound effects"
--subcategory "Doors"
--username example-user
--gen-ai no-additional-preferences
--geotagged
--descriptor bpm="[119 TO 121]"
--filter 'avg_rating:[4 TO *]'
```

`--commercial-safe` filters out CC BY-NC sounds but does not grant commercial API permission. Read [search and filters](references/search-and-filters.md) before constructing advanced Solr expressions.

## Inspect a sound

```bash
node scripts/freesound.js sound 1234
node scripts/freesound.js sound 1234 --json
```

Check:

- uploader and source URL
- CC license and attribution requirement
- `gen_ai_preference`
- description and tags
- original format, duration, channels, sample rate, size, and MD5
- category/subcategory
- available previews

Automatically extracted descriptors and algorithmic categories can be inaccurate.

## Similarity and analysis

```bash
node scripts/freesound.js similar 1234 --limit 15
node scripts/freesound.js similar 1234 --similarity-space laion_clap
node scripts/freesound.js analysis 1234 --field bpm --field pitch --field loudness
```

Current similarity spaces include `laion_clap` and `freesound_classic`.

## Users and packs

```bash
node scripts/freesound.js user example-user
node scripts/freesound.js user-sounds example-user --limit 20
node scripts/freesound.js user-packs example-user
node scripts/freesound.js pack 9678
node scripts/freesound.js pack-sounds 9678 --limit 20
```

Pack ZIP downloads are intentionally excluded because size may be unknown and transfer scope can be large.

## Preview downloads

Inspect a dry-run plan:

```bash
node scripts/freesound.js download-preview 1234 --quality hq --format mp3
```

Download after approval:

```bash
node scripts/freesound.js download-preview 1234 \
  --quality hq \
  --format mp3 \
  --output ./audio/1234 \
  --max-bytes 25000000 \
  --yes
```

Preview variants are generated MP3/OGG files. The original file MD5 does not apply to previews.

## Original-quality downloads

Set an OAuth2 access token outside chat, then plan:

```bash
node scripts/freesound.js download-original 1234 --max-bytes 250000000
```

After approval:

```bash
node scripts/freesound.js download-original 1234 \
  --output ./audio/1234 \
  --max-bytes 250000000 \
  --yes
```

Originals retain the uploader's original format and are verified against the API's MD5 value.

## Attribution

Downloads automatically create/update:

```text
ATTRIBUTION.md
attribution.json
```

Generate attribution without downloading:

```bash
node scripts/freesound.js attribution 1234 5678
node scripts/freesound.js attribution 1234 5678 --format json
node scripts/freesound.js attribution 1234 5678 --output ./ATTRIBUTION.md
```

Keep provenance even for CC0, while clearly noting that CC0 attribution is not required.

## Errors and recovery

- Missing API key: set `FREESOUND_API_KEY`; do not pass it on the command line.
- Registration says email cannot be used: recover/reactivate the existing account rather than registering again.
- `401`: credential is invalid, expired, or revoked.
- `403`: use HTTPS and confirm endpoint permissions.
- `404`: verify the sound/user/pack ID.
- `429`: the CLI retries conservatively; do not create extra keys to bypass limits.
- Original download blocked: configure a valid OAuth2 bearer token.
- Existing file: choose another destination or deliberately use `--force`.
- MD5 mismatch: the partial original is removed; retry instead of using it.

See [examples](references/examples.md) and [the API reference](references/api-reference.md) for more detail.
