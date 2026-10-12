import type { Attachment, DocumentReference, Patient } from 'fhir/r4';
import type { EvnFields } from '../event/event.service';
import { hl7DateTimeToFhirInstant } from '../patient/patient.mapper';
import {
  DOC_STATUS_MAP,
  DOC_TYPE_LOINC_MAP,
  ED_CONTENT_TYPE_MAP,
  LOINC,
  TRIGGER_STATUS_MAP,
  type TxaFields,
} from './document-reference.field-map';

// Pure: no Nest or node-hl7-client imports (Buffer is a Node built-in).

export interface DocumentReferenceResult {
  patient: Patient;
  documentReference: DocumentReference;
}

/** One OBX's document content, as read by the service. OBX.2 is already checked and uppercased. */
export type ObxContent =
  | {
      valueType: 'TX' | 'FT';
      title: string; // OBX.3.2
      repetitions: string[]; // OBX.5, one entry per ~ repetition, escapes already decoded
    }
  | {
      valueType: 'ED';
      title: string; // OBX.3.2
      typeOfData: string; // OBX.5.2 (HL7 table 0191, e.g. AP)
      dataSubtype: string; // OBX.5.3 (HL7 table 0291, e.g. PDF)
      encoding: string; // OBX.5.4 (HL7 table 0299: A, Hex, Base64)
      data: string; // OBX.5.5
    };

/**
 * Thrown when HL7 content cannot be mapped. Kept framework-free so the mapper stays pure;
 * DocumentReferenceService turns it into a 400 with the same message.
 */
export class DocumentMappingError extends Error {}

/** Join the non-empty values with a space; undefined if none. */
const joinParts = (...parts: string[]): string | undefined =>
  parts.filter((part) => part.trim()).join(' ') || undefined;

/**
 * TX/FT text for one OBX: repetitions joined with "\n", then the \.br\ line-break command
 * turned into "\n". node-hl7-client's toString() already decodes \F\ \S\ \R\ \E\ \T\ and \Xhh\,
 * but leaves \.br\ as is.
 * Known limits:
 *   - an escaped \E\.br\E\ decodes to a literal \.br\ and also becomes a newline;
 *   - an unescaped ^ in the text is read as a component separator and truncates the
 *     repetition there (the sender must send \S\).
 */
export function hl7TextToPlain(repetitions: string[]): string {
  return repetitions.join('\n').replace(/\\\.br\\/g, '\n');
}

/** ED data (OBX.5.5) -> base64 for FHIR Attachment.data, by ED encoding (OBX.5.4). */
export function edDataToBase64(encoding: string, data: string): string {
  switch (encoding.trim().toUpperCase()) {
    case 'BASE64':
      return data;
    case 'A': // ASCII text
      return Buffer.from(data, 'utf8').toString('base64');
    case 'HEX':
      // Buffer.from(..., 'hex') silently drops invalid input, so check it first.
      if (!/^(?:[0-9a-fA-F]{2})*$/.test(data)) {
        throw new DocumentMappingError(
          'ED data in OBX.5.5 is not valid hex (encoding Hex)',
        );
      }
      return Buffer.from(data, 'hex').toString('base64');
    default:
      throw new DocumentMappingError(
        `Unsupported ED encoding "${encoding}" in OBX.5.4: expected Base64, A or Hex`,
      );
  }
}

function buildContent(
  trigger: string,
  contents: ObxContent[],
  headerTitle: string,
): DocumentReference['content'] {
  if (contents.length === 0) {
    // T01 announces a document without its content; T11 cancels one. Only T02 must carry it.
    if (trigger === 'T02') {
      throw new DocumentMappingError(
        'MDM^T02 requires at least one OBX segment with the document content',
      );
    }
    return [{ attachment: { title: headerTitle } }];
  }

  const texts = contents.filter((c) => c.valueType !== 'ED');
  const eds = contents.filter((c) => c.valueType === 'ED');
  if (texts.length > 0 && eds.length > 0) {
    throw new DocumentMappingError(
      'Cannot mix text (TX/FT) and ED OBX values in one document',
    );
  }

  if (texts.length > 0) {
    // All text OBX segments form one plain-text document, in order.
    const text = texts.map((c) => hl7TextToPlain(c.repetitions)).join('\n');
    const title = texts.find((c) => c.title)?.title;
    return [
      {
        attachment: {
          contentType: 'text/plain',
          data: Buffer.from(text, 'utf8').toString('base64'),
          ...(title && { title }),
        },
      },
    ];
  }

  // One attachment per ED value (e.g. a PDF).
  return eds.map((ed) => {
    const contentType =
      ED_CONTENT_TYPE_MAP[
        `${ed.typeOfData.trim().toUpperCase()}^${ed.dataSubtype.trim().toUpperCase()}`
      ];
    const attachment: Attachment = {
      ...(contentType && { contentType }),
      data: edDataToBase64(ed.encoding, ed.data),
      ...(ed.title && { title: ed.title }),
    };
    return { attachment };
  });
}

/**
 * TXA + EVN + MDM trigger (T01/T02/T11, already uppercased) + OBX contents -> DocumentReference.
 * `subject` is left out on purpose: with no storage there is no Patient id to reference.
 */
export function mapToFhirDocumentReference(
  txa: TxaFields,
  evn: EvnFields,
  trigger: string,
  contents: ObxContent[],
): DocumentReference {
  const status = TRIGGER_STATUS_MAP[trigger];
  if (!status) {
    throw new DocumentMappingError(
      `Unsupported MDM trigger event "${trigger}": expected one of ${Object.keys(TRIGGER_STATUS_MAP).join(', ')}`,
    );
  }

  const typeCode = txa.documentTypeCode.trim();
  const loinc = DOC_TYPE_LOINC_MAP[typeCode.toUpperCase()];
  const type = loinc
    ? {
        coding: [{ system: LOINC, code: loinc.code, display: loinc.display }],
        text: txa.documentTypeText || loinc.display,
      }
    : { text: typeCode };

  // Unmapped TXA.17 values simply leave docStatus out.
  const docStatus = DOC_STATUS_MAP[txa.completionStatus.trim().toUpperCase()];

  // date is an instant (time + timezone required): use the first candidate that qualifies.
  const date = [
    txa.originationDateTime, // TXA.6
    txa.activityDateTime, // TXA.4
    evn.recordedDateTime, // EVN.2
  ]
    .map(hl7DateTimeToFhirInstant)
    .find(Boolean);

  const author = joinParts(txa.originatorGivenName, txa.originatorFamilyName);

  // T01/T11 with no OBX: TXA.2 text, else the LOINC display, else the raw code.
  const headerTitle =
    txa.documentTypeText || loinc?.display || txa.documentTypeCode;
  const content = buildContent(trigger, contents, headerTitle);

  // Built in R4 element order; empty values are left out.
  return {
    resourceType: 'DocumentReference',
    masterIdentifier: { value: txa.uniqueDocumentNumber },
    status,
    ...(docStatus && { docStatus }),
    type,
    ...(date && { date }),
    ...(author && { author: [{ display: author }] }),
    content,
  };
}
