import {
  hl7DateToFhir,
  mapGender,
  mapToFhirPatient,
  normalizeLineEndings,
  type PidFields,
} from './hl7.mapper';

describe('mapGender', () => {
  it.each([
    ['M', 'male'],
    ['F', 'female'],
    ['O', 'other'],
    ['m','male'],
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

describe('normalizeLineEndings', () => {
  it('converts \\n and \\r\\n to \\r and trims the trailing newline', () => {
    expect(normalizeLineEndings('A\nB\r\nC\n')).toBe('A\rB\rC');
  });
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
