import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { EncounterService } from './encounter.service';

const ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

const msh = (type: string, id = 'MSG2001') =>
  `MSH|^~\\&|ADT_SYS|CITY_HOSP|LAB_SYS|CITY_HOSP|202609240900||${type}|${id}|P|2.5`;
const PID = 'PID|1||789456^^^CH^MR||Sharma^Bhargavi||19980304|F';
const PV1 = 'PV1|1|I|WARD^101^1^CH';
// Positions confirmed in step 0: PV1.7, .10, .19, .44, .45.
const FULL_PV1 =
  'PV1|1|I|WARD^101^1^CH||||1234^Doe^Jane|||MED|||||||||V5001|||||||||||||||||||||||||202609240900|202609261500';

const A01 = [msh('ADT^A01^ADT_A01'), 'EVN|A01|202609240900', PID, PV1];
const A03 = [
  msh('ADT^A03^ADT_A03', 'MSG2002'),
  'EVN|A03|202609261500',
  PID,
  PV1,
];
const FULL = [msh('ADT^A01^ADT_A01'), 'EVN|A01|202609240900', PID, FULL_PV1];
const join = (segments: string[]) => segments.join('\n');

const PATIENT = {
  resourceType: 'Patient',
  identifier: [{ value: '789456', system: 'CH', type: { text: 'MR' } }],
  name: [{ family: 'Sharma', given: ['Bhargavi'] }],
  birthDate: '1998-03-04',
  gender: 'female',
};
const WARD = [{ location: { display: 'WARD 101 1 CH' } }];

describe('EncounterService.convertHl7ToFhirEncounter', () => {
  let service: EncounterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncounterService,
        PatientService,
        EventService,
        Hl7ParserService,
      ],
    }).compile();
    service = module.get(EncounterService);
  });

  it('A01 sample -> Patient + in-progress Encounter starting at EVN.2', () => {
    expect(service.convertHl7ToFhirEncounter(join(A01))).toEqual({
      patient: PATIENT,
      encounter: {
        resourceType: 'Encounter',
        status: 'in-progress',
        class: { system: ACT_CODE, code: 'IMP' },
        period: { start: '2026-09-24' },
        location: WARD,
      },
    });
  });

  it('A03 sample -> finished Encounter ending at EVN.2, with no start', () => {
    expect(service.convertHl7ToFhirEncounter(join(A03))).toEqual({
      patient: PATIENT,
      encounter: {
        resourceType: 'Encounter',
        status: 'finished',
        class: { system: ACT_CODE, code: 'IMP' },
        period: { end: '2026-09-26' },
        location: WARD,
      },
    });
  });

  it('full PV1 sample -> every mapped field', () => {
    expect(service.convertHl7ToFhirEncounter(join(FULL))).toEqual({
      patient: PATIENT,
      encounter: {
        resourceType: 'Encounter',
        status: 'in-progress',
        class: { system: ACT_CODE, code: 'IMP' },
        identifier: [{ value: 'V5001' }],
        serviceType: { text: 'MED' },
        participant: [{ individual: { display: 'Jane Doe' } }],
        period: { start: '2026-09-24', end: '2026-09-26' },
        location: WARD,
      },
    });
  });

  it('uses only the first attending doctor when PV1.7 repeats', () => {
    const raw = join([
      ...A01.slice(0, 3),
      'PV1|1|I|WARD^101^1^CH||||1234^Doe^Jane~5678^Roe^Rick',
    ]);
    expect(
      service.convertHl7ToFhirEncounter(raw).encounter.participant,
    ).toEqual([{ individual: { display: 'Jane Doe' } }]);
  });

  it('works without an EVN segment (no EVN date to fall back on)', () => {
    const raw = join([A01[0], PID, PV1]);
    expect(service.convertHl7ToFhirEncounter(raw).encounter).not.toHaveProperty(
      'period',
    );
  });

  describe('errors, in order', () => {
    const expect400 = (raw: string, message: string | RegExp) => {
      expect(() => service.convertHl7ToFhirEncounter(raw)).toThrow(
        BadRequestException,
      );
      expect(() => service.convertHl7ToFhirEncounter(raw)).toThrow(message);
    };

    it('empty input', () => {
      expect400('  \n', 'HL7 message is empty');
    });

    it('unparseable input', () => {
      expect400('PID|1', /Could not parse HL7 message/);
    });

    it.each([
      ['ORU^R01', 'ORU^R01'],
      ['ADT^A08', 'ADT^A08'],
      ['oru^r01', 'oru^r01'],
    ])('rejects %p, naming the type as received', (type, shown) => {
      expect400(
        join([msh(type), PID, PV1]),
        `Unsupported HL7 message type "${shown}" for Encounter: expected ADT^A01, ADT^A02, ADT^A03 or ADT^A04`,
      );
    });

    it('checks the message type before PID (ORU with no PID -> type error)', () => {
      expect400(
        join([msh('ORU^R01')]),
        /Unsupported HL7 message type "ORU\^R01"/,
      );
    });

    it('accepts a lowercase ADT type', () => {
      const raw = join([msh('adt^a04'), PID, 'PV1|1|O']);
      expect(service.convertHl7ToFhirEncounter(raw).encounter.status).toBe(
        'arrived',
      );
    });

    it('no PID (checked before PV1)', () => {
      expect400(join([A01[0], A01[1]]), 'HL7 message has no PID segment');
    });

    it('no PV1', () => {
      expect400(join(A01.slice(0, 3)), 'HL7 message has no PV1 segment');
    });

    it('empty PV1.2', () => {
      expect400(
        join([...A01.slice(0, 3), 'PV1|1||WARD^101^1^CH']),
        'HL7 message is missing required field PV1.2',
      );
    });

    it('unknown PV1.2, naming the value received', () => {
      expect400(
        join([...A01.slice(0, 3), 'PV1|1|P|WARD^101^1^CH']),
        'Unsupported patient class "P" in PV1.2: expected one of I, O, E',
      );
    });
  });
});
