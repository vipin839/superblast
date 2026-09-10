import crypto from 'crypto';

/**
 * Identifier generation and validation, defined together so the two can
 * never drift apart.
 *
 * Job IDs were previously `job-${Date.now().toString(36)}`: guessable,
 * enumerable, and a disclosure of submission time. They are now 128 bits of
 * CSPRNG output. This is defence in depth only — every route that touches a
 * job still verifies ownership against a verified ID token.
 */

export const JOB_ID_PATTERN = /^job_[0-9a-f]{32}$/;

export function newJobId() {
  return `job_${crypto.randomBytes(16).toString('hex')}`;
}

export function isValidJobId(id) {
  return typeof id === 'string' && JOB_ID_PATTERN.test(id);
}

/**
 * BLAST request IDs: 8 random bytes rendered as 16 lowercase hex characters.
 * These become filename components, so the validator in apiAuth.js
 * (RID_PATTERN) must match this generator exactly.
 */
export const RID_PATTERN = /^[a-f0-9]{16}$/;

export function newRid() {
  return crypto.randomBytes(8).toString('hex');
}

export function isValidRid(rid) {
  return typeof rid === 'string' && RID_PATTERN.test(rid);
}
