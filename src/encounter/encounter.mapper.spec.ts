import type { EvnFields } from '../event/event.service';
import type { Pv1Fields } from './encounter.field-map';
import { EncounterMappingError, mapToFhirEncounter } from './encounter.mapper';

const ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

// Only the required PV1.2 set; every other value empty.
const PV1: Pv1Fields = {
  patientClass: 'I',
  pointOfCare: '',
  room: '',
  bed: '',
  facility: '',
  attendingFamilyName: '',
  attendingGivenName: '',
  hospitalService: '',
  visitNumber: '',
  admitDateTime: '',
  dischargeDateTime: '',
};

const EVN: EvnFields = {
  eventTypeCode: '',
  recordedDateTime: '',
  plannedEventDateTime: '',
  eventReasonCode: '',
  operatorId: '',
  eventOccurred: '',
  eventFacility: '',
};

describe('mapToFhirEncounter', () => {
  describe('status from the trigger event', () => {
    it.each([
      ['A01', 'in-progress'],
      ['A02', 'in-progress'],
      ['A03', 'finished'],
      ['A04', 'arrived'],
    ])('%s -> %s', (trigger, status) => {
      expect(mapToFhirEncounter(PV1, EVN, trigger).status).toBe(status);
    });

    it('throws a mapping error for any other trigger', () => {
      expect(() => mapToFhirEncounter(PV1, EVN, 'A08')).toThrow(
        new EncounterMappingError(
          'Unsupported ADT trigger event "A08": expected one of A01, A02, A03, A04',
        ),
      );
    });
  });

  describe('class from PV1.2', () => {
    it.each([
      ['I', 'IMP'],
      ['O', 'AMB'],
      ['E', 'EMER'],
      [' e ', 'EMER'],
      ['i', 'IMP'],
    ])('%p -> %s', (patientClass, code) => {
      expect(
        mapToFhirEncounter({ ...PV1, patientClass }, EVN, 'A01').class,
      ).toEqual({ system: ACT_CODE, code });
    });

    it.each(['P', 'R', 'B', 'X'])(
      'throws a mapping error naming the value for %p',
      (patientClass) => {
        expect(() =>
          mapToFhirEncounter({ ...PV1, patientClass }, EVN, 'A01'),
        ).toThrow(
          `Unsupported patient class "${patientClass}" in PV1.2: expected one of I, O, E`,
        );
      },
    );
  });

  it('maps every PV1 field when all are present', () => {
    expect(
      mapToFhirEncounter(
        {
          patientClass: 'I',
          pointOfCare: 'WARD',
          room: '101',
          bed: '1',
          facility: 'CH',
          attendingFamilyName: 'Doe',
          attendingGivenName: 'Jane',
          hospitalService: 'MED',
          visitNumber: 'V5001',
          admitDateTime: '202609240900',
          dischargeDateTime: '202609261500',
        },
        EVN,
        'A01',
      ),
    ).toEqual({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: ACT_CODE, code: 'IMP' },
      identifier: [{ value: 'V5001' }],
      serviceType: { text: 'MED' },
      participant: [{ individual: { display: 'Jane Doe' } }],
      period: { start: '2026-09-24', end: '2026-09-26' },
      location: [{ location: { display: 'WARD 101 1 CH' } }],
    });
  });

  it('omits empty values (no "" and no empty objects), and never sets subject', () => {
    expect(mapToFhirEncounter(PV1, EVN, 'A01')).toEqual({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: ACT_CODE, code: 'IMP' },
    });
  });

  it('skips empty location components and joins the rest with a space', () => {
    const encounter = mapToFhirEncounter(
      { ...PV1, pointOfCare: 'WARD', bed: '1', facility: ' ' },
      EVN,
      'A01',
    );
    expect(encounter.location).toEqual([{ location: { display: 'WARD 1' } }]);
  });

  it.each([
    [{ attendingGivenName: 'Jane' }, 'Jane'],
    [{ attendingFamilyName: 'Doe' }, 'Doe'],
  ])(
    'builds the participant from whichever name part is present (%p)',
    (parts, display) => {
      expect(
        mapToFhirEncounter({ ...PV1, ...parts }, EVN, 'A01').participant,
      ).toEqual([{ individual: { display } }]);
    },
  );

  describe('period for A01 / A02 / A04', () => {
    it.each(['A01', 'A02', 'A04'])('%s: start prefers PV1.44', (trigger) => {
      const encounter = mapToFhirEncounter(
        { ...PV1, admitDateTime: '20260924' },
        { ...EVN, eventOccurred: '20260923', recordedDateTime: '20260922' },
        trigger,
      );
      expect(encounter.period).toEqual({ start: '2026-09-24' });
    });

    it('start falls back to EVN.6, then EVN.2', () => {
      expect(
        mapToFhirEncounter(
          PV1,
          { ...EVN, eventOccurred: '20260923', recordedDateTime: '20260922' },
          'A01',
        ).period,
      ).toEqual({ start: '2026-09-23' });
      expect(
        mapToFhirEncounter(PV1, { ...EVN, recordedDateTime: '20260922' }, 'A01')
          .period,
      ).toEqual({ start: '2026-09-22' });
    });

    it('end comes only from PV1.45 (no EVN fallback)', () => {
      const encounter = mapToFhirEncounter(
        { ...PV1, dischargeDateTime: '20260926' },
        { ...EVN, recordedDateTime: '20260922' },
        'A01',
      );
      expect(encounter.period).toEqual({
        start: '2026-09-22',
        end: '2026-09-26',
      });
    });
  });

  describe('period for A03 (discharge)', () => {
    it('start comes only from PV1.44 (no EVN fallback)', () => {
      const encounter = mapToFhirEncounter(
        PV1,
        { ...EVN, eventOccurred: '20260926', recordedDateTime: '20260926' },
        'A03',
      );
      expect(encounter.period).toEqual({ end: '2026-09-26' });
    });

    it('end prefers PV1.45, then EVN.6, then EVN.2', () => {
      const evn = {
        ...EVN,
        eventOccurred: '20260927',
        recordedDateTime: '20260928',
      };
      expect(
        mapToFhirEncounter(
          { ...PV1, admitDateTime: '20260924', dischargeDateTime: '20260926' },
          evn,
          'A03',
        ).period,
      ).toEqual({ start: '2026-09-24', end: '2026-09-26' });
      expect(mapToFhirEncounter(PV1, evn, 'A03').period).toEqual({
        end: '2026-09-27',
      });
      expect(
        mapToFhirEncounter(PV1, { ...EVN, recordedDateTime: '20260928' }, 'A03')
          .period,
      ).toEqual({ end: '2026-09-28' });
    });
  });

  it('keeps the time in the period only when the HL7 timestamp has an offset', () => {
    expect(
      mapToFhirEncounter(
        {
          ...PV1,
          admitDateTime: '202609240900+0530',
          dischargeDateTime: '202609261500',
        },
        EVN,
        'A01',
      ).period,
    ).toEqual({ start: '2026-09-24T09:00:00+05:30', end: '2026-09-26' });
  });

  it('skips an invalid date and uses the next fallback', () => {
    expect(
      mapToFhirEncounter(
        { ...PV1, admitDateTime: 'garbage' },
        { ...EVN, recordedDateTime: '20260922' },
        'A01',
      ).period,
    ).toEqual({ start: '2026-09-22' });
  });

  it('omits period when no date is available', () => {
    expect(mapToFhirEncounter(PV1, EVN, 'A03')).not.toHaveProperty('period');
  });
});
