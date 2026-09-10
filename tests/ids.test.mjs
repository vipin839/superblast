import { describe, it, expect } from 'vitest';
import { newJobId, isValidJobId, newRid, isValidRid, JOB_ID_PATTERN } from '@/lib/ids';

describe('job identifiers (finding 02)', () => {
  it('are unique across a large sample', () => {
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(newJobId());
    expect(seen.size).toBe(20000);
  });

  it('match the pattern the API validates against', () => {
    for (let i = 0; i < 100; i++) expect(JOB_ID_PATTERN.test(newJobId())).toBe(true);
  });

  it('do not encode a timestamp', () => {
    // The old scheme was job-<base36 Date.now()>, so two ids minted in the
    // same second shared a long prefix. These must not.
    const a = newJobId().slice(4);
    const b = newJobId().slice(4);
    let shared = 0;
    while (shared < a.length && a[shared] === b[shared]) shared++;
    expect(shared).toBeLessThan(8);
  });

  it('rejects the old guessable format', () => {
    expect(isValidJobId('job-m0x1a2b')).toBe(false);
    expect(isValidJobId(`job-${Date.now().toString(36)}`)).toBe(false);
  });

  it('rejects non-string and malformed input', () => {
    for (const bad of [null, undefined, 42, {}, [], '', 'job_', 'job_ZZZ', 'job_' + 'a'.repeat(31)]) {
      expect(isValidJobId(bad)).toBe(false);
    }
  });
});

describe('BLAST request ids (finding 03)', () => {
  it('are 16 lowercase hex characters', () => {
    for (let i = 0; i < 200; i++) expect(newRid()).toMatch(/^[a-f0-9]{16}$/);
  });

  it('are unique across a large sample', () => {
    const seen = new Set();
    for (let i = 0; i < 20000; i++) seen.add(newRid());
    expect(seen.size).toBe(20000);
  });

  it('accepts a genuine rid', () => {
    expect(isValidRid(newRid())).toBe(true);
    expect(isValidRid('0123456789abcdef')).toBe(true);
  });

  it('rejects every path-traversal shape', () => {
    const attacks = [
      '../../etc/passwd', '../etc/passwd', '..', '../', '/etc/passwd',
      'C:\Windows\win.ini', '..\..\secret', '%2e%2e%2f', '..%2f..%2f',
      'a'.repeat(17), 'A123456789ABCDEF', '0123456789abcde',
      '0123456789abcdef/../x', 'final_0123456789abcdef', '0123456789abcde.',
      '0123456789abcdef\u0000', 'g123456789abcdef', '', '  ',
    ];
    for (const a of attacks) expect(isValidRid(a), `should reject ${JSON.stringify(a)}`).toBe(false);
  });
});
