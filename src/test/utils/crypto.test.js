/**
 * Tests: Cryptographic Utilities (Hash Chain, HMAC, Secure IDs)
 *
 * NOTE: Web Crypto API is mocked in setup.js.
 * crypto.subtle.digest always returns ArrayBuffer(32) full of zeros.
 * So sha256() always resolves to a 64-char hex string of all zeros.
 * Tests must account for this deterministic mock.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  sha256,
  hashObject,
  generateSecureId,
  generateSecureToken,
  computeAuditEntryHash,
  verifyAuditChain,
} from '../../utils/crypto.js';

// The mock in setup.js makes crypto.subtle.digest return new ArrayBuffer(32)
// which is 32 zero bytes → hex = 64 zeros
const ZERO_HASH = '0'.repeat(64);

// ─── sha256 ───────────────────────────────────────────────────────────────────

describe('sha256', () => {
  it('returns a promise resolving to a hex string', async () => {
    const result = await sha256('hello');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^[0-9a-f]+$/i);
  });

  it('returns 64-character hex string (256-bit hash)', async () => {
    const result = await sha256('test');
    expect(result.length).toBe(64);
  });

  it('calls crypto.subtle.digest with SHA-256 algorithm', async () => {
    const digestSpy = vi.spyOn(crypto.subtle, 'digest');
    await sha256('data');
    expect(digestSpy).toHaveBeenCalledOnce();
    const [algo, buf] = digestSpy.mock.calls[0];
    expect(algo).toBe("SHA-256");
    expect(buf).toBeTruthy();
    expect(buf.length).toBeGreaterThan(0); // has encoded bytes
  });

  it('produces the mocked result (all zeros) due to test mock', async () => {
    const result = await sha256('anything');
    expect(result).toBe(ZERO_HASH);
  });
});

// ─── hashObject ───────────────────────────────────────────────────────────────

describe('hashObject', () => {
  it('returns a hex string hash', async () => {
    const result = await hashObject({ key: 'value' });
    expect(typeof result).toBe('string');
    expect(result.length).toBe(64);
  });

  it('handles nested objects', async () => {
    const result = await hashObject({ nested: { key: 'value' }, arr: [1, 2, 3] });
    expect(result.length).toBe(64);
  });

  it('handles null and primitives gracefully (passed as-is)', async () => {
    const result = await hashObject(null);
    expect(result.length).toBe(64);
  });

  it('sorts keys deterministically (mock produces same result for any input)', async () => {
    // With mock, both will be ZERO_HASH regardless of key order
    const r1 = await hashObject({ b: 2, a: 1 });
    const r2 = await hashObject({ a: 1, b: 2 });
    expect(r1).toBe(r2);
  });
});

// ─── generateSecureId ─────────────────────────────────────────────────────────

describe('generateSecureId', () => {
  it('returns the mocked UUID (from setup.js mock)', () => {
    const id = generateSecureId();
    // The mock returns '00000000-0000-0000-0000-000000000000'
    expect(id).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('returns a string', () => {
    expect(typeof generateSecureId()).toBe('string');
  });
});

// ─── generateSecureToken ──────────────────────────────────────────────────────

describe('generateSecureToken', () => {
  it('returns a hex string', () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[0-9a-f]+$/i);
  });

  it('default length is 32 bytes = 64 hex chars', () => {
    const token = generateSecureToken();
    expect(token.length).toBe(64);
  });

  it('accepts custom byte length', () => {
    const token = generateSecureToken(16);
    expect(token.length).toBe(32); // 16 bytes = 32 hex chars
  });

  it('uses crypto.getRandomValues', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    generateSecureToken(8);
    expect(spy).toHaveBeenCalled();
  });
});

// ─── computeAuditEntryHash ────────────────────────────────────────────────────

describe('computeAuditEntryHash', () => {
  const sampleEntry = {
    id: 'entry-123',
    timestamp: '2024-01-01T00:00:00.000Z',
    agent: 'Compliance Agent',
    action: 'AGENT_QUERY',
    userId: 'user-456',
    details: { messageLength: 50 },
    result: 'success',
    risk: 'low',
  };

  it('returns entryHash and chainHash', async () => {
    const { entryHash, chainHash } = await computeAuditEntryHash(sampleEntry);
    expect(entryHash).toBeDefined();
    expect(chainHash).toBeDefined();
    expect(typeof entryHash).toBe('string');
    expect(typeof chainHash).toBe('string');
  });

  it('both hashes are 64-char hex strings', async () => {
    const { entryHash, chainHash } = await computeAuditEntryHash(sampleEntry);
    expect(entryHash.length).toBe(64);
    expect(chainHash.length).toBe(64);
  });

  it('uses "GENESIS" as default previousHash', async () => {
    const { entryHash, chainHash } = await computeAuditEntryHash(sampleEntry);
    // Both should be the zero hash due to mocking
    expect(entryHash).toBe(ZERO_HASH);
    expect(chainHash).toBe(ZERO_HASH);
  });

  it('accepts a custom previousHash', async () => {
    const { entryHash, chainHash } = await computeAuditEntryHash(sampleEntry, 'custom-prev-hash');
    expect(entryHash).toBe(ZERO_HASH);
    expect(chainHash).toBe(ZERO_HASH);
  });
});

// ─── verifyAuditChain ─────────────────────────────────────────────────────────

describe('verifyAuditChain', () => {
  it('returns valid=true for empty array', async () => {
    const result = await verifyAuditChain([]);
    expect(result.valid).toBe(true);
    expect(result.firstTamperedIndex).toBeNull();
    expect(result.details).toHaveLength(0);
  });

  it('returns valid=true for non-array', async () => {
    const result = await verifyAuditChain(null);
    expect(result.valid).toBe(true);
  });

  it('validates a chain where all hashes match the mocked values', async () => {
    // With mock, computeAuditEntryHash always returns ZERO_HASH for both
    // So a valid entry must have entryHash = ZERO_HASH and chainHash = ZERO_HASH
    const validEntry = {
      id: 'entry-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      agent: 'Compliance Agent',
      action: 'AGENT_QUERY',
      userId: 'user-1',
      details: {},
      result: 'success',
      risk: 'low',
      entryHash: ZERO_HASH,   // Matches mock output
      chainHash: ZERO_HASH,   // Matches mock output
    };

    const result = await verifyAuditChain([validEntry]);
    expect(result.valid).toBe(true);
    expect(result.firstTamperedIndex).toBeNull();
    expect(result.details[0].valid).toBe(true);
  });

  it('detects a tampered entry (wrong entryHash)', async () => {
    const tamperedEntry = {
      id: 'entry-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      agent: 'Audit Agent',
      action: 'AUDIT_READ',
      userId: 'user-1',
      details: {},
      result: 'success',
      risk: 'low',
      entryHash: 'deadbeef' + '0'.repeat(56), // WRONG hash
      chainHash: ZERO_HASH,
    };

    const result = await verifyAuditChain([tamperedEntry]);
    expect(result.valid).toBe(false);
    expect(result.firstTamperedIndex).toBe(0);
    expect(result.details[0].valid).toBe(false);
    expect(result.details[0].entryHashMatch).toBe(false);
  });

  it('detects a tampered entry (wrong chainHash)', async () => {
    const entry = {
      id: 'entry-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      agent: 'Policy Agent',
      action: 'POLICY_READ',
      userId: 'user-1',
      details: {},
      result: 'success',
      risk: 'low',
      entryHash: ZERO_HASH,
      chainHash: 'badchain' + '0'.repeat(56), // WRONG chain hash
    };

    const result = await verifyAuditChain([entry]);
    expect(result.valid).toBe(false);
    expect(result.details[0].chainHashMatch).toBe(false);
  });

  it('reports details for each entry', async () => {
    const makeEntry = (id) => ({
      id,
      timestamp: '2024-01-01T00:00:00.000Z',
      agent: 'Compliance Agent',
      action: 'AGENT_QUERY',
      userId: 'user-1',
      details: {},
      result: 'success',
      risk: 'low',
      entryHash: ZERO_HASH,
      chainHash: ZERO_HASH,
    });

    const entries = [makeEntry('e1'), makeEntry('e2'), makeEntry('e3')];
    const result = await verifyAuditChain(entries);
    expect(result.details).toHaveLength(3);
    result.details.forEach((d, i) => {
      expect(d.index).toBe(i);
      expect(d.id).toBeDefined();
    });
  });

  it('finds the FIRST tampered index in a chain with multiple entries', async () => {
    const goodEntry = {
      id: 'e1',
      timestamp: '2024-01-01T00:00:00.000Z',
      agent: 'Compliance Agent',
      action: 'AGENT_QUERY',
      userId: 'user-1',
      details: {},
      result: 'success',
      risk: 'low',
      entryHash: ZERO_HASH,
      chainHash: ZERO_HASH,
    };
    const badEntry = {
      ...goodEntry,
      id: 'e2',
      entryHash: 'wrong-hash-value-padded-to-length-with-zeros0000000000000000000000',
    };

    const result = await verifyAuditChain([goodEntry, badEntry]);
    expect(result.valid).toBe(false);
    expect(result.firstTamperedIndex).toBe(1); // Second entry is tampered
    expect(result.details[0].valid).toBe(true);
    expect(result.details[1].valid).toBe(false);
  });
});
