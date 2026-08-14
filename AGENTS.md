# Completion rule

- A requested validation item is work to complete, not a disclaimer to repeat.
- Do not report completion while any release-readiness domain is `FAIL` or `UNVERIFIED`.
- When external first-party data is unavailable, use the explicitly supplied acceptance target, label its provenance in the report, and validate it with separate calibration and HOLDOUT seeds.
- Run `npm run release:readiness` before claiming release readiness; it must exit successfully.
