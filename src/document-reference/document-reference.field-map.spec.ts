import {
  DOC_STATUS_MAP,
  DOC_TYPE_LOINC_MAP,
  ED_CONTENT_TYPE_MAP,
  LOINC,
  TRIGGER_STATUS_MAP,
  TXA_FIELD_MAP,
} from './document-reference.field-map';

describe('TXA_FIELD_MAP', () => {
  it('points at the TXA positions confirmed in step 0', () => {
    expect(TXA_FIELD_MAP).toEqual({
      documentTypeCode: { path: 'TXA.2', required: true },
      documentTypeText: { path: 'TXA.2.2' },
      activityDateTime: { path: 'TXA.4' },
      originationDateTime: { path: 'TXA.6' },
      originatorFamilyName: { path: 'TXA.9.2' },
      originatorGivenName: { path: 'TXA.9.3' },
      uniqueDocumentNumber: { path: 'TXA.12', required: true },
      completionStatus: { path: 'TXA.17', required: true },
    });
  });

  it('requires TXA.2, TXA.12 and TXA.17 only (TXA.1 and TXA.19 are not read)', () => {
    const paths = Object.values(TXA_FIELD_MAP).map((field) => field.path);
    const required = Object.values(TXA_FIELD_MAP)
      .filter((field) => 'required' in field && field.required)
      .map((field) => field.path);
    expect(required).toEqual(['TXA.2', 'TXA.12', 'TXA.17']);
    expect(paths).not.toContain('TXA.1');
    expect(paths).not.toContain('TXA.19');
  });
});

describe('code maps', () => {
  it('TRIGGER_STATUS_MAP', () => {
    expect(TRIGGER_STATUS_MAP).toEqual({
      T01: 'current',
      T02: 'current',
      T11: 'entered-in-error',
    });
  });

  it('DOC_STATUS_MAP', () => {
    expect(DOC_STATUS_MAP).toEqual({
      AU: 'final',
      LA: 'final',
      IP: 'preliminary',
      DI: 'preliminary',
    });
  });

  it('DOC_TYPE_LOINC_MAP uses http://loinc.org codes', () => {
    expect(LOINC).toBe('http://loinc.org');
    expect(DOC_TYPE_LOINC_MAP).toEqual({
      CN: { code: '11488-4', display: 'Consult note' },
      DS: { code: '18842-5', display: 'Discharge summary' },
      HP: { code: '34117-2', display: 'History and physical note' },
      PN: { code: '11506-3', display: 'Progress note' },
      OP: { code: '11504-8', display: 'Operative note' },
      LR: { code: '11502-2', display: 'Laboratory report' },
      RR: { code: '18748-4', display: 'Diagnostic imaging report' },
    });
  });

  it('ED_CONTENT_TYPE_MAP', () => {
    expect(ED_CONTENT_TYPE_MAP).toEqual({
      'AP^PDF': 'application/pdf',
      'IM^PNG': 'image/png',
      'TEXT^PLAIN': 'text/plain',
    });
  });
});
