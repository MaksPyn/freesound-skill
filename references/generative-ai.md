# Generative-AI use

Freesound introduced uploader-level generative-AI preferences in July 2026. These preferences supplement rather than replace each sound's Creative Commons license.

This reference summarizes Freesound's own guidance and is not legal advice.

Source: https://freesound.org/help/faq/

## Preference values

### `no-additional-preferences`

The uploader expresses no restriction beyond the sound's Creative Commons license.

Freesound's published interpretation for model training is:

- CC0: no license restriction
- CC BY: disclose the training set
- CC BY-NC: disclose the training set; do not train commercially or use the model commercially

### `open-source-models`

The uploader prefers use only when:

- the sound's Creative Commons terms are followed
- the resulting model is released as Open Source AI
- code, weights, and training documentation are made freely available as required by the OSI definition

CC BY-NC restrictions still apply.

### `noncommercial-open-source-models`

The uploader prefers use only when:

- the Creative Commons terms are followed
- the resulting model is open source and freely available
- training is not performed in a commercial setting
- the model is not used commercially

This preference can be stricter than a sound's CC0 or CC BY license.

### `no-gen-ai`

The uploader expresses a preference that the sound not be used to train generative-AI models.

The skill treats this as excluded from Gen-AI dataset workflows.

## Voice recordings

Uploaders can separately opt solo-speech recordings out of Gen-AI training. Freesound applies `no-gen-ai` to matching “Speech > Solo speech” sounds when that preference is enabled.

Voice cloning may involve privacy, publicity, personality, biometric, consent, and impersonation risks beyond copyright licensing. Do not infer permission for voice cloning from a Creative Commons license alone.

## Skill behavior

The skill always requests and displays `gen_ai_preference`. For model-training tasks:

1. Filter by the Creative Commons license.
2. Filter by uploader Gen-AI preference.
3. Exclude `no-gen-ai`.
4. Exclude CC BY-NC from commercial training.
5. Exclude `noncommercial-open-source-models` from commercial training, even when the sound is CC0/CC BY.
6. Use `open-source-models` only when the intended release meets the stated open-source expectations.
7. Exercise heightened caution with speech and identifiable voices.
8. Preserve IDs, creators, URLs, licenses, preferences, and retrieval timestamps.

Never label a dataset “AI-safe” merely because it contains CC0 sounds.

## Bulk datasets

Freesound asks researchers and model developers to use its Data Packs Portal rather than crawling large amounts of audio through the website or API. Data packs include metadata and tools for applying license/preference filters and can be updated as uploader preferences change.

For large-scale work, contact Freesound through https://freesound.org/help/contact/ and describe:

- institution or company
- research/commercial context
- model type
- intended release and license
- approximate data volume
- whether voices are included
- attribution and dataset-disclosure plan

## Preferences can change

Uploader preferences are account-level and may change after a sound was retrieved. For ongoing datasets, use Freesound's maintained data-pack process or periodically refresh metadata according to agreed terms rather than assuming a preference is permanent.
