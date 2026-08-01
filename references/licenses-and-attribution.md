# Licenses, API terms, and attribution

This is a practical summary, not legal advice. Verify current terms before compliance-sensitive use.

Sources checked July 31, 2026:

- API terms: https://freesound.org/help/tos_api/
- API summary: https://freesound.org/docs/api/terms_of_use.html
- Freesound FAQ: https://freesound.org/help/faq/
- Creative Commons attribution guidance: https://wiki.creativecommons.org/wiki/Recommended_practices_for_attribution

## API terms versus content licenses

Two independent permission layers apply:

1. **Freesound API access:** governed by UPF's API terms.
2. **Each sound and its metadata:** governed by the Creative Commons license selected by its uploader.

A CC0 or CC BY sound can permit commercial reuse while use of Freesound's hosted API in a commercial application still requires an agreement with UPF.

## Freesound API terms summary

- Free API use is for non-commercial purposes.
- Commercial API terms are negotiated case by case with Universitat Pompeu Fabra/Music Technology Group.
- Use one access key per application and keep it secret.
- Do not replicate Freesound, build a similar database, mask the application's identity, circumvent limits, or abuse bandwidth.
- Do not register multiple keys to evade request limits.
- Intermediate content copies should be limited to the permitted application purpose and removed when no longer needed, subject to the content license.
- UPF can change, suspend, or revoke access, and the service has no availability warranty.

Contact Freesound for commercial terms or higher limits.

## Current sound licenses

### CC0 1.0

https://creativecommons.org/publicdomain/zero/1.0/

- Commercial use: allowed
- Attribution: not legally required
- Modification and redistribution: generally allowed
- Do not falsely claim authorship

The skill retains creator/source data for provenance even when attribution is optional.

### CC BY 4.0

https://creativecommons.org/licenses/by/4.0/

- Commercial use: allowed
- Attribution: required
- Modification and redistribution: allowed subject to the license
- Indicate changes when applicable and link the license

### CC BY-NC 4.0

https://creativecommons.org/licenses/by-nc/4.0/

- Commercial use: not allowed without separate permission
- Attribution: required
- Non-commercial modification and redistribution: allowed subject to the license

When intended use could be commercial, exclude this license or obtain permission directly from the creator.

### Sampling+

https://creativecommons.org/licenses/sampling+/1.0/

Some legacy sounds may retain this retired license. Its restrictions are less straightforward. Do not automatically classify it as commercially safe; review the specific license and intended use.

## Attribution format

A useful credit contains title, creator, source, and license:

```text
"Thunderstorm.wav" by ExampleUser
https://freesound.org/s/1234/
Licensed under CC BY 4.0
https://creativecommons.org/licenses/by/4.0/
```

If a sound was modified, note that fact where required or appropriate.

The CLI writes:

- `ATTRIBUTION.md` for human-readable project credits
- `attribution.json` for machine-readable provenance

Keep these files with the project and regenerate credits if sounds are added or removed.

## Remixing and combining sounds

License compatibility matters:

- CC0 material can generally be incorporated into works under other licenses.
- CC BY-derived material cannot be relicensed as CC0 without permission.
- CC BY-NC content keeps its non-commercial restriction.
- Attribute original creators when required, including through chains of remixed sounds.

## Platform risks

Freesound is user-contributed. Uploaders promise that they have rights to their submissions, but mistaken or infringing uploads can occur. Preserve the sound URL, uploader, license, and retrieval date. Content-ID claims may also occur when the same raw sound appears in registered media.
