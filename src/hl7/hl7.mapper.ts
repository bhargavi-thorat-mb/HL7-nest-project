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

/**
 * HL7 separates segments with \r, but pasted/JSON-posted messages often use \n or \r\n.
 * Convert everything to \r and drop trailing \r/whitespace so no empty segment is left at the end.
 */
export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n|\n/g, '\r').replace(/[\r\s]+$/, '');
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
