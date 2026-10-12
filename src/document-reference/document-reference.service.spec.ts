import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from '../event/event.service';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { DocumentReferenceService } from './document-reference.service';

const LOINC = 'http://loinc.org';
const fromB64 = (data: string | undefined) =>
  Buffer.from(data ?? '', 'base64').toString('utf8');

const msh = (type: string) =>
  `MSH|^~\\&|DOC_SYS|CITY_HOSP|EHR|CITY_HOSP|202610081000||${type}|MSG3001|P|2.5`;
const evn = (trigger: string) => `EVN|${trigger}|202610081000`;
const PID = 'PID|1||789456^^^CH^MR||Sharma^Bhargavi||19980304|F';
const PV1 = 'PV1|1|I|WARD^101^1^CH';

/** TXA built by position (step 0); overrides replace single fields. */
const txa = (overrides: Record<number, string> = {}) => {
  const fields = Array<string>(20).fill('');
  fields[0] = 'TXA';
  Object.assign(fields, {
    1: '1',
    2: 'DS',
    3: 'TX',
    4: '202610080900',
    6: '202610080900',
    9: '1234^Doe^Jane',
    12: 'DOC5001',
    17: 'AU',
    19: 'AV',
    ...overrides,
  });
  return fields.join('|');
};
const TXA_SAMPLE =
  'TXA|1|DS|TX|202610080900||202610080900|||1234^Doe^Jane|||DOC5001|||||AU||AV';

const obx = (setId: number, type: string, value: string) =>
  `OBX|${setId}|${type}|18842-5^Discharge summary^LN||${value}||||||F`;
const OBX_TX = obx(1, 'TX', 'Patient stable, discharge planned tomorrow.');
const OBX_ED = obx(1, 'ED', 'DOC_SYS^AP^PDF^Base64^SGVsbG8gd29ybGQ=');

const mdm = (trigger: string, ...rest: string[]) =>
  [msh(`MDM^${trigger}^MDM_${trigger}`), evn(trigger), PID, PV1, ...rest].join(
    '\n',
  );

const PATIENT = {
  resourceType: 'Patient',
  identifier: [{ value: '789456', system: 'CH', type: { text: 'MR' } }],
  name: [{ family: 'Sharma', given: ['Bhargavi'] }],
  birthDate: '1998-03-04',
  gender: 'female',
};
const HEADER = {
  resourceType: 'DocumentReference',
  masterIdentifier: { value: 'DOC5001' },
};
const TYPE = {
  coding: [{ system: LOINC, code: '18842-5', display: 'Discharge summary' }],
  text: 'Discharge summary',
};
const AUTHOR = [{ display: 'Jane Doe' }];

