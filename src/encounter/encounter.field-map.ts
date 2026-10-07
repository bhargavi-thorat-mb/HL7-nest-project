import type { Coding, Encounter } from 'fhir/r4';
import type { Hl7FieldSpec } from '../hl7-shared/hl7-parser.service';

// Data only: where each value lives in HL7 and what HL7 codes mean in FHIR.
// PV1 positions are confirmed against node-hl7-client's SEGMENT_SPECS and a parsed sample.

/**
 * PV1 (Patient Visit) fields read for an Encounter.
 * get() on a composite field (PV1.3, PV1.7) returns only its first component, so each
 * component we need has its own path. PV1.7 repeats (~); these paths read the first doctor.
 */
export const PV1_FIELD_MAP = {
  patientClass: { path: 'PV1.2', required: true }, // HL7 table 0004 (I, O, E, ...)
  pointOfCare: { path: 'PV1.3.1' }, // assigned location: unit/ward
  room: { path: 'PV1.3.2' },
  bed: { path: 'PV1.3.3' },
  facility: { path: 'PV1.3.4' },
  attendingFamilyName: { path: 'PV1.7.2' }, // attending doctor (XCN)
  attendingGivenName: { path: 'PV1.7.3' },
  hospitalService: { path: 'PV1.10' }, // HL7 table 0069 (e.g. MED)
  visitNumber: { path: 'PV1.19.1' },
  admitDateTime: { path: 'PV1.44' },
  dischargeDateTime: { path: 'PV1.45' },
} as const satisfies Record<string, Hl7FieldSpec>;

/** PV1 values as raw HL7 strings, keyed like PV1_FIELD_MAP. */
export type Pv1Fields = Record<keyof typeof PV1_FIELD_MAP, string>;

const ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

/** PV1.2 patient class (HL7 table 0004) -> FHIR Encounter.class. Other codes are rejected. */
export const PATIENT_CLASS_MAP: Record<string, Coding> = {
  I: { system: ACT_CODE, code: 'IMP' }, // inpatient
  O: { system: ACT_CODE, code: 'AMB' }, // outpatient -> ambulatory
  E: { system: ACT_CODE, code: 'EMER' }, // emergency
};

/** ADT trigger event (MSH.9.2) -> FHIR Encounter.status. */
export const TRIGGER_STATUS_MAP: Record<string, Encounter['status']> = {
  A01: 'in-progress', // admit
  A02: 'in-progress', // transfer
  A03: 'finished', // discharge
  A04: 'arrived', // register outpatient
};
