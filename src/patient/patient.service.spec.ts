import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from './patient.service';

const SEGMENTS = [
  'MSH|^~\\&|ADT_SYS|CITY_HOSP|LAB_SYS|CITY_HOSP|202609240900||ADT^A01|MSG1001|P|2.5',
  'EVN|A01|202609240900',
  'PID|1||789456^^^CH^MR||Sharma^Bhargavi||19980304|F',
];

const EXPECTED_PID = {
  id: '789456',
  assigningAuthority: 'CH',
  idType: 'MR',
  familyName: 'Sharma',
  givenName: 'Bhargavi',
  birthDate: '19980304',
  sex: 'F',
};

describe('PatientService', () => {
  let service: PatientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PatientService, Hl7ParserService],
    }).compile();

    service = module.get<PatientService>(PatientService);
  });

  describe('extractPid', () => {
    it.each([
      ['\\r', SEGMENTS.join('\r')],
      ['\\n', SEGMENTS.join('\n')],
      ['\\r\\n', SEGMENTS.join('\r\n')],
      ['trailing newline', SEGMENTS.join('\n') + '\n'],
    ])('reads PID fields (%s)', (_label, raw) => {
      expect(service.extractPid(raw)).toEqual(EXPECTED_PID);
    });

    it('throws 400 when there is no PID segment', () => {
      const raw = SEGMENTS.slice(0, 2).join('\r');
      expect(() => service.extractPid(raw)).toThrow(BadRequestException);
      expect(() => service.extractPid(raw)).toThrow(/no PID segment/);
    });

    it('throws 400 when the message cannot be parsed', () => {
      expect(() => service.extractPid('not an hl7 message')).toThrow(
        /Could not parse HL7 message/,
      );
    });

    it('throws 400 on empty input', () => {
      expect(() => service.extractPid('  \n ')).toThrow(BadRequestException);
    });
  });

  describe('convertHl7ToFhirPatient', () => {
    it('converts the sample message to a FHIR Patient', () => {
      expect(service.convertHl7ToFhirPatient(SEGMENTS.join('\n'))).toEqual({
        resourceType: 'Patient',
        identifier: [{ value: '789456', system: 'CH', type: { text: 'MR' } }],
        name: [{ family: 'Sharma', given: ['Bhargavi'] }],
        birthDate: '1998-03-04',
        gender: 'female',
      });
    });
  });
});
