const PASSWORD_HASH_PREFIX = "pbkdf2$sha256";
const DERIVED_KEY_LENGTH = 32;

const base64ToBytes = (value: string): Uint8Array => {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes;
};

const derivePasswordHash = async (
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      iterations
    },
    keyMaterial,
    DERIVED_KEY_LENGTH * 8
  );

  return new Uint8Array(bits);
};

const timingSafeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left[i] ^ right[i];
  }

  return mismatch === 0;
};

export const verifyPasswordHash = async (
  password: string,
  encodedHash: string
): Promise<boolean> => {
  const parts = encodedHash.split("$");
  if (parts.length !== 5) {
    return false;
  }

  const [algorithm, hashName, iterationText, saltBase64, hashBase64] = parts;
  if (`${algorithm}$${hashName}` !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  let saltBytes: Uint8Array;
  let expectedHash: Uint8Array;

  try {
    saltBytes = base64ToBytes(saltBase64);
    expectedHash = base64ToBytes(hashBase64);
  } catch {
    return false;
  }

  const computedHash = await derivePasswordHash(password, saltBytes, iterations);
  return timingSafeEqual(computedHash, expectedHash);
};
