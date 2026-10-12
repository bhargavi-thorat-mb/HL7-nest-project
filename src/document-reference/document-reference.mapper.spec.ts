import type { EvnFields } from '../event/event.service';
import type { TxaFields } from './document-reference.field-map';
import {
  DocumentMappingError,
  edDataToBase64,
  hl7TextToPlain,
  mapToFhirDocumentReference,
  type ObxContent,
} from './document-reference.mapper';

const LOINC = 'http://loinc.org';
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const fromB64 = (data: string | undefined) =>
  Buffer.from(data ?? '', 'base64').toString('utf8');

// Values from the T02 sample's TXA (no timezone offsets).
const TXA: TxaFields = {
  documentTypeCode: 'DS',
  documentTypeText: '',
  activityDateTime: '202610080900',
  originationDateTime: '202610080900',
  originatorFamilyName: 'Doe',
  originatorGivenName: 'Jane',
  uniqueDocumentNumber: 'DOC5001',
  completionStatus: 'AU',
};

const EVN: EvnFields = {
  eventTypeCode: 'T02',
  recordedDateTime: '202610081000',
  plannedEventDateTime: '',
  eventReasonCode: '',
  operatorId: '',
  eventOccurred: '',
  eventFacility: '',
};

const tx = (
  text: string | string[],
  valueType: 'TX' | 'FT' = 'TX',
  title = 'Discharge summary',
): ObxContent => ({
  valueType,
  title,
  repetitions: Array.isArray(text) ? text : [text],
});

const ed = (
  overrides: Partial<Extract<ObxContent, { valueType: 'ED' }>> = {},
) =>
  ({
    valueType: 'ED',
    title: 'Discharge summary',
    typeOfData: 'AP',
    dataSubtype: 'PDF',
    encoding: 'Base64',
    data: 'SGVsbG8gd29ybGQ=',
    ...overrides,
  }) as ObxContent;

const map = (
  contents: ObxContent[] = [tx('Patient stable.')],
  trigger = 'T02',
  txa: Partial<TxaFields> = {},
  evn: Partial<EvnFields> = {},
) =>
  mapToFhirDocumentReference(
    { ...TXA, ...txa },
    { ...EVN, ...evn },
    trigger,
    contents,
  );

