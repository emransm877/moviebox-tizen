# Local development

Clone this repository and work from its root. Development checks run locally by default; GitHub remains the source host and retains necessary production automation.

## Environment

Run `python tools/local_doctor.py` (`python3` on systems where that is the Python 3 command). This read-only preflight detects the host and basic tools; it does not install dependencies or certify a build. Use the project's supported runtime versions below and existing lockfiles. Do not upgrade dependencies just to run checks.

For Python, create an isolated environment with `python -m venv .venv`. Use `.venv/Scripts/python.exe` on Windows and `.venv/bin/python` on Linux/macOS for installation and checks (activation is optional). Replace `python` below with that interpreter. Existing pinned requirements remain authoritative. Where requirements contain ranges, exact historical dependency resolution is not guaranteed; record a tested lock separately before upgrading.

For Node projects with package-lock.json use `npm ci`; without a lockfile use `npm install` and review the generated lock before committing. Use the declared packageManager if present. Native SDKs and first dependency downloads need internet access. Local-first does not make external APIs or production services offline.

## Repository commands

Use Node 22 and the workflow's Python 3.12 for checks. For byte-identical release packaging, Python 3.13.14 with standard zlib 1.3.1 was verified to reproduce the reviewed widget digest; Python 3.14.3 with zlib-ng does not. Do not change the reviewed helper hash to silence a compressor mismatch. Run the Node and Python checks recorded below; browser acceptance needs Playwright and Chromium (`python -m pip install playwright`, `python -m playwright install chromium`, plus Linux system dependencies where required). The existing Playwright dependency is unpinned, so browser regression results are not fully reproducible across future upgrades. Run `python tools/package.py` and `python tools/build_bundle.py` for unsigned development bundles. TV installation needs official Tizen SDK tools and a certificate authorized for the target TV; those device checks cannot be replaced by a browser. Windows installation helpers require Windows; the Python packaging and JavaScript checks are portable.

## Existing hosted command reference

These are the pre-migration commands for reproducing checks locally. Use the correct host shell (PowerShell paths on Windows, Bash on Unix); install requirements from the workflow. Publishing commands are intentionally excluded.

### ci.yml / verify

```text
node tests/api.test.cjs
node tests/releases.test.cjs
node tests/artwork.test.cjs
node --test tests/carousel.test.cjs
node --test tests/text.test.cjs
node --test tests/quality.test.cjs
node --test tests/detail_cache.test.cjs
python -m pip install playwright
python tests/ui_acceptance.py
python tests/themes_acceptance.py
python tests/home_carousel20_acceptance.py
python tests/carousel_idle_acceptance.py
python tests/episode_dock09_acceptance.py
python tests/cache_history_acceptance.py
python tests/player_acceptance.py
python tests/seek_lifecycle_acceptance.py
python tests/media_transport_acceptance.py
python tests/platform_capabilities_acceptance.py
python tests/design_acceptance.py
python tests/text_acceptance.py
python tests/settings_player_alignment_acceptance.py
python tests/dropdown_fit_acceptance.py
python tests/more_focus_acceptance.py
python tests/artwork_layout_acceptance.py
python tests/catalogue_status_contrast_acceptance.py
python tests/loading_acceptance.py
python tests/hero_artwork_acceptance.py
python -m unittest discover -s tests -p "test_*.py"
python tools/build_bundle.py
```


## Automation and releases

Development workflows are manual fallbacks; select Run workflow in GitHub only when local execution is impractical. Retained production workflows keep their existing triggers and approval gates. Existing release downloads are unaffected by changing development triggers. Manual workflow artifacts expire after the retention shown in each workflow and are not durable release downloads.

Before pushing a workflow change, inspect current branch protection/rulesets and preserve required check names or coordinate their replacement. A manual workflow does not automatically satisfy required PR checks. Never weaken protection merely to make a push pass.

Rollback: inspect the migration commit with `git show <migration-commit>`, then `git revert <migration-commit>` and push under normal repository policy. Reverting automatic triggers may start cloud jobs; review the resulting diff first. Avoid reverting later production state or historical statistics. Account billing and Actions permissions were not changed.

For a new project, choose its existing/native tooling, record supported runtime versions, commit an appropriate dependency lock and environment example without secrets, define local validation commands and platform limits, and classify any proposed cloud automation before adding it. Do not copy an unrelated stack's build script.
