# Freesound Agent Skill

An [Agent Skills](https://agentskills.io/) package for searching, inspecting, previewing, downloading, and attributing Creative Commons audio through the current [Freesound APIv2](https://freesound.org/docs/api/).

## Features

- Current `/apiv2/search/` endpoint with metadata, Solr, descriptor, and geospatial filters
- Sound, user, pack, analysis, and similarity resources
- License-aware CC0, CC BY, CC BY-NC, and legacy Sampling+ handling
- Freesound uploader generative-AI preference metadata
- Dry-run MP3/OGG preview and OAuth original downloads
- Original-file MD5 verification and atomic `.part` downloads
- Automatic Markdown and JSON attribution manifests
- Persistent request-rate safeguards and bounded pagination
- API keys sent only through authorization headers
- Automatic user-level credentials file outside the repository
- No runtime dependencies beyond Node.js 18+

## Install as a Pi skill

Clone or copy this repository into:

```text
~/.pi/agent/skills/freesound/
```

Restart Pi, then invoke explicitly with:

```text
/skill:freesound
```

## Credentials

Apply for one Freesound API credential per application:

https://freesound.org/apiv2/apply/

The CLI automatically loads:

```text
Windows: %APPDATA%\pi-freesound\credentials.env
Other:   ~/.config/pi-freesound/credentials.env
```

Example file:

```env
FREESOUND_API_KEY=your-api-key
FREESOUND_OAUTH_ACCESS_TOKEN=
FREESOUND_USER_AGENT=Pi-Freesound-Skill/1.0
```

Never place this file inside the repository. Existing process environment variables take precedence.

## CLI examples

```bash
node scripts/freesound.js auth status --verify
node scripts/freesound.js search "thunder storm" --license cc0 --limit 10
node scripts/freesound.js sound 1234
node scripts/freesound.js similar 1234 --similarity-space laion_clap
node scripts/freesound.js download-preview 1234 --quality hq --format mp3
node scripts/freesound.js download-preview 1234 --quality hq --format mp3 --yes
```

Downloads are dry-run by default. Original-quality downloads require OAuth2.

See [`SKILL.md`](SKILL.md) and the [`references`](references/) directory for complete workflows, authentication, search syntax, licensing, attribution, and generative-AI guidance.

## Test

```bash
node --test tests/freesound.test.js
```

## Important terms

Freesound's free API access is for non-commercial use. Commercial API applications require terms negotiated with Universitat Pompeu Fabra. This is separate from each sound's Creative Commons license. Review the [current API terms](https://freesound.org/help/tos_api/) before shipping an integration.
