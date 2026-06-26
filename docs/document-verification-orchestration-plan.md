# Document Verification Orchestration Layer

## Summary

Build a separate, auditable verification subsystem for submitted PDF, DOCX, and Excel files. Students upload required files, Codex-LB extracts structured JSON, deterministic and AI-assisted checks compare the extraction against a code-seeded versioned rubric, and `Submit to SADU` remains blocked until all critical checks pass. SADU/human reviewers still make the final approve/deny decision.

## Key Changes

- Add Convex-backed records for `uploadedDocuments`, `extractionRuns`, `verificationResults`, and `compiledVerificationSummaries`, indexed by `applicationId`.
- Store uploaded source files in Convex storage with metadata: `storageId`, `sha256`, `mimeType`, `sizeBytes`, `originalName`, `documentType`, `uploadedBy`, `applicationId`, and `rubricVersionId`.
- Add `lib/rubrics.ts` as the code-seeded rubric registry. Since final templates arrive later, v1 should support placeholder document profiles with stable IDs, extraction schema versions, required/critical check definitions, and prompt versions.
- Keep extraction factual: normalized fields, evidence citations, confidence, missing/unknown fields, and source locations such as page, paragraph, sheet, cell, or text span.
- Keep recommendations in verification results, not extraction output. Results should include per-check status, severity, blocking flag, evidence, recommendation, deterministic/AI-assisted marker, confidence, and failure reason.
- Use Codex-LB only for AI calls through `CODEX_LB_API_KEY`, `CODEX_LB_BASE_URL`, and `CODEX_LB_MODEL`. Verification must fail closed if Codex-LB is unavailable; no mock fallback may mark a submission as passable.
- Add a verification API/orchestration route separate from `app/api/tams-guide/route.ts`; TAMS Guide can summarize stored results later but should not own gating.
- Update the File Event UI upload tiles into real upload slots and replace the current `completionPercent < 70` submit gate with "latest verification for current file hashes and rubric version has no critical failures."
- Add reviewer-facing verification evidence in SADU insights: compiled summary, blocking findings, warnings, rubric version, and extraction/run timestamps.
- Use Convex CLI/codegen after schema changes. If Railway-hosted testing is needed, commit and push before testing the deployed Railway app.

## Verification Flow

- Upload file to Convex storage and record metadata plus hash.
- Start an async-style verification run with statuses: `queued`, `extracting`, `extracted`, `verifying`, `ready_for_sadu`, `blocked_critical`, `needs_human_review`, `failed_schema`, `failed_ai_timeout`, or `failed_rubric_unavailable`.
- Parse/extract document content by file type, then send compact extracted text/tables to Codex-LB for schema-constrained JSON.
- Validate AI JSON at runtime before saving. Invalid output creates a failed run, never a coerced pass.
- Run deterministic checks first, then AI-assisted semantic checks only where needed.
- Cache by `sha256 + rubricVersionId + extractionSchemaVersion + promptVersion` so unchanged files do not rerun unnecessarily.
- Compile per-document results into one application-level summary used by the student submit gate and SADU review panel.

## Test Plan

- Unit-test rubric lookup, file metadata validation, hash-based freshness, critical pass/fail aggregation, and deterministic checks.
- Add schema-validation tests for valid, malformed, missing-field, and extra-field extraction JSON.
- Add route tests for missing Codex-LB key, Codex-LB timeout, invalid AI JSON, unsupported MIME type, and stale rubric version.
- Extend `demo:check` to assert that SADU submission is blocked with missing/failed critical verification and allowed when all critical checks pass.
- Run `corepack pnpm lint`, `corepack pnpm demo:check`, `corepack pnpm build`, and Convex codegen/typecheck after implementation.

## Assumptions

- Final standardized templates/documents will be supplied later, so the first implementation should make document profiles data-driven rather than hardcoding the final list.
- Passing means no critical failures; warnings and non-critical recommendations may proceed to SADU.
- Current dirty worktree changes are pre-existing and should be preserved during implementation.
- Clerk is not currently part of this repo's active auth path, so no Clerk work is included unless future changes introduce it.
