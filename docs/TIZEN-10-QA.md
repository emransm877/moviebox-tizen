# Tizen 10 development QA

This records bounded checks for MovieBox development version 0.9.3. It is not a new public release announcement or a guarantee for every Samsung TV. Earlier hardware checks used a Samsung UA43U8000FRSER reporting Tizen 10.0. The final candidate still needs the installation and visual checks listed below.

## Encoding

The extra character before the episode-title middle dot came from double-encoded interface literals. The affected title/progress strings were corrected. A live sample of 1,430 upstream display fields showed no matching corruption, so no speculative title-repair algorithm was added.

Regression checks cover strict UTF-8 source files, actual API JSON parsing, escaped Unicode, catalogue/library round trips, player labels and subtitle storage. Accented names, Bengali, Hindi, Arabic, Chinese and emoji remain intact. Subject IDs, image/media URLs, tokens and raw subtitle cues are not rewritten. See [text tests](../tests/text.test.cjs) and [browser encoding checks](../tests/text_acceptance.py).

## Artwork, controls and navigation

Some Movies covers are genuine landscape images. They previously appeared inside fixed portrait frames, leaving large blank areas. The shared card now reserves the cover's own dimensions and reconciles them with the decoded image. Grid and detail views keep the complete original image with `contain`; they do not crop it into a fake portrait or borrow another title's banner. Checks include real wide, square and tall source images, all six listing routes, both tested viewport sizes and all five themes.

Other component checks cover:

- Text-sized filter choices and selection menus, including long language labels.
- Consistent player header/control insets and a clearer season/episode drawer with restrained focus and reduced-motion support.
- Arrow navigation through mixed-height card rows and Settings. Single-line text editing, modified arrows and IME composition retain their editing behavior.
- Focus after loading additional results or episodes, including cases where the viewer moves focus or starts typing during loading.

The existing Obsidian, Aurora, Eclipse, Orbital and Prism identities are retained. Browser fixtures establish layout and event handling; they do not establish physical remote or Samsung decoder behavior.

## Why 720p can be absent

Only actual authorized resource qualities are shown. In the sampled Dhindora S2 E1 response, the service advertised 360/480/1080; a request for 720 returned an actual 480p resource. In the Fidelity sample, a genuine unlocked 720p resource was returned even by the initial 1080 request. These are title-specific source observations, not a promise that each title has the same tiers.

The adapter uses the returned resource resolution, not the requested label. It does not upscale, invent 720p or bypass membership locks. [Quality regressions](../tests/quality.test.cjs) cover both samples, server fallback, locked tiers and separate caption metadata for equal display titles with different IDs. Resource metadata alone is not a measured hardware decode resolution.

## Hardware evidence and final gate

An earlier 0.9.3 development candidate was reinstalled and survived launch on the named Tizen 10 TV. Checks included real 1920×1080 and 853×480 playback, pause/resume, repeated seeking and English/Bangla subtitle loading. A separate owned short-GOP clip exercised native seeking, embedded audio, fit and Unicode overlays. Injected keys on the actual TV establish software input paths; physical infrared remote confirmation remains pending.

The same version number does not identify an immutable candidate. Final acceptance must identify the signed widget hash and recheck the installed payload after the latest layout/navigation changes.

| Final-candidate check | Status |
|---|---|
| Exact signed widget SHA-256 recorded | `6cb79b080052a79d159327d2c3bf1f4c91a9f5cb14f80ee7ee37ecc3d122c819` |
| Same-author installation and surviving launch | Passed on the named Tizen 10 TV |
| Artwork | Actual TV Movies wide/portrait frames passed; search/detail additionally covered by independent browser review |
| Settings, selection menus, episode drawer and player alignment | TV Settings, single-Up drawer and matching 1,850px bars passed; all-theme menu/contrast browser checks passed |
| Normal source playback, seeking and subtitles after the final install | Real Dhindora S2 E1 decoded 1920?1080; pause/resume, forward/back seeks and 452 loaded subtitle cues passed without a reported media error |
| Physical infrared remote | Pending |

Use the [Samsung TV installation guide](INSTALL-TV.md) for the certificate and installation requirements. This final same-author installation retained the existing three history entries and resumed the real episode at its saved position; it did not restore data deleted by the OS upgrade. This is not universal hardware compatibility or a promise of support for every future OS update.

Independent Agency design review approved the bounded final candidate after inspecting actual TV Movies, player and drawer captures, plus 70 genuine-art browser configurations. Aurora catalogue status contrast was corrected to 5.41:1. Fifty arrow movements required one additional layout build instead of 50; the original automated performance limit remains unchanged.

Unsigned public payload SHA-256: `c716af01027a5711f94a1c81893e31c74999bc5ad0bf2aea2b274566578fb689`. All 46 public files matched the locally signed installed widget. Signing material and personal diagnostics are not distributed. Version 0.9.3 remains a development candidate; this check did not publish a new release.
