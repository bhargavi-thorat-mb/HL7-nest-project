import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { EventService, type EvnFields } from './event.service';

const msh = (type: string) =>
  `MSH|^~\\&|ADT_SYS|CITY_HOSP|LAB_SYS|CITY_HOSP|202609240900||${type}|MSG1001|P|2.5`;
const PID = 'PID|1||789456^^^CH^MR||Sharma^Bhargavi||19980304|F';

const EMPTY_EVN: EvnFields = {
  eventTypeCode: '',
  recordedDateTime: '',
  plannedEventDateTime: '',
  eventReasonCode: '',
  operatorId: '',
  eventOccurred: '',
  eventFacility: '',
};

describe('EventService.extractEvn', () => {
  let service: EventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventService, Hl7ParserService],
    }).compile();
    service = module.get<EventService>(EventService);
  });

  it('reads all EVN fields from an A01 (admit)', () => {
    const raw = [
      msh('ADT^A01^ADT_A01'),
      'EVN|A01|202609240900|202609250800|01^Patient request^HL70062|OP123^Smith^Ann|202609240855|CITY_HOSP',
      PID,
    ].join('\n');
    expect(service.extractEvn(raw)).toEqual({
      eventTypeCode: 'A01',
      recordedDateTime: '202609240900',
      plannedEventDateTime: '202609250800',
      eventReasonCode: '01',
      operatorId: 'OP123',
      eventOccurred: '202609240855',
      eventFacility: 'CITY_HOSP',
    });
  });

  it('reads an A03 (discharge) with EVN.1 omitted, as v2.5 allows', () => {
    const raw = [
      msh('ADT^A03^ADT_A03'),
      'EVN||202609281500|||OP123^Smith^Ann|202609281430',
      PID,
    ].join('\n');
    expect(service.extractEvn(raw)).toEqual({
      ...EMPTY_EVN,
      recordedDateTime: '202609281500',
      operatorId: 'OP123',
      eventOccurred: '202609281430',
    });
  });

  it('returns empty fields when there is no EVN segment', () => {
    expect(service.extractEvn([msh('ADT^A01'), PID].join('\n'))).toEqual(
      EMPTY_EVN,
    );
  });

  it.each(['EVN', 'EVN|', 'EVN|||||||'])(
    'returns empty fields for an empty EVN segment (%p)',
    (evn) => {
      expect(service.extractEvn([msh('ADT^A01'), evn, PID].join('\n'))).toEqual(
        EMPTY_EVN,
      );
    },
  );

  it('still throws 400 on empty or unparseable input', () => {
    expect(() => service.extractEvn('  ')).toThrow(BadRequestException);
    expect(() => service.extractEvn('EVN|A01')).toThrow(
      /Could not parse HL7 message/,
    );
  });
});
