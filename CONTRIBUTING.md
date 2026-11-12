# Contributing

Keep the installed TV payload small: vanilla HTML/CSS/JavaScript, native AVPlay,
and explicit remote focus states. Avoid frameworks, bundled browser engines,
continuous polling, and unlimited poster/subtitle caches.

Every playable control must work with arrows, OK and Return. Native IME text
entry must retain its normal keys and composition behavior. Verify caption
timing and exact episode identity, not merely a language label.

Run `node tests/api.test.cjs` and `python tests/ui_acceptance.py`. State whether
validation used a browser mock or real Samsung hardware. Never publish a mock
test result as proof of TV decoding, native IME or physical remote behavior.

Do not commit certificates, passwords, DUIDs, device files, tokens, signed media
URLs, private captures, original APKs or generated widgets. Preserve third-party
notices and upstream access restrictions.