describe('DocumentReferenceService.convertHl7ToFhirDocumentReference', () => {
  let service: DocumentReferenceService;
  const convert = (raw: string) =>
    service.convertHl7ToFhirDocumentReference(raw);
  const textOf = (raw: string) =>
    fromB64(convert(raw).documentReference.content[0].attachment.data);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentReferenceService,
        PatientService,
        EventService,
        Hl7ParserService,
      ],
    }).compile();
    service = module.get(DocumentReferenceService);
  });

  it('builds the TXA the same way as the sample string', () => {
    expect(txa()).toBe(TXA_SAMPLE);
  });

  it('T02 with TX -> Patient + current/final DocumentReference with text content', () => {
    expect(convert(mdm('T02', TXA_SAMPLE, OBX_TX))).toEqual({
      patient: PATIENT,
      documentReference: {
        ...HEADER,
        status: 'current',
        docStatus: 'final',
        type: TYPE,
        author: AUTHOR,
        content: [
          {
            attachment: {
              contentType: 'text/plain',
              data: Buffer.from(
                'Patient stable, discharge planned tomorrow.',
              ).toString('base64'),
              title: 'Discharge summary',
            },
          },
        ],
      },
    });
  });

  it('T02 with ED -> PDF attachment, data passed through', () => {
    expect(convert(mdm('T02', TXA_SAMPLE, OBX_ED)).documentReference).toEqual({
      ...HEADER,
      status: 'current',
      docStatus: 'final',
      type: TYPE,
      author: AUTHOR,
      content: [
        {
          attachment: {
            contentType: 'application/pdf',
            data: 'SGVsbG8gd29ybGQ=',
            title: 'Discharge summary',
          },
        },
      ],
    });
  });

  it.each([
    ['T01', 'current'],
    ['T11', 'entered-in-error'],
  ])('%s without OBX -> title-only content', (trigger, status) => {
    expect(convert(mdm(trigger, TXA_SAMPLE)).documentReference).toEqual({
      ...HEADER,
      status,
      docStatus: 'final',
      type: TYPE,
      author: AUTHOR,
      content: [{ attachment: { title: 'Discharge summary' } }],
    });
  });

  describe('date', () => {
    it('appears when TXA.6 has an offset', () => {
      expect(
        convert(mdm('T02', txa({ 6: '202610080900+0530' }), OBX_TX))
          .documentReference.date,
      ).toBe('2026-10-08T09:00:00+05:30');
    });

    it('TXA.6 without offset -> TXA.4 with offset is used', () => {
      expect(
        convert(mdm('T02', txa({ 4: '202610080800+0530' }), OBX_TX))
          .documentReference.date,
      ).toBe('2026-10-08T08:00:00+05:30');
    });

    it('no candidate with an offset -> no date', () => {
      expect(
        convert(mdm('T02', TXA_SAMPLE, OBX_TX)).documentReference,
      ).not.toHaveProperty('date');
    });
  });

  describe('text content', () => {
    it('joins ~ repetitions with "\\n"', () => {
      expect(
        textOf(mdm('T02', TXA_SAMPLE, obx(1, 'TX', 'line one~line two'))),
      ).toBe('line one\nline two');
    });

    it('turns \\.br\\ into "\\n" and decodes \\T\\ to &', () => {
      expect(
        textOf(
          mdm(
            'T02',
            TXA_SAMPLE,
            obx(1, 'TX', 'Line one\\.br\\Line two \\T\\ more'),
          ),
        ),
      ).toBe('Line one\nLine two & more');
    });

    it('reads FT like TX', () => {
      const result = convert(
        mdm('T02', TXA_SAMPLE, obx(1, 'FT', 'Formatted\\.br\\text')),
      );
      expect(result.documentReference.content[0].attachment.contentType).toBe(
        'text/plain',
      );
      expect(fromB64(result.documentReference.content[0].attachment.data)).toBe(
        'Formatted\ntext',
      );
    });

    it('joins TX + FT and two TX OBX in order into one attachment', () => {
      const raw = mdm(
        'T02',
        TXA_SAMPLE,
        obx(1, 'TX', 'first'),
        obx(2, 'FT', 'second'),
        obx(3, 'TX', 'third'),
      );
      expect(convert(raw).documentReference.content).toHaveLength(1);
      expect(textOf(raw)).toBe('first\nsecond\nthird');
    });
  });

  describe('ED encodings', () => {
    it.each([
      ['Base64', 'SGVsbG8gd29ybGQ='],
      ['A', 'Hello world'],
      ['Hex', '48656c6c6f20776f726c64'],
    ])('%s -> base64 that decodes to "Hello world"', (encoding, data) => {
      expect(
        textOf(
          mdm(
            'T02',
            TXA_SAMPLE,
            obx(1, 'ED', `DOC_SYS^AP^PDF^${encoding}^${data}`),
          ),
        ),
      ).toBe('Hello world');
    });
  });

  describe('errors, in order', () => {
    const expect400 = (raw: string, message: string | RegExp) => {
      expect(() => convert(raw)).toThrow(BadRequestException);
      expect(() => convert(raw)).toThrow(message);
    };

    it('empty input', () => {
      expect400(' \n', 'HL7 message is empty');
    });

    it('unparseable input', () => {
      expect400('TXA|1', /Could not parse HL7 message/);
    });

    it.each([
      ['ORU^R01', 'ORU^R01'],
      ['MDM^T03', 'MDM^T03'],
      ['adt^a01', 'adt^a01'],
    ])('rejects %p, naming the type as received', (type, shown) => {
      expect400(
        [msh(type), PID, TXA_SAMPLE, OBX_TX].join('\n'),
        `Unsupported HL7 message type "${shown}" for DocumentReference: expected MDM^T01, MDM^T02 or MDM^T11`,
      );
    });

    it('accepts a lowercase MDM type', () => {
      const raw = [msh('mdm^t01'), PID, TXA_SAMPLE].join('\n');
      expect(convert(raw).documentReference.status).toBe('current');
    });

    it('checks the type before PID (ORU with no PID -> type error)', () => {
      expect400(msh('ORU^R01'), /Unsupported HL7 message type "ORU\^R01"/);
    });

    it('no PID', () => {
      expect400(
        [msh('MDM^T02'), TXA_SAMPLE, OBX_TX].join('\n'),
        'HL7 message has no PID segment',
      );
    });

    it('no TXA', () => {
      expect400(mdm('T02', OBX_TX), 'HL7 message has no TXA segment');
    });

    it.each([
      [2, 'TXA.2'],
      [12, 'TXA.12'],
      [17, 'TXA.17'],
    ])('empty TXA.%s -> 400 naming %s', (field, path) => {
      expect400(
        mdm('T02', txa({ [field]: '' }), OBX_TX),
        `HL7 message is missing required field ${path}`,
      );
    });

    it('T02 without OBX', () => {
      expect400(
        mdm('T02', TXA_SAMPLE),
        'MDM^T02 requires at least one OBX segment with the document content',
      );
    });

    it('unsupported OBX value type, naming it', () => {
      expect400(
        mdm('T02', TXA_SAMPLE, OBX_TX, obx(2, 'NM', '42')),
        'Unsupported OBX value type "NM" in OBX set ID 2: expected TX, FT or ED',
      );
    });

    it('mixed TX + ED', () => {
      expect400(
        mdm('T02', TXA_SAMPLE, OBX_TX, OBX_ED.replace('OBX|1', 'OBX|2')),
        'Cannot mix text (TX/FT) and ED OBX values in one document',
      );
    });

    it('unknown ED encoding, naming it', () => {
      expect400(
        mdm('T02', TXA_SAMPLE, obx(1, 'ED', 'DOC_SYS^AP^PDF^UU^abc')),
        'Unsupported ED encoding "UU" in OBX.5.4: expected Base64, A or Hex',
      );
    });
  });
});
