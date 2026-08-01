# Freesound Agent Skill

[![Tests](https://github.com/MaksPyn/freesound-skill/actions/workflows/tests.yml/badge.svg)](https://github.com/MaksPyn/freesound-skill/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Search, inspect, preview, download, and correctly credit Creative Commons audio from [Freesound](https://freesound.org/) through its current APIv2.

This repository contains both:

- an **Agent Skill** that teaches compatible coding agents how to work with Freesound safely; and
- a standalone, dependency-free **Node.js command-line tool** for human use.

> This is a community project and is not an official Freesound or Universitat Pompeu Fabra product.

## What can it do?

- Search sound names, descriptions, tags, packs, and uploaders
- Filter by duration, format, channels, sample rate, category, license, and date
- Use advanced audio properties such as BPM, pitch, loudness, and loopability
- Find sounds that are acoustically or semantically similar to another sound
- Browse users and sound packs
- Show license requirements and uploader generative-AI preferences
- Download generated MP3/OGG previews
- Download original-quality files when an OAuth2 token is available
- Verify original downloads against Freesound's published MD5 checksum
- Automatically create `ATTRIBUTION.md` and `attribution.json`
- Protect API keys by using authorization headers and an external credentials file
- Stay below Freesound's published request limits

The skill is read-focused. It does not upload, edit, comment, rate, or bookmark sounds.

## Important before you start

Freesound has two separate sets of rules:

1. **API access rules:** free API usage is for non-commercial purposes. A commercial API application needs an agreement with Universitat Pompeu Fabra.
2. **Individual sound licenses:** each sound can be CC0, CC BY, CC BY-NC, or occasionally a legacy license.

A sound may allow commercial reuse while commercial use of Freesound's hosted API still requires separate permission. The tool shows both concerns, but it cannot make a legal decision for your project.

## Requirements

- Node.js 18 or newer
- A free Freesound account and API credential
- Internet access to Freesound and its preview/download servers
- An OAuth2 access token only if you need original-quality downloads
- Pi or another Agent Skills-compatible harness for automatic agent activation

The CLI uses only built-in Node.js modules. There is no `npm install` step.

## Install as a Pi skill

### Windows PowerShell

```powershell
git clone https://github.com/MaksPyn/freesound-skill.git "$HOME\.pi\agent\skills\freesound"
```

### macOS or Linux

```bash
git clone https://github.com/MaksPyn/freesound-skill.git ~/.pi/agent/skills/freesound
```

Restart Pi so it discovers `SKILL.md`. Then invoke the skill explicitly:

```text
/skill:freesound
```

It can also activate automatically when you ask for sound effects, field recordings, samples, Freesound packs, or audio metadata.

## Get a Freesound API key

1. Create or recover a Freesound account.
2. Visit https://freesound.org/apiv2/apply/ while logged in.
3. Create one API credential for this application.
4. Add the API key to the credentials file described below.

If registration says **“You cannot use this email address to create an account,”** the email is probably already connected to an existing or inactive account. Use Freesound's account-recovery flow or contact support instead of registering it again.

## Store credentials safely

The CLI automatically loads a user-level file outside the skill and Git repository:

```text
Windows: %APPDATA%\pi-freesound\credentials.env
Other:   ~/.config/pi-freesound/credentials.env
```

Create the file with:

```env
FREESOUND_API_KEY=your-api-key

# Optional; needed only for original-quality downloads
FREESOUND_OAUTH_ACCESS_TOKEN=

FREESOUND_USER_AGENT=Pi-Freesound-Skill/1.0
```

Do not place this file inside the repository, commit it, paste it into an issue, or share it in chat. Existing process environment variables take priority over file values.

Verify the configuration without printing secrets:

```bash
node scripts/freesound.js auth status
node scripts/freesound.js auth status --verify
```

## A simple first search

```bash
node scripts/freesound.js search "light rain ambience" \
  --license cc0 \
  --duration-max 60 \
  --limit 10
```

The results include each sound's ID, creator, duration, format, license, uploader Gen-AI preference, and download count.

## Inspect a sound

```bash
node scripts/freesound.js sound 47125
```

This shows:

- creator and Freesound page
- description and tags
- Creative Commons license
- generative-AI preference
- original format, duration, channels, sample rate, size, and MD5
- available preview files
- category and subcategory

## Download a preview

Previews are generated MP3 or OGG files and do not require OAuth2.

### 1. Review the dry-run plan

```bash
node scripts/freesound.js download-preview 47125 \
  --quality hq \
  --format mp3 \
  --max-bytes 10000000
```

### 2. Download after checking the plan

```bash
node scripts/freesound.js download-preview 47125 \
  --quality hq \
  --format mp3 \
  --output ./audio/47125 \
  --max-bytes 10000000 \
  --yes
```

The destination will also contain:

```text
ATTRIBUTION.md
attribution.json
```

The original sound's MD5 does not apply to generated previews, so the tool intentionally does not compare them.

## Download the original file

Original-quality downloads require a valid `FREESOUND_OAUTH_ACCESS_TOKEN`.

Plan first:

```bash
node scripts/freesound.js download-original 47125 \
  --max-bytes 250000000
```

Then download after reviewing format, size, license, and destination:

```bash
node scripts/freesound.js download-original 47125 \
  --output ./audio/47125 \
  --max-bytes 250000000 \
  --yes
```

Originals keep the uploader's format and are checked against Freesound's MD5 value.

## Common searches

### Short CC0 sound effects

```bash
node scripts/freesound.js search "door slam" \
  --license cc0 \
  --duration-max 5 \
  --sort downloads
```

### High-quality WAV field recordings

```bash
node scripts/freesound.js search "forest ambience" \
  --type wav \
  --samplerate-min 44100 \
  --tag field-recording \
  --duration-min 30
```

### Loops around 120 BPM

```bash
node scripts/freesound.js search "drum loop" \
  --descriptor 'bpm=[118 TO 122]' \
  --descriptor 'loopable=true' \
  --duration-max 20
```

### Find similar sounds

```bash
node scripts/freesound.js similar 47125 \
  --similarity-space laion_clap \
  --limit 15
```

### Read selected audio-analysis fields

```bash
node scripts/freesound.js analysis 47125 \
  --field bpm \
  --field pitch \
  --field loudness \
  --field loopable
```

Automatically extracted audio properties can be wrong. Treat them as search aids, not verified facts.

## Main commands

| Command | What it does |
|---|---|
| `auth status` | Reports credential presence without showing secrets |
| `search [words]` | Searches current Freesound APIv2 |
| `sound <id>` | Shows detailed metadata and licensing |
| `similar <id>` | Finds similar sounds |
| `analysis <id>` | Retrieves machine-extracted audio descriptors |
| `user <username>` | Shows a user profile |
| `user-sounds <username>` | Lists a user's sounds |
| `user-packs <username>` | Lists a user's packs |
| `pack <id>` | Shows pack information |
| `pack-sounds <id>` | Lists sounds from a pack |
| `download-preview <id>` | Plans or downloads an MP3/OGG preview |
| `download-original <id>` | Plans or downloads an OAuth-protected original |
| `attribution <id...>` | Generates project credits without downloading |
| `licenses` | Explains API and sound licensing |
| `cache clear` | Removes cached API responses and local rate records |

Run `node scripts/freesound.js --help` for every option.

## Understanding sound licenses

| License | Commercial sound use | Credit required? |
|---|---:|---:|
| CC0 1.0 | Yes | No, but provenance is still useful |
| CC BY 4.0 | Yes | Yes |
| CC BY-NC 4.0 | No, unless the creator grants permission | Yes |
| Sampling+ | Review individually | Usually |

The `--commercial-safe` search option excludes CC BY-NC sounds. It does **not** grant permission for commercial API use.

## Generative-AI preferences

Freesound exposes an uploader preference in addition to the sound license:

- `no-additional-preferences`
- `open-source-models`
- `noncommercial-open-source-models`
- `no-gen-ai`

The CLI always requests and displays this value. For model training, consider both the Creative Commons license and the uploader preference. Voice recordings may involve additional consent, privacy, publicity, or impersonation concerns.

Do not crawl Freesound for a large training dataset. Freesound asks researchers and companies to use its Data Packs process instead. See [`references/generative-ai.md`](references/generative-ai.md).

## Request limits

Freesound's documented standard limits are:

- 60 ordinary requests per minute
- 2,000 ordinary requests per day

The CLI defaults to local safety ceilings of 55/minute and 1,900/day. It retries HTTP 429 responses conservatively and does not perform unbounded pagination.

## Troubleshooting

### API key is missing

Check the credentials file path and run:

```bash
node scripts/freesound.js auth status
```

### API key is rejected

```bash
node scripts/freesound.js auth status --verify
```

A `401` normally means a key or OAuth token is invalid, expired, or revoked.

### Original download is blocked

Token authentication is enough for search and previews, but original files require OAuth2. Add a current bearer token through `FREESOUND_OAUTH_ACCESS_TOKEN`.

### A file already exists

Choose another output folder or use `--force` only when replacement is intentional. An original file whose MD5 already matches is skipped safely.

### MD5 verification fails

The incomplete `.part` file is deleted. Retry instead of using the failed file.

### Metadata looks stale

```bash
node scripts/freesound.js cache clear
node scripts/freesound.js search "your query" --no-cache
```

## Repository layout

```text
freesound-skill/
├── .github/                              CI and security policy
├── SKILL.md                              Agent instructions and workflow
├── scripts/freesound.js                  Standalone CLI
├── references/                           API, licensing, and usage guides
├── tests/freesound.test.js               Mocked unit/integration tests
├── CONTRIBUTING.md                       Contribution guide
└── LICENSE                               MIT license
```

## Test the project

```bash
node --test tests/freesound.test.js
```

The tests use local mock servers and small generated files. They do not consume a real API key or download production audio.

## More documentation

- [`SKILL.md`](SKILL.md) — complete agent workflow and safety rules
- [`references/authentication.md`](references/authentication.md) — secure credential handling and OAuth2
- [`references/search-and-filters.md`](references/search-and-filters.md) — advanced search syntax
- [`references/licenses-and-attribution.md`](references/licenses-and-attribution.md) — API versus sound licensing
- [`references/generative-ai.md`](references/generative-ai.md) — model-training preferences and bulk data
- [`references/api-reference.md`](references/api-reference.md) — endpoint reference
- [`references/examples.md`](references/examples.md) — additional examples

Before shipping an integration, review Freesound's [current API terms](https://freesound.org/help/tos_api/).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. Report vulnerabilities according to the [security policy](.github/SECURITY.md).

## License

This project is licensed under the [MIT License](LICENSE). Freesound audio remains subject to each sound's own license and Freesound's API terms.
