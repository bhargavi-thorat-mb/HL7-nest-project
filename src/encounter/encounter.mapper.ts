import type { Encounter, Patient } from 'fhir/r4';
import type { EvnFields } from '../event/event.service';
import { hl7DateTimeToFhir } from '../patient/patient.mapper';
import {
  PATIENT_CLASS_MAP,
  TRIGGER_STATUS_MAP,
  type Pv1Fields,
} from './encounter.field-map';

// Pure: no Nest or node-hl7-client imports.

export interface EncounterResult {
  patient: Patient;
  encounter: Encounter;
}

/**
 * Thrown when an HL7 code has no FHIR mapping. Kept framework-free so the mapper stays pure;
 * EncounterService turns it into a 400 with the same message.
 */
export class EncounterMappingError extends Error {}

/** Join the non-empty values with a space; undefined if none. */
const joinParts = (...parts: string[]): string | undefined =>
  parts.filter((part) => part.trim()).join(' ') || undefined;

/**
 * PV1 + EVN + ADT trigger (A01-A04, already normalized to uppercase) -> FHIR Encounter.
 * `subject` is left out on purpose: with no storage there is no Patient id to reference.
 */
export function mapToFhirEncounter(
  pv1: Pv1Fields,
  evn: EvnFields,
  trigger: string,
): Encounter {
  const status = TRIGGER_STATUS_MAP[trigger];
  if (!status) {
    throw new EncounterMappingError(
      `Unsupported ADT trigger event "${trigger}": expected one of ${Object.keys(TRIGGER_STATUS_MAP).join(', ')}`,
    );
  }

  const patientClass = PATIENT_CLASS_MAP[pv1.patientClass.trim().toUpperCase()];
  if (!patientClass) {
    throw new EncounterMappingError(
      `Unsupported patient class "${pv1.patientClass}" in PV1.2: expected one of ${Object.keys(PATIENT_CLASS_MAP).join(', ')}`,
    );
  }

  const encounter: Encounter = {
    resourceType: 'Encounter',
    status,
    class: patientClass,
  };

  if (pv1.visitNumber) encounter.identifier = [{ value: pv1.visitNumber }];

  if (pv1.hospitalService)
    encounter.serviceType = { text: pv1.hospitalService };

  const doctor = joinParts(pv1.attendingGivenName, pv1.attendingFamilyName);
  if (doctor) encounter.participant = [{ individual: { display: doctor } }];

  // EVN.6 (event occurred) is the best fallback; EVN.2 (recorded) is the last resort.
  const evnDateTime =
    hl7DateTimeToFhir(evn.eventOccurred) ??
    hl7DateTimeToFhir(evn.recordedDateTime);
  const admit = hl7DateTimeToFhir(pv1.admitDateTime);
  const discharge = hl7DateTimeToFhir(pv1.dischargeDateTime);

  // A03 (discharge): the event marks the end, so only PV1.44 can give a start.
  // A01/A02/A04: the event marks the start; the end comes only from PV1.45.
  const isDischarge = trigger === 'A03';
  const start = isDischarge ? admit : (admit ?? evnDateTime);
  const end = isDischarge ? (discharge ?? evnDateTime) : discharge;
  if (start || end) {
    encounter.period = { ...(start && { start }), ...(end && { end }) };
  }

  const location = joinParts(pv1.pointOfCare, pv1.room, pv1.bed, pv1.facility);
  if (location) encounter.location = [{ location: { display: location } }];

  return encounter;
}
