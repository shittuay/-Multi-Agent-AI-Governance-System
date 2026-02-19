/**
 * Cryptographic Utilities - Tamper Detection & Data Integrity
 *
 * Provides hashing, HMAC signing, and chain-of-custody verification
 * for audit logs and sensitive data. Uses Web Crypto API (native browser)
 * for cryptographic operations to avoid weak algorithms.
 */

// ─── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Computes a SHA-256 hash of a string using the Web Crypto API.
 * Returns a hex-encoded digest.
 * @param {string} data
 * @returns {Promise<string>} hex hash
 */
export async function sha256(data) {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Computes a SHA-256 hash of a JavaScript object (JSON serialized).
 * Keys are sorted for deterministic output.
 * @param {object} obj
 * @returns {Promise<string>} hex hash
 */
export async function hashObject(obj) {
  const sorted = sortObjectKeys(obj);
  const json = JSON.stringify(sorted);
  return sha256(json);
}

// ─── HMAC Signing ─────────────────────────────────────────────────────────────

/**
 * Generates a new random HMAC key (256-bit).
 * In production, use AWS KMS instead of generating local keys.
 * @returns {Promise<CryptoKey>}
 */
export async function generateHmacKey() {
  return crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true,   // extractable
    ['sign', 'verify']
  );
}

/**
 * Signs data with an HMAC key.
 * @param {CryptoKey} key
 * @param {string} data
 * @returns {Promise<string>} hex signature
 */
export async function hmacSign(key, data) {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const signature = await crypto.subtle.sign('HMAC', key, buffer);
  return bufferToHex(signature);
}

/**
 * Verifies an HMAC signature against data.
 * Uses constant-time comparison to prevent timing attacks.
 * @param {CryptoKey} key
 * @param {string} data
 * @param {string} signature - hex encoded
 * @returns {Promise<boolean>}
 */
export async function hmacVerify(key, data, signature) {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const sigBuffer = hexToBuffer(signature);
  return crypto.subtle.verify('HMAC', key, sigBuffer, buffer);
}

// ─── Audit Log Hash Chain ─────────────────────────────────────────────────────

/**
 * Computes the hash for an audit log entry, chaining it to the previous entry.
 * This creates a tamper-evident chain: modifying any entry invalidates all
 * subsequent hashes.
 *
 * @param {object} entry - The audit log entry (without hash fields)
 * @param {string} previousHash - Hash of the previous entry (or 'GENESIS' for first)
 * @returns {Promise<{ entryHash: string, chainHash: string }>}
 */
export async function computeAuditEntryHash(entry, previousHash = 'GENESIS') {
  // Hash the entry content alone
  const entryHash = await hashObject({
    id: entry.id,
    timestamp: entry.timestamp,
    agent: entry.agent,
    action: entry.action,
    userId: entry.userId,
    details: entry.details,
    result: entry.result,
    risk: entry.risk,
  });

  // Chain hash: hash(entryHash + previousHash) - linking to prior entry
  const chainHash = await sha256(`${entryHash}:${previousHash}`);

  return { entryHash, chainHash };
}

/**
 * Verifies the integrity of an audit log chain.
 * Returns an object with verification results.
 *
 * @param {Array<object>} entries - Ordered array of audit log entries (oldest first)
 * @returns {Promise<{ valid: boolean, firstTamperedIndex: number|null, details: Array }>}
 */
export async function verifyAuditChain(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { valid: true, firstTamperedIndex: null, details: [] };
  }

  const details = [];
  let previousHash = 'GENESIS';
  let firstTamperedIndex = null;

  for (let i = 0; i < entries.length; i++) {
    // eslint-disable-next-line security/detect-object-injection
    const entry = entries[i];
    const { entryHash, chainHash } = await computeAuditEntryHash(entry, previousHash);

    const entryValid = entry.entryHash === entryHash;
    const chainValid = entry.chainHash === chainHash;
    const isValid = entryValid && chainValid;

    details.push({
      index: i,
      id: entry.id,
      valid: isValid,
      entryHashMatch: entryValid,
      chainHashMatch: chainValid,
    });

    if (!isValid && firstTamperedIndex === null) {
      firstTamperedIndex = i;
    }

    previousHash = chainHash;
  }

  return {
    valid: firstTamperedIndex === null,
    firstTamperedIndex,
    details,
  };
}

// ─── Secure Random ────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure random ID (UUID v4 equivalent).
 */
export function generateSecureId() {
  return crypto.randomUUID();
}

/**
 * Generates a cryptographically secure random hex string.
 * @param {number} byteLength - Number of random bytes (default 32 = 256 bits)
 */
export function generateSecureToken(byteLength = 32) {
  const buffer = new Uint8Array(byteLength);
  crypto.getRandomValues(buffer);
  return bufferToHex(buffer.buffer);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj)
    .sort()
    .reduce((sorted, key) => {
      // eslint-disable-next-line security/detect-object-injection
      sorted[key] = sortObjectKeys(obj[key]);
      return sorted;
    }, {});
}
