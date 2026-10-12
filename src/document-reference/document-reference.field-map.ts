import type { DocumentReference } from 'fhir/r4';
import type { Hl7FieldSpec } from '../hl7-shared/hl7-parser.service';

// Data only: where each value lives in HL7 and what HL7 codes mean in FHIR.
// TXA positions are confirmed against node-hl7-client's SEGMENT_SPECS and a parsed sample.

/**
 * TXA (Transcription Document Header) fields read for a DocumentReference.
 * get() on a composite field returns its first component, so 'TXA.2' reads the code (TXA.2.1)
 * and 'TXA.12' the entity identifier (TXA.12.1); the required-field 400 then names TXA.2 / TXA.12.
 * TXA.9 can repeat (~); these paths read the first originator.
 */
export const TXA_FIELD_MAP = {
  documentTypeCode: { path: 'TXA.2', required: true }, // HL7 table 0270 (DS, CN, PN, ...)
  documentTypeText: { path: 'TXA.2.2' },
  activityDateTime: { path: 'TXA.4' },
  originationDateTime: { path: 'TXA.6' },
  originatorFamilyName: { path: 'TXA.9.2' }, // author (XCN)
  originatorGivenName: { path: 'TXA.9.3' },
  uniqueDocumentNumber: { path: 'TXA.12', required: true },
  completionStatus: { path: 'TXA.17', required: true }, // HL7 table 0271 (AU, LA, IP, DI, ...)
} as const satisfies Record<string, Hl7FieldSpec>;

/** TXA values as raw HL7 strings, keyed like TXA_FIELD_MAP. */
export type TxaFields = Record<keyof typeof TXA_FIELD_MAP, string>;

/** MDM trigger event (MSH.9.2) -> DocumentReference.status. */
export const TRIGGER_STATUS_MAP: Record<string, DocumentReference['status']> = {
  T01: 'current', // original document notification (header only)
  T02: 'current', // original document notification and content
  T11: 'entered-in-error', // document cancel notification
};

/** TXA.17 completion status (HL7 table 0271) -> DocumentReference.docStatus. Others: omitted. */
export const DOC_STATUS_MAP: Record<string, DocumentReference['docStatus']> = {
  AU: 'final', // authenticated
  LA: 'final', // legally authenticated
  IP: 'preliminary', // in progress
  DI: 'preliminary', // dictated
};

export const LOINC = 'http://loinc.org';

/** TXA.2 document type (HL7 table 0270) -> LOINC document type. Unknown codes: type.text only. */
export const DOC_TYPE_LOINC_MAP: Record<
  string,
  { code: string; display: string }
> = {
  CN: { code: '11488-4', display: 'Consult note' },
  DS: { code: '18842-5', display: 'Discharge summary' },
  HP: { code: '34117-2', display: 'History and physical note' },
  PN: { code: '11506-3', display: 'Progress note' },
  OP: { code: '11504-8', display: 'Operative note' },
  LR: { code: '11502-2', display: 'Laboratory report' },
  RR: { code: '18748-4', display: 'Diagnostic imaging report' },
};

/** ED type of data ^ data subtype (OBX.5.2^OBX.5.3) -> MIME type. Unknown: contentType omitted. */
export const ED_CONTENT_TYPE_MAP: Record<string, string> = {
  'AP^PDF': 'application/pdf',
  'IM^PNG': 'image/png',
  'TEXT^PLAIN': 'text/plain',
};
