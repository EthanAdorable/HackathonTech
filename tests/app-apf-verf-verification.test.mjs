import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  compileVerificationSummary,
  documentExtractionSchemas,
  extractionFromFields,
  makeVerificationCacheKey,
  runCrossDocumentVerification,
  runDeterministicVerification,
  sha256Buffer,
  validateExtractionJson,
} from "../lib/document-verification.ts";
import {
  activeExtractionSchemaVersion,
  activePromptVersion,
  activeRubricVersionId,
  documentRubricProfiles,
  getRubricProfile,
} from "../lib/rubrics.ts";

const fixtureDir = process.env.TAMS_VERIFICATION_FIXTURE_DIR ?? "C:\\Users\\maxim\\Downloads";
const fixtures = {
  blankVerf: join(fixtureDir, "FEUA VERF.pdf"),
  filledVerf: join(fixtureDir, "5. DevJam 2.0 2026_VERF (1).jpg"),
  blankApf: join(fixtureDir, "APF.pdf"),
  filledApf: join(fixtureDir, "1. APF_DevJam 2.0_2026.pdf"),
  blankApp: join(fixtureDir, "APP.pdf"),
  filledApp: join(fixtureDir, "2. APP_DEVJAM 2.0_VER 0.pdf"),
};

test("fixture files are present and have stable source signals", () => {
  for (const [label, path] of Object.entries(fixtures)) {
    assert.ok(existsSync(path), `${label} fixture should exist at ${path}`);
    assert.ok(readFileSync(path).length > 10_000, `${label} should not be an empty fixture`);
  }

  const blankVerfText = extractPdfText(readFileSync(fixtures.blankVerf)).replace(/\s+/g, "");
  assert.match(blankVerfText, /RequestDate/i);
  assert.match(blankVerfText, /EquipmentReservation/i);
  assert.match(extractPdfText(readFileSync(fixtures.blankApf)), /ACTIVITY PROFILE/i);
  assert.match(extractPdfText(readFileSync(fixtures.filledApf)), /DevJam 2\.0/i);
  assert.match(extractPdfText(readFileSync(fixtures.blankApp)), /ACTIVITY \/ PROGRAM/i);
  assert.match(extractPdfText(readFileSync(fixtures.filledApp)), /Cybersecurity for Developers/i);
  assert.deepEqual(jpegDimensions(readFileSync(fixtures.filledVerf)), { width: 3000, height: 2451 });
});

test("APP, APF, and VERF profiles expose real schemas and MIME support", () => {
  assert.deepEqual(documentRubricProfiles.map((profile) => profile.documentType).sort(), ["apf", "app", "verf"]);
  assert.equal(getRubricProfile("app").formName, "Activity / Program Proposal");
  assert.equal(getRubricProfile("apf").formName, "Activity Profile");
  assert.equal(getRubricProfile("verf").formName, "Venue and Equipment Reservation Form");
  assert.ok(getRubricProfile("verf").supportedMimeTypes.includes("image/jpeg"));
  assert.ok(documentExtractionSchemas.app.fields.includes("programTitle"));
  assert.ok(documentExtractionSchemas.apf.arrays.includes("programmeRows"));
  assert.ok(documentExtractionSchemas.verf.fields.includes("facilitiesAcknowledgement"));
});