describe('mapToFhirDocumentReference', () => {
  it('maps the T02 TX sample', () => {
    expect(map([tx('Patient stable, discharge planned tomorrow.')])).toEqual({
      resourceType: 'DocumentReference',
      masterIdentifier: { value: 'DOC5001' },
      status: 'current',
      docStatus: 'final',
      type: {
        coding: [
          { system: LOINC, code: '18842-5', display: 'Discharge summary' },
        ],
        text: 'Discharge summary',
      },
      // no date: none of TXA.6 / TXA.4 / EVN.2 has a timezone offset
      author: [{ display: 'Jane Doe' }],
      content: [
        {
          attachment: {
            contentType: 'text/plain',
            data: b64('Patient stable, discharge planned tomorrow.'),
            title: 'Discharge summary',
          },
        },
      ],
    });
  });

  it('never sets subject', () => {
    expect(map()).not.toHaveProperty('subject');
  });

  describe('status from the trigger', () => {
    it.each([
      ['T01', 'current'],
      ['T02', 'current'],
      ['T11', 'entered-in-error'],
    ])('%s -> %s', (trigger, status) => {
      expect(map([tx('x')], trigger).status).toBe(status);
    });

    it('throws a mapping error for any other trigger', () => {
      expect(() => map([tx('x')], 'T03')).toThrow(
        new DocumentMappingError(
          'Unsupported MDM trigger event "T03": expected one of T01, T02, T11',
        ),
      );
    });
  });

  describe('docStatus from TXA.17', () => {
    it.each([
      ['AU', 'final'],
      ['LA', 'final'],
      ['IP', 'preliminary'],
      ['DI', 'preliminary'],
      ['au', 'final'],
    ])('%s -> %s', (completionStatus, docStatus) => {
      expect(map(undefined, 'T02', { completionStatus }).docStatus).toBe(
        docStatus,
      );
    });

    it.each(['DO', 'IN', 'PA', 'XX'])(
      'omits docStatus for %p',
      (completionStatus) => {
        expect(map(undefined, 'T02', { completionStatus })).not.toHaveProperty(
          'docStatus',
        );
      },
    );
  });

  describe('type from TXA.2', () => {
    it.each([
      ['CN', '11488-4', 'Consult note'],
      ['DS', '18842-5', 'Discharge summary'],
      ['HP', '34117-2', 'History and physical note'],
      ['PN', '11506-3', 'Progress note'],
      ['OP', '11504-8', 'Operative note'],
      ['LR', '11502-2', 'Laboratory report'],
      ['RR', '18748-4', 'Diagnostic imaging report'],
    ])('%s -> LOINC %s', (documentTypeCode, code, display) => {
      expect(map(undefined, 'T02', { documentTypeCode }).type).toEqual({
        coding: [{ system: LOINC, code, display }],
        text: display,
      });
    });

    it('prefers TXA.2.2 for the text', () => {
      expect(
        map(undefined, 'T02', { documentTypeText: 'Discharge Summary Note' })
          .type?.text,
      ).toBe('Discharge Summary Note');
    });

    it('unknown code -> text only', () => {
      expect(map(undefined, 'T02', { documentTypeCode: 'ZZ' }).type).toEqual({
        text: 'ZZ',
      });
    });
  });

  describe('date (instant: needs a time and an offset)', () => {
    it('uses TXA.6 when it has an offset', () => {
      expect(
        map(undefined, 'T02', { originationDateTime: '202610080900+0530' })
          .date,
      ).toBe('2026-10-08T09:00:00+05:30');
    });

    it('skips TXA.6 without an offset and uses TXA.4 with one', () => {
      expect(
        map(undefined, 'T02', { activityDateTime: '202610080800+0530' }).date,
      ).toBe('2026-10-08T08:00:00+05:30');
    });

    it('falls back to EVN.2', () => {
      expect(
        map(undefined, 'T02', {}, { recordedDateTime: '202610081000-0400' })
          .date,
      ).toBe('2026-10-08T10:00:00-04:00');
    });

    it('skips invalid and date-only candidates', () => {
      expect(
        map(
          undefined,
          'T02',
          { originationDateTime: 'garbage', activityDateTime: '20261008' },
          { recordedDateTime: '202610081000+0000' },
        ).date,
      ).toBe('2026-10-08T10:00:00+00:00');
    });

    it('omits date when no candidate has an offset (the samples)', () => {
      expect(map()).not.toHaveProperty('date');
    });
  });

  describe('author from TXA.9', () => {
    it.each([
      [{ originatorFamilyName: '' }, 'Jane'],
      [{ originatorGivenName: '' }, 'Doe'],
    ])('uses whichever name part is present (%p)', (txa, display) => {
      expect(map(undefined, 'T02', txa).author).toEqual([{ display }]);
    });

    it('omits author when TXA.9 has no name', () => {
      expect(
        map(undefined, 'T02', {
          originatorFamilyName: '',
          originatorGivenName: '',
        }),
      ).not.toHaveProperty('author');
    });
  });

  describe('content without OBX', () => {
    it.each(['T01', 'T11'])('%s -> title-only attachment', (trigger) => {
      expect(map([], trigger).content).toEqual([
        { attachment: { title: 'Discharge summary' } },
      ]);
    });

    it('title: TXA.2.2, else LOINC display, else raw code', () => {
      expect(map([], 'T01', { documentTypeText: 'DS note' }).content).toEqual([
        { attachment: { title: 'DS note' } },
      ]);
      expect(map([], 'T01', { documentTypeCode: 'ZZ' }).content).toEqual([
        { attachment: { title: 'ZZ' } },
      ]);
    });

    it('T02 requires content', () => {
      expect(() => map([], 'T02')).toThrow(
        new DocumentMappingError(
          'MDM^T02 requires at least one OBX segment with the document content',
        ),
      );
    });
  });

  describe('text content (TX / FT)', () => {
    it('round-trips through base64', () => {
      const [{ attachment }] = map([tx('Patient stable, äöü & co.')]).content;
      expect(fromB64(attachment.data)).toBe('Patient stable, äöü & co.');
    });

    it('joins repetitions, \\.br\\ and several OBX with "\\n" into one attachment', () => {
      const content = map([
        tx(['line one', 'line two']),
        tx('three\\.br\\four', 'FT', ''),
        tx('five'),
      ]).content;
      expect(content).toHaveLength(1);
      expect(content[0].attachment.contentType).toBe('text/plain');
      expect(fromB64(content[0].attachment.data)).toBe(
        'line one\nline two\nthree\nfour\nfive',
      );
    });

    it('takes the title from the first OBX.3 text present; omits it if none', () => {
      expect(
        map([tx('a', 'TX', ''), tx('b', 'FT', 'Progress note')]).content[0]
          .attachment.title,
      ).toBe('Progress note');
      expect(map([tx('a', 'TX', '')]).content[0].attachment).not.toHaveProperty(
        'title',
      );
    });
  });

  describe('ED content', () => {
    it('passes Base64 data through, one attachment per ED', () => {
      expect(
        map([ed(), ed({ typeOfData: 'IM', dataSubtype: 'PNG', title: 'Scan' })])
          .content,
      ).toEqual([
        {
          attachment: {
            contentType: 'application/pdf',
            data: 'SGVsbG8gd29ybGQ=',
            title: 'Discharge summary',
          },
        },
        {
          attachment: {
            contentType: 'image/png',
            data: 'SGVsbG8gd29ybGQ=',
            title: 'Scan',
          },
        },
      ]);
    });

    it('omits contentType for an unknown type^subtype', () => {
      expect(
        map([ed({ typeOfData: 'AP', dataSubtype: 'XYZ' })]).content[0]
          .attachment,
      ).not.toHaveProperty('contentType');
    });

    it('maps TEXT^PLAIN', () => {
      expect(
        map([ed({ typeOfData: 'text', dataSubtype: 'plain' })]).content[0]
          .attachment.contentType,
      ).toBe('text/plain');
    });

    it('cannot be mixed with text', () => {
      expect(() => map([tx('a'), ed()])).toThrow(
        new DocumentMappingError(
          'Cannot mix text (TX/FT) and ED OBX values in one document',
        ),
      );
    });
  });
});

