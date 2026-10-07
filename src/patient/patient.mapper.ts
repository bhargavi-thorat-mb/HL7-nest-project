import type { Patient } from 'fhir/r4';

// Pure helpers: no Nest or node-hl7-client imports, so they are trivial to unit test.

/** The PID (Patient Identification) fields we read, as raw HL7 strings. */
export interface PidFields {
  id: string; // PID.3.1  - ID number
  assigningAuthority: string; // PID.3.4  - who issued the ID (e.g. the hospital)
  idType: string; // PID.3.5  - identifier type code (e.g. MR = medical record number)
  familyName: string; // PID.5.1  - family name
  givenName: string; // PID.5.2  - given name
  birthDate: string; // PID.7    - date/time of birth (YYYYMMDD[HHMM...])
  sex: string; // PID.8    - administrative sex (HL7 table 0001)
}

/** HL7 table 0001 (M/F/O/...) -> FHIR administrative gender. */
export function mapGender(sex: string): Patient['gender'] {
  switch (sex.trim().toUpperCase()) {
    case 'M':
      return 'male';
    case 'F':
      return 'female';
    case 'O':
      return 'other';
    default:
      return 'unknown';
  }
}

/**
 * HL7 timestamp (YYYYMMDD, optionally followed by time) -> FHIR date (YYYY-MM-DD).
 * Partial dates (e.g. YYYY or YYYYMM) and invalid input return undefined.
 */
export function hl7DateToFhir(ts: string): string | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(ts.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}

// HL7 TS/DTM: YYYYMMDD[HHMM[SS[.S-SSSS]]][+/-ZZZZ]
const HL7_DATE_TIME =
  /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(?:(\d{2})(\.\d{1,4})?)?)?([+-]\d{4})?$/;

/**
 * HL7 timestamp -> FHIR dateTime, keeping the time only when HL7 gives a timezone offset.
 *   20260924090000+0530 -> 2026-09-24T09:00:00+05:30
 *   202609240900        -> 2026-09-24  (no offset: never invent a timezone)
 *   20260924            -> 2026-09-24
 * FHIR requires seconds once a time is present, so a missing SS becomes 00.
 * Anything else (e.g. hour without minutes) falls back to hl7DateToFhir: date only or undefined.
 */
export function hl7DateTimeToFhir(ts: string): string | undefined {
  const match = HL7_DATE_TIME.exec(ts.trim());
  if (!match) return hl7DateToFhir(ts);

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = '00',
    fraction = '',
    offset,
  ] = match;
  const date = `${year}-${month}-${day}`;
  if (!hour || !offset) return date;
  return `${date}T${hour}:${minute}:${second}${fraction}${offset.slice(0, 3)}:${offset.slice(3)}`;
}

export function mapToFhirPatient(pid: PidFields): Patient {
  const patient: Patient = { resourceType: 'Patient' };

  if (pid.id) {
    patient.identifier = [
      {
        value: pid.id,
        ...(pid.assigningAuthority && { system: pid.assigningAuthority }),
        ...(pid.idType && { type: { text: pid.idType } }),
      },
    ];
  }

  if (pid.familyName || pid.givenName) {
    patient.name = [
      {
        ...(pid.familyName && { family: pid.familyName }),
        ...(pid.givenName && { given: [pid.givenName] }),
      },
    ];
  }

  const birthDate = hl7DateToFhir(pid.birthDate);
  if (birthDate) patient.birthDate = birthDate;

  patient.gender = mapGender(pid.sex);
  return patient;
}
