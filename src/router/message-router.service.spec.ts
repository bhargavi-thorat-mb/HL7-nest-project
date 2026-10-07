import { BadRequestException, NotImplementedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { ObservationService } from '../observation/observation.service';
import { PatientService } from '../patient/patient.service';
import {
  MessageRouterService,
  SUPPORTED_MESSAGE_TYPES,
} from './message-router.service';

const msh = (type: string) =>
  `MSH|^~\\&|MySenderApp|MyFacility|EHR|MyHospital|202508121410||${type}|MSG0003|P|2.5`;
const PID = 'PID|1||123456^^^EHR^MR||Grand^John^Central||19750101|M';
const OBR = 'OBR|1||OBR12345|11348-0^History of past illness^LN|||20250812';
const OBX =
  'OBX|1|CWE|11348-0^History of past illness^LN||38341003^Hypertension^SCT|||A||||||20240812';
const oru = (type = 'ORU^R01') => [msh(type), PID, OBR, OBX].join('\n');
const adt = (type: string) => [msh(type), 'EVN||202609240900', PID].join('\n');

describe('MessageRouterService.convert', () => {
  let router: MessageRouterService;
  let observationService: ObservationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageRouterService,
        ObservationService,
        PatientService,
        Hl7ParserService,
      ],
    }).compile();
    router = module.get(MessageRouterService);
    observationService = module.get(ObservationService);
  });

  it('sends ORU^R01 through the Observation flow (same result as /to-fhir-observation)', () => {
    const spy = jest.spyOn(observationService, 'extractOru');
    const result = router.convert(oru());
    expect(spy).toHaveBeenCalledWith(oru());
    expect(result).toEqual(observationService.extractOru(oru()));
    expect(result.observations).toHaveLength(1);
  });

  it.each(['oru^r01', ' ORU ^ R01 ', 'ORU^R01^ORU_R01'])(
    'normalizes %p to ORU^R01',
    (type) => {
      expect(router.convert(oru(type)).observations).toHaveLength(1);
    },
  );

  it.each(['ADT^A01', 'ADT^A02', 'ADT^A03', 'ADT^A04', 'adt^a03'])(
    'answers 501 for %p',
    (type) => {
      let error: unknown;
      try {
        router.convert(adt(type));
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(NotImplementedException);
      expect((error as NotImplementedException).getStatus()).toBe(501);
      expect((error as NotImplementedException).getResponse()).toEqual({
        message: 'ADT handling not implemented yet',
        error: 'Not Implemented',
        statusCode: 501,
      });
    },
  );

  it.each([
    ['ADT^A08', 'ADT^A08'],
    ['ORU^R03', 'ORU^R03'],
    ['adt^a08', 'adt^a08'], // shown as received, not uppercased
    ['SIU^S12^SIU_S12', 'SIU^S12'],
  ])('answers 400 for %p, naming it as received', (type, shown) => {
    expect(() => router.convert(adt(type))).toThrow(BadRequestException);
    expect(() => router.convert(adt(type))).toThrow(
      `Unsupported HL7 message type "${shown}". Supported types: ${SUPPORTED_MESSAGE_TYPES.join(', ')}`,
    );
  });

  it('answers 400 when MSH.9 is empty', () => {
    expect(() => router.convert(adt(''))).toThrow(/missing or incomplete/);
  });

  it('keeps Observation errors for a recognized ORU with bad content', () => {
    expect(() => router.convert([msh('ORU^R01'), PID, OBR].join('\n'))).toThrow(
      'HL7 message has no OBX segment',
    );
  });
});
