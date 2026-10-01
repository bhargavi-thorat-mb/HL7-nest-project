import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Hl7ParserService } from '../hl7-shared/hl7-parser.service';
import { PatientService } from '../patient/patient.service';
import { ObservationService } from './observation.service';

const MSH =
  'MSH|^~\\&|MySenderApp|MyFacility|EHR|MyHospital|202508121410||ORU^R01|MSG0003|P|2.5';
const PID =
  'PID|1||123456^^^EHR^MR||Grand^John^Central||19750101|M|||123 Epic Way^^Verona^WI^53593||(608)271-9000|||S||999-99-9999';
const PV1 = 'PV1|1|O|OPD^200^1^EHR||||1234^Doe^Jane^A|||OP';
const OBR = 'OBR|1||OBR12345|11348-0^History of past illness^LN|||20250812';
// The sample exactly as given: "A" lands in OBX.6 (units) and the date in OBX.9 (probability).
const OBX_AS_GIVEN =
  'OBX|1|CWE|11348-0^History of past illness^LN||38341003^Hypertension^SCT|A|||20240812';
// Same values at their v2.5 positions: abnormal flag in OBX.8, date/time in OBX.14.
const OBX_SPEC =
  'OBX|1|CWE|11348-0^History of past illness^LN||38341003^Hypertension^SCT|||A||||||20240812';

const msg = (...segments: string[]) => segments.join('\n');

const EXPECTED_PATIENT = {
  resourceType: 'Patient',
  identifier: [{ value: '123456', system: 'EHR', type: { text: 'MR' } }],
  name: [{ family: 'Grand', given: ['John'] }],
  birthDate: '1975-01-01',
  gender: 'male',
};

const HISTORY_CODE = {
  coding: [
    {
      system: 'http://loinc.org',
      code: '11348-0',
      display: 'History of past illness',
    },
  ],
  text: 'History of past illness',
};

const HYPERTENSION = {
  coding: [
    {
      system: 'http://snomed.info/sct',
      code: '38341003',
      display: 'Hypertension',
    },
  ],
  text: 'Hypertension',
};

describe('ObservationService.extractOru', () => {
  let service: ObservationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ObservationService, PatientService, Hl7ParserService],
    }).compile();
    service = module.get<ObservationService>(ObservationService);
  });

  it('maps the spec-positioned sample to a Patient and one Observation', () => {
    expect(service.extractOru(msg(MSH, PID, PV1, OBR, OBX_SPEC))).toEqual({
      patient: EXPECTED_PATIENT,
      observations: [
        {
          resourceType: 'Observation',
          status: 'final',
          code: HISTORY_CODE,
          valueCodeableConcept: HYPERTENSION,
          interpretation: [
            {
              coding: [
                {
                  system:
                    'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                  code: 'A',
                  display: 'Abnormal',
                },
              ],
            },
          ],
          effectiveDateTime: '2024-08-12',
        },
      ],
    });
  });

  it('ignores the off-spec OBX.6/OBX.9 values in the sample as given', () => {
    // No interpretation (OBX.8 is empty) and the date falls back to OBR.7.
    expect(
      service.extractOru(msg(MSH, PID, PV1, OBR, OBX_AS_GIVEN)).observations,
    ).toEqual([
      {
        resourceType: 'Observation',
        status: 'final',
        code: HISTORY_CODE,
        valueCodeableConcept: HYPERTENSION,
        effectiveDateTime: '2025-08-12',
      },
    ]);
  });

  it('produces one Observation per OBX segment, in order', () => {
    const obx2 =
      'OBX|2|CWE|8480-6^Systolic blood pressure^LN||271649006^Systolic hypertension^SCT|||H';
    const { observations } = service.extractOru(
      msg(MSH, PID, OBR, OBX_SPEC, obx2),
    );
    expect(observations).toHaveLength(2);
    expect(observations[0].code.coding?.[0].code).toBe('11348-0');
    expect(observations[1].code.coding?.[0].code).toBe('8480-6');
    expect(observations[1].valueCodeableConcept?.text).toBe(
      'Systolic hypertension',
    );
    expect(observations[1].interpretation?.[0].coding?.[0].code).toBe('H');
    expect(observations[1].effectiveDateTime).toBe('2025-08-12'); // from OBR.7
  });

  it('throws 400 when there is no OBR segment', () => {
    const raw = msg(MSH, PID, OBX_SPEC);
    expect(() => service.extractOru(raw)).toThrow(BadRequestException);
    expect(() => service.extractOru(raw)).toThrow(/no OBR segment/);
  });

  it('throws 400 when there is no OBX segment', () => {
    const raw = msg(MSH, PID, OBR);
    expect(() => service.extractOru(raw)).toThrow(BadRequestException);
    expect(() => service.extractOru(raw)).toThrow(/no OBX segment/);
  });

  it('throws 400 naming the value type when OBX.2 is not CWE', () => {
    const numeric = 'OBX|2|NM|2345-7^Glucose^LN||95|mg/dL|70-99|N';
    const raw = msg(MSH, PID, OBR, OBX_SPEC, numeric);
    expect(() => service.extractOru(raw)).toThrow(BadRequestException);
    expect(() => service.extractOru(raw)).toThrow(
      'Unsupported OBX value type "NM" in OBX set ID 2: only CWE is supported',
    );
  });

  it('still throws 400 when there is no PID segment', () => {
    expect(() => service.extractOru(msg(MSH, OBR, OBX_SPEC))).toThrow(
      /no PID segment/,
    );
  });
});