describe('edDataToBase64', () => {
  it.each([
    ['Base64', 'SGVsbG8gd29ybGQ=', 'Hello world'],
    ['base64', 'SGVsbG8gd29ybGQ=', 'Hello world'],
    ['A', 'Hello world', 'Hello world'],
    ['Hex', '48656c6c6f20776f726c64', 'Hello world'],
    ['HEX', '48656C6C6F', 'Hello'],
  ])('%s: output decodes back to the original', (encoding, data, original) => {
    expect(fromB64(edDataToBase64(encoding, data))).toBe(original);
  });

  it('passes Base64 through unchanged', () => {
    expect(edDataToBase64('Base64', 'SGVsbG8gd29ybGQ=')).toBe(
      'SGVsbG8gd29ybGQ=',
    );
  });

  it.each(['', 'UU', 'Base32'])(
    'throws naming an unsupported encoding (%p)',
    (encoding) => {
      expect(() => edDataToBase64(encoding, 'x')).toThrow(
        new DocumentMappingError(
          `Unsupported ED encoding "${encoding}" in OBX.5.4: expected Base64, A or Hex`,
        ),
      );
    },
  );

  it.each(['zz', '486', '48 65'])('rejects invalid hex %p', (data) => {
    expect(() => edDataToBase64('Hex', data)).toThrow(/not valid hex/);
  });
});

describe('hl7TextToPlain', () => {
  it('joins repetitions and turns \\.br\\ into newlines', () => {
    expect(hl7TextToPlain(['a\\.br\\b', 'c'])).toBe('a\nb\nc');
  });
});
