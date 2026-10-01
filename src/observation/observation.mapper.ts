import type { CodeableConcept, Observation, Patient } from 'fhir/r4';
import { hl7DateToFhir } from '../patient/patient.mapper';

// Pure helpers for ORU^R01 (unsolicited observation result): no Nest or node-hl7-client imports.
//
// ORU structure used here:
//   OBR = the order/request ("what was ordered"), one per test panel
//   OBX = one result line each; a message usually carries several
// Positions follow the v2.5 spec (confirmed against node-hl7-client's SEGMENT_SPECS).

/** OBR fields we read. */
export interface ObrFields {
  code: string; // OBR.4.1 - universal service identifier (what was ordered)
  display: string; // OBR.4.2
  codeSystem: string; // OBR.4.3 - e.g. LN = LOINC
  observationDateTime: string; // OBR.7 - observation date/time (specimen collection)
}

/** OBX fields we read. */
export interface ObxFields {
  valueType: string; // OBX.2 - data type of OBX.5 (CWE, NM, ST, ...)
  code: string; // OBX.3.1 - observation identifier (what was observed)
  display: string; // OBX.3.2
  codeSystem: string; // OBX.3.3
  valueCode: string; // OBX.5.1 - the result; for CWE it is code^text^system
  valueDisplay: string; // OBX.5.2
  valueCodeSystem: string; // OBX.5.3
  abnormalFlag: string; // OBX.8 - interpretation code (HL7 table 0078)
  observationDateTime: string; // OBX.14 - date/time of the observation
}

export interface OruResult {
  patient: Patient;
  observations: Observation[];
}

// HL7 v2 coding-system names (table 0396) -> FHIR system URIs.
// Only the systems we have seen so far; unknown names leave `system` out rather than
// putting a non-URI string there.
const CODING_SYSTEMS: Record<string, string> = {
  LN: 'http://loinc.org',
  SCT: 'http://snomed.info/sct',
};

/** Build a CodeableConcept from an HL7 code^text^system triple; undefined if all empty. */
export function toCodeableConcept(
  code: string,
  display: string,
  codingSystem: string,
): CodeableConcept | undefined {
  if (!code && !display) return undefined;
  const system = CODING_SYSTEMS[codingSystem.trim().toUpperCase()];
  return {
    coding: [
      {
        ...(system && { system }),
        ...(code && { code }),
        ...(display && { display }),
      },
    ],
    ...(display && { text: display }),
  };
}

const INTERPRETATION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

// HL7 table 0078 (abnormal flags) -> FHIR ObservationInterpretation. The codes are the same
// strings in both; FHIR just needs the system URI and a display.
const INTERPRETATIONS: Record<string, string> = {
  N: 'Normal',
  A: 'Abnormal',
  AA: 'Critical abnormal',
  H: 'High',
  HH: 'Critical high',
  L: 'Low',
  LL: 'Critical low',
};

/** Empty or unrecognised flags return undefined, so `interpretation` is left out. */
export function mapAbnormalFlag(hl7Flag: string): CodeableConcept | undefined {
  const code = hl7Flag.trim().toUpperCase();
  const display = INTERPRETATIONS[code];
  if (!display) return undefined;
  return { coding: [{ system: INTERPRETATION_SYSTEM, code, display }] };
}

/**
 * One OBX -> one FHIR Observation. Only OBX.2 = CWE (coded value) is supported; the
 * service rejects other value types before calling this.
 *
 * `subject` is intentionally omitted: with no storage there is no Patient id to point at,
 * and a placeholder like "Patient/unknown" would look like a resolvable reference.
 */
export function mapToFhirObservation(
  obr: ObrFields,
  obx: ObxFields,
): Observation {
  const observation: Observation = {
    resourceType: 'Observation',
    // PLACEHOLDER: the result status belongs in OBX.11 (F=final, P=preliminary, C=corrected),
    // which this sample leaves empty. Confirm the right default with a mentor before relying on it.
    status: 'final',
    // OBX.3 says what this result is; OBR.4 (the ordered test) is only a fallback.
    code:
      toCodeableConcept(obx.code, obx.display, obx.codeSystem) ??
      toCodeableConcept(obr.code, obr.display, obr.codeSystem) ??
      {},
  };

  const value = toCodeableConcept(
    obx.valueCode,
    obx.valueDisplay,
    obx.valueCodeSystem,
  );
  if (value) observation.valueCodeableConcept = value;

  const interpretation = mapAbnormalFlag(obx.abnormalFlag);
  if (interpretation) observation.interpretation = [interpretation];

  // Prefer the result's own time (OBX.14), else the OBR observation time (OBR.7).
  // Only the date part is kept, same as the PID birthDate conversion.
  const effective =
    hl7DateToFhir(obx.observationDateTime) ??
    hl7DateToFhir(obr.observationDateTime);
  if (effective) observation.effectiveDateTime = effective;

  return observation;
}
