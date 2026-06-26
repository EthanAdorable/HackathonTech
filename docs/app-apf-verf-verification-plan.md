# APP/APF/VERF Verification Plan

## Summary

Implement first-class document verification profiles for APP, APF, and VERF, covering both blank-template detection and filled-submission verification.

This extends the existing document verification orchestration goals:

- Extraction remains factual only.
- Rubrics are code-seeded and versioned.
- Codex-LB is the only AI extraction path.
- Verification fails closed when extraction, schema validation, rubric lookup, or Codex-LB availability fails.
- Submission readiness depends on the latest verification for the current file hashes and rubric versions.
- SADU reviewers receive compiled evidence, blockers, warnings, rubric versions, and run timestamps.

## Source Fixtures

Use these known samples as verification fixtures:

- Blank VERF: `C:\Users\maxim\Downloads\FEUA VERF.pdf`
- Filled VERF: `C:\Users\maxim\Downloads\5. DevJam 2.0 2026_VERF (1).jpg`
- Blank APF: `C:\Users\maxim\Downloads\APF.pdf`
- Filled APF: `C:\Users\maxim\Downloads\1. APF_DevJam 2.0_2026.pdf`
- Blank APP: `C:\Users\maxim\Downloads\APP.pdf`
- Filled APP: `C:\Users\maxim\Downloads\2. APP_DEVJAM 2.0_VER 0.pdf`

## Key Changes

- Replace placeholder rubric profiles in `lib/rubrics.ts` with real document profiles:
  - `app`: Activity / Program Proposal
  - `apf`: Activity Profile
  - `verf`: Venue and Equipment Reservation Form
- Add image/scanned-form support for VERF:
  - Accept `image/jpeg` and `image/png` for VERF.
  - Use Codex-LB vision/OCR-style extraction when the file is an image or when PDF text extraction is weak.
  - Validate structured JSON before saving any extraction.
- Keep APP page 2 optional:
  - APP page 2 is not required for ordinary APP verification.
  - APP page 2 becomes required only when the filing requests cash advance or funding-detail sections that depend on it.
- Extend upload requirements so APP, APF, and VERF appear as distinct document slots.
- Keep verification route ownership separate from TAMS Guide. TAMS Guide may summarize stored results later, but must not own gating.

## Extraction Schemas

APP extraction should include:

- Document type and form code/version.
- APF number.
- Program title.
- Submission/proposal date.
- Start date and time.
- End date and time.
- Venue.
- Objectives.
- Budget categories.
- Total proposed budget.
- Approver/reviewer/preparer fields.
- Conditional page 2 fields only when cash advance or funding-detail evidence is present.

APF extraction should include:

- Document type and form code/version.
- Activity title.
- Venue.
- Start date and time.
- End date and time.
- Target participant count.
- Activity overview.
- Main and specific objectives.
- Programme rows with time, program part, duration, and person-in-charge.
- Activity description.
- Target participants.
- Expense and revenue sections.
- Working committees.
- Prepared/reviewed/noted-by fields and signatures.

VERF extraction should include:

- Document type and form code/version.
- Request date.
- Department.
- Activity date.
- Activity time.
- Activity name/title/purpose.
- Internal and external participant counts.
- Selected venue reservations.
- Selected equipment reservations and quantities.
- Setup ingress date/time.
- Setup egress date/time.
- Additional manpower selections and quantities.
- Supporting document selections.
- Requester signature/name.
- Director/professor signature/name.
- Facilities acknowledgement.
- Status.

## Verification Rules

Blank forms:

- Recognize blank APP/APF/VERF templates as the correct document type.
- Mark them as `blank_or_incomplete`.
- Block SADU submission when a required document slot contains a blank form.

Filled forms:

- Critical checks:
  - Correct document type.
  - Supported MIME type.
  - Current or accepted form code/version.
  - Required fields present.
  - Required values are not placeholders, underscores, default zeroes, or template labels.
  - Dates/times are parseable.
  - Start/end/ingress/egress times are internally consistent.
  - Required signatures or acknowledgements are detected where applicable.
- Warnings:
  - Low OCR or extraction confidence.
  - Minor naming differences such as `MPR` vs `Multi Purpose Room`.
  - Optional APP page 2 missing when no cash advance or page-2-only funding requirement is detected.

Cross-document checks:

- APP, APF, and VERF should refer to the same event title or a clearly compatible event title.
- Dates and times should match or be explainably compatible.
- Venue should match or be explainably compatible.
- Participant counts should match or produce a warning/blocker depending on severity.
- APP budget total should match APF budget total when both are present.
- VERF equipment/venue needs should not contradict APF programme/venue details.

## Implementation Steps

1. Add real APP/APF/VERF rubric profiles.
2. Add document-type-specific extraction schema definitions.
3. Extend MIME support so VERF can accept image files.
4. Update the verification route to choose extraction mode:
   - text PDF extraction for clean PDFs
   - image/OCR extraction for JPG/PNG and weak-text scanned PDFs
5. Persist document-type-specific extraction JSON in the existing Convex extraction run table.
6. Persist deterministic and AI-assisted per-check results in the existing verification results table.
7. Compile per-document and cross-document results into the application-level summary.
8. Wire APP/APF/VERF verification state into student readiness and submit/resubmit gating.
9. Add SADU reviewer evidence for each document plus cross-document blockers/warnings.
10. Keep cache reuse by `sha256 + rubricVersionId + extractionSchemaVersion + promptVersion`.

## Test Plan

- Unit-test rubric lookup for `app`, `apf`, and `verf`.
- Unit-test valid and invalid extraction schemas for APP, APF, and VERF.
- Test blank-template detection for all three blank samples.
- Test filled-sample extraction for APF, APP, and image-based VERF.
- Test APP page 2 conditional logic:
  - no blocker when page 2 is absent and no cash advance/funding-detail requirement exists
  - blocker when page 2 is required but absent
- Test cross-document consistency checks for title, date/time, venue, participants, and budget.
- Test route failures:
  - missing Codex-LB key
  - Codex-LB timeout
  - invalid AI JSON
  - unsupported MIME type
  - stale rubric version
  - stale file hash
- Extend `demo:check` so SADU submission is blocked with blank, stale, inconsistent, or critically incomplete APP/APF/VERF files and allowed when critical checks pass.
- Run:
  - `corepack pnpm convex:codegen`
  - `corepack pnpm typecheck`
  - `corepack pnpm lint`
  - `corepack pnpm test`
  - `corepack pnpm demo:check`
  - `corepack pnpm build`

## Assumptions

- APP page 2 is optional unless the filing requests cash advance or funding-detail sections that require it.
- VERF filled submissions may arrive as scanned JPG/PNG or flattened PDF, so OCR/vision extraction is required.
- SADU remains the final approve/deny authority; verification only controls readiness and evidence.
- Passing means no critical failures. Warnings and non-critical recommendations may proceed to SADU.
