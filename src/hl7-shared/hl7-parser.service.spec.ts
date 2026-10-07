import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService, normalizeLineEndings } from './hl7-parser.service';

const MSH =
  'MSH|^~\\&|ADT_SYS|CITY_HOSP|LAB_SYS|CITY_HOSP|202609240900||ADT^A01|MSG1001|P|2.5';
const PID = 'PID|1||789456^^^CH^MR||Sharma^Bhargavi||19980304|F';

// Moved here from the patient mapper spec along with the function.
describe('normalizeLineEndings', () => {
  it('converts \\n and \\r\\n to \\r and trims the trailing newline', () => {
    expect(normalizeLineEndings('A\nB\r\nC\n')).toBe('A\rB\rC');
  });
});

describe('Hl7ParserService', () => {
  let parser: Hl7ParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Hl7ParserService],
    }).compile();
    parser = module.get<Hl7ParserService>(Hl7ParserService);
  });

  describe('parse', () => {
    it('parses a \\n-separated message', () => {
      const message = parser.parse(`${MSH}\n${PID}\n`);
      expect(message.get('PID.5.1').toString()).toBe('Sharma');
    });

    it('throws 400 on empty input', () => {
      expect(() => parser.parse('  \n ')).toThrow(BadRequestException);
      expect(() => parser.parse('  \n ')).toThrow('HL7 message is empty');
    });

    it('throws 400 when the message cannot be parsed', () => {
      expect(() => parser.parse('not an hl7 message')).toThrow(
        BadRequestException,
      );
      expect(() => parser.parse('not an hl7 message')).toThrow(
        /Could not parse HL7 message/,
      );
    });
  });

  describe('requireSegment', () => {
    it('does nothing when the segment exists', () => {
      expect(() =>
        parser.requireSegment(parser.parse(`${MSH}\n${PID}`), 'PID'),
      ).not.toThrow();
    });

    it('throws 400 naming the missing segment', () => {
      const message = parser.parse(MSH);
      expect(() => parser.requireSegment(message, 'OBX')).toThrow(
        BadRequestException,
      );
      expect(() => parser.requireSegment(message, 'OBX')).toThrow(
        'HL7 message has no OBX segment',
      );
    });
  });

  describe('getMessageType', () => {
    // MSH with MSH.9 replaced by `type`.
    const mshWith = (type: string) =>
      `MSH|^~\\&|ADT_SYS|CITY_HOSP|LAB_SYS|CITY_HOSP|202609240900||${type}|MSG1001|P|2.5`;

    it.each([
      ['ADT^A01^ADT_A01', 'ADT', 'A01'],
      ['ADT^A03', 'ADT', 'A03'],
      ['ORU^R01', 'ORU', 'R01'],
    ])('reads %p as code + trigger', (type, messageCode, triggerEvent) => {
      expect(parser.getMessageType(`${mshWith(type)}\n${PID}`)).toEqual({
        messageCode,
        triggerEvent,
      });
    });

    it('returns values as received (no trimming or uppercasing)', () => {
      expect(parser.getMessageType(mshWith(' adt^a01'))).toEqual({
        messageCode: ' adt',
        triggerEvent: 'a01',
      });
    });

    it.each([
      ['empty MSH.9', mshWith(''), /MSH\.9\.1 \(message code\) and MSH\.9\.2/],
      [
        'no trigger event',
        mshWith('ADT'),
        /MSH\.9\.2 \(trigger event\) is empty/,
      ],
      [
        'no message code',
        mshWith('^A01'),
        /MSH\.9\.1 \(message code\) is empty/,
      ],
      ['whitespace only', mshWith(' ^ '), /MSH\.9\.1 .* and MSH\.9\.2/],
      [
        'MSH cut off before MSH.9',
        'MSH|^~\\&|ADT_SYS|CITY_HOSP|LAB_SYS|CITY_HOSP|202609240900|',
        /missing or incomplete/,
      ],
    ])('throws 400 for %s', (_label, raw, message) => {
      expect(() => parser.getMessageType(raw)).toThrow(BadRequestException);
      expect(() => parser.getMessageType(raw)).toThrow(message);
    });

    it('keeps the empty / unparseable 400s from parse()', () => {
      expect(() => parser.getMessageType(' \n')).toThrow(
        'HL7 message is empty',
      );
      expect(() => parser.getMessageType('hello')).toThrow(
        /Could not parse HL7 message/,
      );
    });
  });
});
