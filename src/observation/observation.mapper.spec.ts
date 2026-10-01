import {
  mapAbnormalFlag,
  mapToFhirObservation,
  toCodeableConcept,
  type ObrFields,
  type ObxFields,
} from './observation.mapper';

const INTERP =
  'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';

describe('mapAbnormalFlag', () => {
  it.each([
    ['A', 'Abnormal'],
    ['N', 'Normal'],
    ['H', 'High'],
    ['L', 'Low'],
    ['HH', 'Critical high'],
    ['LL', 'Critical low'],
    ['AA', 'Critical abnormal'],
    [' a ', 'Abnormal'],
  ])('%p -> %p', (flag, display) => {
    expect(mapAbnormalFlag(flag)).toEqual({
      coding: [{ system: INTERP, code: flag.trim().toUpperCase(), display }],
    });
  });

  it.each(['', '  ', 'XYZ'])('returns undefined for %p', (flag) => {
    expect(mapAbnormalFlag(flag)).toBeUndefined();
  });
});

describe('toCodeableConcept', () => {
  it('maps known coding systems to FHIR URIs', () => {
    expect(toCodeableConcept('38341003', 'Hypertension', 'SCT')).toEqual({
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: '38341003',
          display: 'Hypertension',
        },
      ],
      text: 'Hypertension',
    });
  });

  it('leaves system out for an unknown coding system', () => {
    expect(toCodeableConcept('X1', 'Local', 'L')).toEqual({
      coding: [{ code: 'X1', display: 'Local' }],
      text: 'Local',
    });
  });

  it('returns undefined when code and text are empty', () => {
    expect(toCodeableConcept('', '', 'LN')).toBeUndefined();
  });
});

describe('mapToFhirObservation', () => {
  // Values from the ORU sample (OBR.4, OBR.7, OBX.3, OBX.5), with the flag and date
  // placed at their v2.5 positions (OBX.8, OBX.14).
  const obr: ObrFields = {
    code: '11348-0',
    display: 'History of past illness',
    codeSystem: 'LN',
    observationDateTime: '20250812',
  };
  const obx: ObxFields = {
    valueType: 'CWE',
    code: '11348-0',
    display: 'History of past illness',
    codeSystem: 'LN',
    valueCode: '38341003',
    valueDisplay: 'Hypertension',
    valueCodeSystem: 'SCT',
    abnormalFlag: 'A',
    observationDateTime: '20240812',
  };

  it('maps the sample OBR/OBX to a FHIR Observation', () => {
    expect(mapToFhirObservation(obr, obx)).toEqual({
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '11348-0',
            display: 'History of past illness',
          },
        ],
        text: 'History of past illness',
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '38341003',
            display: 'Hypertension',
          },
        ],
        text: 'Hypertension',
      },
      interpretation: [
        { coding: [{ system: INTERP, code: 'A', display: 'Abnormal' }] },
      ],
      effectiveDateTime: '2024-08-12',
    });
  });

  it('falls back to OBR.7 for the date and omits an empty interpretation', () => {
    const result = mapToFhirObservation(obr, {
      ...obx,
      abnormalFlag: '',
      observationDateTime: '',
    });
    expect(result.effectiveDateTime).toBe('2025-08-12');
    expect(result).not.toHaveProperty('interpretation');
  });

  it('falls back to OBR.4 for the code when OBX.3 is empty', () => {
    const result = mapToFhirObservation(
      { ...obr, code: '24331-1', display: 'Lipid panel' },
      { ...obx, code: '', display: '', codeSystem: '' },
    );
    expect(result.code.coding?.[0].code).toBe('24331-1');
  });

  it('does not set subject (no storage, so nothing to reference)', () => {
    expect(mapToFhirObservation(obr, obx)).not.toHaveProperty('subject');
  });
});
