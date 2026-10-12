import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentReferenceService } from '../document-reference/document-reference.service';
import { EncounterService } from '../encounter/encounter.service';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import type { OruResult } from '../observation/observation.mapper';
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
const adt = (type: string) =>
  [msh(type), 'EVN||202609240900', PID, 'PV1|1|I|WARD^101^1^CH'].join('\n');
const TXA =
  'TXA|1|DS|TX|202610080900||202610080900|||1234^Doe^Jane|||DOC5001|||||AU||AV';
const DOC_OBX =
  'OBX|1|TX|18842-5^Discharge summary^LN||Patient stable, discharge planned tomorrow.||||||F';
const mdm = (type: string) => [msh(type), PID, TXA, DOC_OBX].join('\n');

describe('MessageRouterService.convert', () => {
  let router: MessageRouterService;
  let observationService: ObservationService;
  let encounterService: EncounterService;
  let documentReferenceService: DocumentReferenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageRouterService,
        ObservationService,
        EncounterService,
        DocumentReferenceService,
        EventService,
        PatientService,
        Hl7ParserService,
      ],
    }).compile();
    router = module.get(MessageRouterService);
    observationService = module.get(ObservationService);
    encounterService = module.get(EncounterService);
    documentReferenceService = module.get(DocumentReferenceService);
  });

  it.each([
    ['MDM^T01', 'current'],
    ['MDM^T02', 'current'],
    ['MDM^T11', 'entered-in-error'],
    ['mdm^t02^MDM_T02', 'current'],
  ])(
    'sends %p through the DocumentReference flow (same result as /to-fhir-document-reference)',
    (type, status) => {
      const spy = jest.spyOn(
        documentReferenceService,
        'convertHl7ToFhirDocumentReference',
      );
      const result = router.convert(mdm(type));
      expect(spy).toHaveBeenCalledWith(mdm(type));
      expect(result).toEqual(
        documentReferenceService.convertHl7ToFhirDocumentReference(mdm(type)),
      );
      expect(result).toHaveProperty('documentReference.status', status);
    },
  );

  it('answers 400 for an unsupported MDM trigger, listing the MDM types', () => {
    expect(() => router.convert(mdm('MDM^T03'))).toThrow(
      'Unsupported HL7 message type "MDM^T03". Supported types: ORU^R01, ADT^A01, ADT^A02, ADT^A03, ADT^A04, MDM^T01, MDM^T02, MDM^T11',
    );
  });

  it('keeps DocumentReference errors for a recognized MDM with bad content', () => {
    expect(() => router.convert([msh('MDM^T02'), PID].join('\n'))).toThrow(
      'HL7 message has no TXA segment',
    );
  });

  it('sends ORU^R01 through the Observation flow (same result as /to-fhir-observation)', () => {
    const spy = jest.spyOn(observationService, 'extractOru');
    const result = router.convert(oru());
    expect(spy).toHaveBeenCalledWith(oru());
    expect(result).toEqual(observationService.extractOru(oru()));
    expect((result as OruResult).observations).toHaveLength(1);
  });

  it.each(['oru^r01', ' ORU ^ R01 ', 'ORU^R01^ORU_R01'])(
    'normalizes %p to ORU^R01',
    (type) => {
      expect(
        (router.convert(oru(type)) as OruResult).observations,
      ).toHaveLength(1);
    },
  );

  // Replaces the earlier 501 tests: ADT^A01-A04 now go to the Encounter flow.
  it.each([
    ['ADT^A01', 'in-progress'],
    ['ADT^A02', 'in-progress'],
    ['ADT^A03', 'finished'],
    ['ADT^A04', 'arrived'],
    ['adt^a03', 'finished'],
  ])(
    'sends %p through the Encounter flow (same result as /to-fhir-encounter)',
    (type, status) => {
      const spy = jest.spyOn(encounterService, 'convertHl7ToFhirEncounter');
      const result = router.convert(adt(type));
      expect(spy).toHaveBeenCalledWith(adt(type));
      expect(result).toEqual(
        encounterService.convertHl7ToFhirEncounter(adt(type)),
      );
      expect(result).toHaveProperty('encounter.status', status);
    },
  );

  it('keeps Encounter errors for a recognized ADT with bad content', () => {
    expect(() => router.convert([msh('ADT^A01'), PID].join('\n'))).toThrow(
      'HL7 message has no PV1 segment',
    );
  });

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