test("blank APP/APF/VERF templates are recognized but block submission", () => {
  const blankExtractions = [
    extractionFromFields({
      documentType: "app",
      completenessStatus: "blank_or_incomplete",
      pageCount: 2,
      hasPage2: true,
      fields: blankFields(getRubricProfile("app").requiredFieldIds, { formCode: "FEUA-FO-FIN-ACC-005/012623/Rev1" }),
      evidence: ["Blank APP template labels and default amounts detected."],
    }),
    extractionFromFields({
      documentType: "apf",
      completenessStatus: "blank_or_incomplete",
      pageCount: 4,
      fields: blankFields(getRubricProfile("apf").requiredFieldIds, { formCode: "FEUA-FO-ACSR-SADU-017-20JUL2020-REV1" }),
      evidence: ["Blank APF template labels and P00,000.00 defaults detected."],
    }),
    extractionFromFields({
      documentType: "verf",
      completenessStatus: "blank_or_incomplete",
      pageCount: 1,
      fields: blankFields(getRubricProfile("verf").requiredFieldIds, { formCode: "FEUA-FO-INST-FO-001/07APRIL2026/REV 1" }),
      evidence: ["Blank VERF template labels and underscores detected."],
    }),
  ];

  for (const extraction of blankExtractions) {
    const validation = validateExtractionJson(extraction);
    assert.equal(validation.ok, true);
    const profile = getRubricProfile(extraction.documentType);
    const results = runDeterministicVerification({ profile, mimeType: profile.supportedMimeTypes[0], extraction });
    assert.equal(results.find((result) => result.checkId === "filled_not_blank").status, "fail");
    assert.equal(results.some((result) => result.status === "fail" && result.blocking), true);
  }
});

test("filled DevJam APP/APF/VERF samples pass critical checks and surface page/cross-document warnings", () => {
  const app = filledAppExtraction();
  const apf = filledApfExtraction();
  const verf = filledVerfExtraction();
  const perDocumentResults = [
    ...runDeterministicVerification({ profile: getRubricProfile("app"), mimeType: "application/pdf", extraction: app }),
    ...runDeterministicVerification({ profile: getRubricProfile("apf"), mimeType: "application/pdf", extraction: apf }),
    ...runDeterministicVerification({ profile: getRubricProfile("verf"), mimeType: "image/jpeg", extraction: verf }),
  ];
  const crossResults = runCrossDocumentVerification([app, apf, verf]);
  const summary = compileVerificationSummary({
    rubricVersionId: activeRubricVersionId,
    documentCount: 3,
    fileSignature: "devjam-fixtures",
    results: [...perDocumentResults, ...crossResults],
  });

  assert.equal(validateExtractionJson(app).ok, true);
  assert.equal(validateExtractionJson(apf).ok, true);
  assert.equal(validateExtractionJson(verf).ok, true);
  assert.equal(perDocumentResults.some((result) => result.severity === "critical" && result.status === "fail"), false);
  assert.equal(perDocumentResults.find((result) => result.checkId === "app_page2_optional_absent").status, "warning");
  assert.equal(crossResults.find((result) => result.checkId === "cross_title_compatible").status, "pass");
  assert.equal(crossResults.find((result) => result.checkId === "cross_venue_compatible").status, "pass");
  assert.equal(crossResults.find((result) => result.checkId === "cross_budget_compatible").status, "pass");
  assert.equal(summary.readyForSadu, true);
  assert.ok(summary.warningCount >= 1);
});

test("APP page 2 is required only when cash advance evidence is present", () => {
  const ordinaryApp = filledAppExtraction();
  const ordinaryResults = runDeterministicVerification({ profile: getRubricProfile("app"), mimeType: "application/pdf", extraction: ordinaryApp });
  assert.equal(ordinaryResults.find((result) => result.checkId === "app_page2_optional_absent").status, "warning");
  assert.equal(ordinaryResults.some((result) => result.checkId === "app_page2_required_when_cash_advance" && result.status === "fail"), false);

  const cashAdvanceApp = extractionFromFields({
    documentType: "app",
    completenessStatus: "filled",
    pageCount: 1,
    hasPage2: false,
    fields: { ...ordinaryApp.documentData, cashAdvanceRequested: true, page2FieldsRequired: true },
    evidence: ["Cash advance requested but APP page 2 is absent."],
  });
  const cashResults = runDeterministicVerification({ profile: getRubricProfile("app"), mimeType: "application/pdf", extraction: cashAdvanceApp });
  assert.equal(cashResults.find((result) => result.checkId === "app_page2_required_when_cash_advance").status, "fail");
});

