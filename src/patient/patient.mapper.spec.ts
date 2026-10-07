import {
  hl7DateTimeToFhir,
  hl7DateToFhir,
  mapGender,
  mapToFhirPatient,
  type PidFields,
} from './patient.mapper';

describe('mapGender', () => {
  it.each([
    ['M', 'male'],
    ['F', 'female'],
    ['O', 'other'],
    ['m', 'male'],
    ['f', 'female'],
    ['U', 'unknown'],
    ['A', 'unknown'],
    ['', 'unknown'],
  ])('%p -> %p', (sex, expected) => {
    expect(mapGender(sex)).toBe(expected);
  });
});

describe('hl7DateToFhir', () => {
  it('converts YYYYMMDD', () => {
    expect(hl7DateToFhir('19980304')).toBe('1998-03-04');
  });

  it('drops the time part of a full timestamp', () => {
    expect(hl7DateToFhir('199803041230')).toBe('1998-03-04');
    expect(hl7DateToFhir('19980304123045+0530')).toBe('1998-03-04');
  });

  it.each(['', '1998', '199803', 'abcdefgh'])(
    'returns undefined for %p',
    (input) => {
      expect(hl7DateToFhir(input)).toBeUndefined();
    },
  );
});

describe('mapToFhirPatient', () => {
  const pid: PidFields = {
    id: '789456',
    assigningAuthority: 'CH',
    idType: 'MR',
    familyName: 'Sharma',
    givenName: 'Bhargavi',
    birthDate: '19980304',
    sex: 'F',
  };

  it('maps PID fields to a FHIR Patient', () => {
    expect(mapToFhirPatient(pid)).toEqual({
      resourceType: 'Patient',
      identifier: [{ value: '789456', system: 'CH', type: { text: 'MR' } }],
      name: [{ family: 'Sharma', given: ['Bhargavi'] }],
      birthDate: '1998-03-04',
      gender: 'female',
    });
  });

  it('omits empty values instead of emitting empty strings', () => {
    const empty: PidFields = {
      id: '',
      assigningAuthority: '',
      idType: '',
      familyName: '',
      givenName: '',
      birthDate: '',
      sex: '',
    };
    expect(mapToFhirPatient(empty)).toEqual({
      resourceType: 'Patient',
      gender: 'unknown',
    });
  });
});

describe('hl7DateTimeToFhir', () => {
  it.each([
    ['202609240900+0530', '2026-09-24T09:00:00+05:30'],
    ['20260924090015-0400', '2026-09-24T09:00:15-04:00'],
    ['20260924090015.123+0000', '2026-09-24T09:00:15.123+00:00'],
  ])('keeps the time when there is an offset: %p -> %p', (input, expected) => {
    expect(hl7DateTimeToFhir(input)).toBe(expected);
  });

  it.each([
    ['202609240900', '2026-09-24'],
    ['20260924090015', '2026-09-24'],
    ['20260924090015.1234', '2026-09-24'],
  ])('drops the time when there is no offset: %p -> %p', (input, expected) => {
    expect(hl7DateTimeToFhir(input)).toBe(expected);
  });

  it.each([
    ['20260924', '2026-09-24'],
    ['20260924+0530', '2026-09-24'], // a date alone carries no time to attach the offset to
    ['2026092409', '2026-09-24'], // hour without minutes: date only
    [' 20260924 ', '2026-09-24'],
  ])('returns the date only for %p', (input, expected) => {
    expect(hl7DateTimeToFhir(input)).toBe(expected);
  });

  it.each(['', '2026', '202609', 'abcdefgh'])(
    'returns undefined for %p',
    (input) => {
      expect(hl7DateTimeToFhir(input)).toBeUndefined();
    },
  );

  it('leaves hl7DateToFhir date-only even with an offset', () => {
    expect(hl7DateToFhir('202609240900+0530')).toBe('2026-09-24');
  });
});
