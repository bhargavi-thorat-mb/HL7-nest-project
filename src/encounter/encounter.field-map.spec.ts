import {
  PATIENT_CLASS_MAP,
  PV1_FIELD_MAP,
  TRIGGER_STATUS_MAP,
} from './encounter.field-map';

const ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

describe('PV1_FIELD_MAP', () => {
  it('points at the PV1 positions confirmed in step 0', () => {
    expect(PV1_FIELD_MAP).toEqual({
      patientClass: { path: 'PV1.2', required: true },
      pointOfCare: { path: 'PV1.3.1' },
      room: { path: 'PV1.3.2' },
      bed: { path: 'PV1.3.3' },
      facility: { path: 'PV1.3.4' },
      attendingFamilyName: { path: 'PV1.7.2' },
      attendingGivenName: { path: 'PV1.7.3' },
      hospitalService: { path: 'PV1.10' },
      visitNumber: { path: 'PV1.19.1' },
      admitDateTime: { path: 'PV1.44' },
      dischargeDateTime: { path: 'PV1.45' },
    });
  });

  it('marks only PV1.2 as required', () => {
    const required = Object.values(PV1_FIELD_MAP)
      .filter((field) => 'required' in field && field.required)
      .map((field) => field.path);
    expect(required).toEqual(['PV1.2']);
  });
});

describe('PATIENT_CLASS_MAP', () => {
  it('maps I, O and E to v3-ActCode codes', () => {
    expect(PATIENT_CLASS_MAP).toEqual({
      I: { system: ACT_CODE, code: 'IMP' },
      O: { system: ACT_CODE, code: 'AMB' },
      E: { system: ACT_CODE, code: 'EMER' },
    });
  });
});

describe('TRIGGER_STATUS_MAP', () => {
  it('maps A01-A04 to Encounter statuses', () => {
    expect(TRIGGER_STATUS_MAP).toEqual({
      A01: 'in-progress',
      A02: 'in-progress',
      A03: 'finished',
      A04: 'arrived',
    });
  });
});