test("missing signatures are deferred to SADU review instead of blocking submission", () => {
  const profile = getRubricProfile("verf");
  const extraction = extractionFromFields({
    documentType: "verf",
    completenessStatus: "filled",
    confidence: 0.9,
    fields: {
      formCode: "FEUA-FO-INST-FO-001/07APRIL2026/REV 1",
      requestDate: "June 1, 2026",
      department: "CCSMA",
      activityDate: "June 17, 2026",
      activityTime: "9:00 AM - 2:00 PM",
      activityName: "DevJam 2.0: Cybersecurity for Developers",
      internalParticipantCount: 100,
      venueReservations: ["MPR 203"],
      equipmentReservations: ["Chairs", "Sound System"],
      ingressDateTime: "June 17, 2026 8:00 AM",
      egressDateTime: "June 17, 2026 3:00 PM",
      requesterSignatureName: null,
      directorSignatureName: null,
      facilitiesAcknowledgement: null,
    },
    evidence: ["Filled VERF details; signatures pending SADU review."],
  });
  const results = runDeterministicVerification({ profile, mimeType: "image/jpeg", extraction });
  const signatureResult = results.find((result) => result.checkId === "signatures_detected");
  const summary = compileVerificationSummary({
    rubricVersionId: activeRubricVersionId,
    documentCount: 1,
    fileSignature: "verf-signature-warning",
    results,
  });

  assert.equal(signatureResult.status, "manual_review");
  assert.equal(signatureResult.severity, "warning");
  assert.equal(signatureResult.blocking, false);
  assert.equal(results.some((result) => result.status === "fail" && result.blocking), false);
  assert.equal(summary.readyForSadu, true);
  assert.equal(summary.status, "needs_human_review");
});

test("stale versions and stale hashes fail closed through deterministic summary inputs", () => {
  const profile = getRubricProfile("app");
  const extraction = filledAppExtraction();
  const staleResults = runDeterministicVerification({
    profile,
    mimeType: "application/pdf",
    extraction,
    rubricVersionId: "old-rubric",
    extractionSchemaVersion: activeExtractionSchemaVersion,
    promptVersion: activePromptVersion,
  });
  assert.equal(staleResults.find((result) => result.checkId === "rubric_version_current").status, "fail");

  const hash = sha256Buffer(readFileSync(fixtures.filledApp));
  const cacheKey = makeVerificationCacheKey({ sha256: hash, rubricVersionId: activeRubricVersionId });
  assert.ok(cacheKey.includes(hash));
  assert.ok(cacheKey.includes(activeRubricVersionId));
});

function filledAppExtraction() {
  return extractionFromFields({
    documentType: "app",
    completenessStatus: "filled",
    extractionMode: "text_pdf",
    pageCount: 1,
    hasPage2: false,
    confidence: 0.94,
    fields: {
      formCode: "FEUA-FO-FIN-ACC-005/012623/Rev1",
      apfNumber: "2",
      programTitle: "DevJam 2.0: Cybersecurity for Developers",
      submissionDate: "8-Sep-25",
      startDateTime: "June 17, 2026 9:00 AM",
      endDateTime: "June 17, 2026 2:00 PM",
      venue: "Multi Purpose Room (MPR)",
      objectives: ["Equip students with foundational cybersecurity knowledge and practical skills."],
      budgetCategories: ["Food", "Materials"],
      totalProposedBudget: 2900,
      preparedBy: "KIMBERLY D. ILUSTRE",
      cashAdvanceRequested: false,
    },
    evidence: ["DevJam 2.0: Cybersecurity for Developers", "Total P2,900.00"],
  });
}

