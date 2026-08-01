# Freesound workflow examples

Run from the skill directory or use the absolute path to `scripts/freesound.js`.

## Configure and check credentials

Add the API key to `%APPDATA%\pi-freesound\credentials.env` on Windows or `~/.config/pi-freesound/credentials.env` elsewhere. The CLI loads it automatically.

```bash
node scripts/freesound.js auth status
node scripts/freesound.js auth status --verify
```

The command reports presence/validity without printing secrets.

## Find a short CC0 thunder sound

```bash
node scripts/freesound.js search "thunder" \
  --license cc0 \
  --duration-max 10 \
  --sort downloads \
  --limit 10
```

Inspect a candidate:

```bash
node scripts/freesound.js sound 1234
```

## Download an audition preview

Plan:

```bash
node scripts/freesound.js download-preview 1234 \
  --quality hq \
  --format mp3 \
  --max-bytes 25000000
```

Download after reviewing the license and plan:

```bash
node scripts/freesound.js download-preview 1234 \
  --quality hq \
  --format mp3 \
  --output ./audio/thunder \
  --max-bytes 25000000 \
  --yes
```

The output directory will contain the preview, `ATTRIBUTION.md`, and `attribution.json`.

## Download the original

Original downloads require `FREESOUND_OAUTH_ACCESS_TOKEN`.

```bash
node scripts/freesound.js download-original 1234 \
  --output ./audio/thunder \
  --max-bytes 250000000
```

After reviewing the original format, exact size, and license:

```bash
node scripts/freesound.js download-original 1234 \
  --output ./audio/thunder \
  --max-bytes 250000000 \
  --yes
```

The original is checked against the MD5 published in sound metadata.

## Search by audio characteristics

```bash
node scripts/freesound.js search "drum loop" \
  --descriptor 'bpm=[118 TO 122]' \
  --descriptor 'loopable=true' \
  --duration-min 2 \
  --duration-max 20 \
  --limit 20
```

Descriptor values are automatically extracted estimates.

## Find sounds similar to a reference

```bash
node scripts/freesound.js similar 1234 \
  --similarity-space laion_clap \
  --limit 20
```

Or combine similarity with text/metadata filtering:

```bash
node scripts/freesound.js search "impact" \
  --similar-to 1234 \
  --similarity-space freesound_classic \
  --duration-max 5
```

## Search for commercially reusable sound licenses

```bash
node scripts/freesound.js search "forest ambience" \
  --commercial-safe \
  --duration-min 30 \
  --sort rating
```

This excludes CC BY-NC sounds. It does not grant commercial permission to use Freesound's hosted API; commercial API use requires terms with UPF.

## Browse a creator and pack

```bash
node scripts/freesound.js user ExampleUser
node scripts/freesound.js user-sounds ExampleUser --limit 30
node scripts/freesound.js user-packs ExampleUser
node scripts/freesound.js pack 9678
node scripts/freesound.js pack-sounds 9678 --limit 30
```

## Retrieve selected descriptors

```bash
node scripts/freesound.js analysis 1234 \
  --field bpm \
  --field pitch \
  --field loudness \
  --field tonality \
  --field loopable
```

## Generate project credits

```bash
node scripts/freesound.js attribution 1234 5678 9012 \
  --output ./ATTRIBUTION.md

node scripts/freesound.js attribution 1234 5678 9012 \
  --format json \
  --output ./attribution.json
```

## Filter for a Gen-AI research task

Start by retrieving metadata, not audio:

```bash
node scripts/freesound.js search "environmental sound" \
  --license cc-by \
  --gen-ai no-additional-preferences \
  --limit 50 \
  --json
```

For large datasets, stop using paginated API search and contact Freesound for its Data Packs Portal. Also account for uploader preferences, CC terms, voice/identity rights, training context, and intended model release.

## Machine-readable output

```bash
node scripts/freesound.js search "footsteps" --limit 25 --json > footsteps.json
node scripts/freesound.js sound 1234 --json > sound-1234.json
```

JSON goes to stdout; errors, commercial-license reminders, and verbose request diagnostics go to stderr.

## Refresh cached metadata

```bash
node scripts/freesound.js cache clear
node scripts/freesound.js sound 1234 --no-cache
```
