import { BadRequestException, Injectable } from '@nestjs/common';
import { Message } from 'node-hl7-client';

/**
 * HL7 separates segments with \r, but pasted/JSON-posted messages often use \n or \r\n.
 * Convert everything to \r and drop trailing \r/whitespace so no empty segment is left at the end.
 */
export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n|\n/g, '\r').replace(/[\r\s]+$/, '');
}

/** MSH.9 components as received (not trimmed or uppercased). */
export interface MessageType {
  messageCode: string; // MSH.9.1 - e.g. ADT, ORU (HL7 table 0076)
  triggerEvent: string; // MSH.9.2 - e.g. A01, R01 (HL7 table 0003)
}

/**
 * Generic HL7 v2 text handling shared by every resource module.
 *
 * HL7 v2 structure:
 *   - segments: one per line (\r-separated), named by their first 3 chars (MSH, EVN, PID...)
 *   - fields:   separated by |       -> PID.3 is the 3rd field after "PID"
 *   - components: separated by ^     -> PID.3.4 is the 4th ^-piece of PID.3
 *   e.g. "789456^^^CH^MR" -> PID.3.1=789456, PID.3.4=CH, PID.3.5=MR
 */
@Injectable()
export class Hl7ParserService {
  /** Normalize line endings and parse; empty or malformed input becomes a 400. */
  parse(raw: string): Message {
    // Check before parsing: node-hl7-client treats empty text as "build a new message", not an error.
    const text = normalizeLineEndings(raw ?? '');
    if (!text) {
      throw new BadRequestException('HL7 message is empty');
    }

    // The parser is strict (e.g. the text must start with MSH) and throws a plain Error on bad input.
    try {
      return new Message({ text });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Could not parse HL7 message: ${reason}`);
    }
  }

  /** Throw a 400 unless the message contains at least one `name` segment (e.g. 'PID'). */
  requireSegment(message: Message, name: string): void {
    // get() on a missing segment returns an empty node rather than throwing, so check explicitly.
    if (!message.exists(name)) {
      throw new BadRequestException(`HL7 message has no ${name} segment`);
    }
  }

  /**
   * Read the message type from MSH.9 (code^trigger^structure, e.g. ADT^A01^ADT_A01).
   * Values are returned as received; callers normalize them. Empty code or trigger -> 400.
   */
  getMessageType(raw: string): MessageType {
    const message = this.parse(raw);

    // Read the components separately: get('MSH.9').toString() returns only the first one.
    // A missing or short MSH.9 reads as "" (empty node), never a throw, so check both values;
    // exists('MSH.9') alone would accept "^A01".
    const messageCode = message.get('MSH.9.1').toString();
    const triggerEvent = message.get('MSH.9.2').toString();

    const missing = [
      !messageCode.trim() && 'MSH.9.1 (message code)',
      !triggerEvent.trim() && 'MSH.9.2 (trigger event)',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new BadRequestException(
        `HL7 message type is missing or incomplete: ${missing.join(' and ')} is empty`,
      );
    }

    return { messageCode, triggerEvent };
  }
}