function filledApfExtraction() {
  return extractionFromFields({
    documentType: "apf",
    completenessStatus: "filled",
    extractionMode: "text_pdf",
    pageCount: 5,
    confidence: 0.93,
    fields: {
      formCode: "FEUA-FO-ACSR-SADU-017-20JUL2020-REV1",
      activityTitle: "DevJam 2.0: Cybersecurity for Developers",
      venue: "MPR",
      startDateTime: "June 17, 2026 9am",
      endDateTime: "June 17, 2026 2pm",
      targetParticipantCount: 100,
      activityOverview: "One-day keynote talk and hands-on workshop.",
      mainObjectives: "Equip students with foundational cybersecurity knowledge.",
      specificObjectives: ["Introduce cybersecurity concepts", "Raise awareness of cyber threats"],
      programmeRows: [{ time: "10:30am - 11:30am", programPart: "Keynote Talk", duration: "1 hour", personInCharge: "Guest Speaker" }],
      activityDescription: "Exclusive JPCS event designed to develop cybersecurity awareness.",
      targetParticipants: "100 members of IT department mainly Cybersecurity course",
      expenseSections: [{ fund: "SADU", total: 2900 }],
      revenueSections: [{ source: "Registration", total: 0 }],
      workingCommittees: [{ committee: "Technicals", lead: "Technicals Committee" }],
      preparedBy: "Ethan Adorable",
      reviewedBy: "JPCS Adviser",
      notedBy: "SADU",
      totalBudget: 2900,
    },
    evidence: ["DevJam 2.0: Cybersecurity for Developers", "P2,900.00"],
  });
}

function filledVerfExtraction() {
  return extractionFromFields({
    documentType: "verf",
    completenessStatus: "filled",
    extractionMode: "vision_ocr",
    pageCount: 1,
    confidence: 0.82,
    fields: {
      formCode: "FEUA-FO-INST-FO-001/01AUG2019/REV 0",
      requestDate: "May 7, 2026",
      department: "JPCS",
      activityDate: "June 18, 2026",
      activityTime: "7am - 4pm",
      activityName: "DevJam 2.0",
      internalParticipantCount: 100,
      externalParticipantCount: 0,
      venueReservations: ["MPR 203", "MPR 204", "MPR 205"],
      equipmentReservations: ["Chairs 120", "Tables 5", "Sound System", "Extension Cord", "Stage", "Panel Board 4", "White Screen"],
      ingressDateTime: "June 17, 2026 5pm",
      egressDateTime: "June 18, 2026 2pm",
      additionalManpower: ["Service Crew 2"],
      supportingDocuments: [],
      requesterSignatureName: "Ethan Adorable",
      directorSignatureName: "signed 05/07/26",
      facilitiesAcknowledgement: "RB Justine L. Baniqued",
      status: "Pending",
    },
    evidence: ["Handwritten DevJam 2.0 VERF with pending status checked."],
  });
}

function blankFields(fieldIds, overrides = {}) {
  const arrayFieldIds = new Set([
    "objectives",
    "budgetCategories",
    "programmeRows",
    "specificObjectives",
    "expenseSections",
    "revenueSections",
    "workingCommittees",
    "venueReservations",
    "equipmentReservations",
  ]);
  return Object.fromEntries(fieldIds.map((fieldId) => [fieldId, overrides[fieldId] ?? (arrayFieldIds.has(fieldId) ? [] : "________")]));
}

function extractPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const chunks = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const stream = Buffer.from(match[1], "latin1");
    try {
      chunks.push(inflateSync(stream).toString("latin1"));
    } catch {
      chunks.push(stream.toString("latin1"));
    }
  }
  chunks.push(raw);
  const content = chunks.join("\n");
  const parenthesizedText = [...content.matchAll(/\((?:\\.|[^()])*\)/g)]
    .map((match) => match[0].slice(1, -1).replace(/\\([()\\])/g, "$1"))
    .join("");
  return (parenthesizedText || content)
    .replace(/[^\x20-\x7E\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) offset += 1;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions not found.");
}
