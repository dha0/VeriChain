/**
 * Cryptographic Utility for Document Tamper Detection & Client-Side Privacy
 * Uses standard W3C Web Crypto API (SubtleCrypto) supported natively in modern browsers.
 */

/**
 * Computes the SHA-256 hash of a file or ArrayBuffer.
 * Returns a 0x-prefixed 64-character hexadecimal string (32 bytes),
 * exactly compatible with Solidity's `bytes32` type.
 *
 * @param data File object or ArrayBuffer of the uploaded document (PDF/Image)
 * @returns Promise<string> formatted as "0x[64 hex chars]"
 */
export async function computeSHA256(data: File | ArrayBuffer): Promise<string> {
  let buffer: ArrayBuffer;

  if (data instanceof File) {
    buffer = await data.arrayBuffer();
  } else {
    buffer = data;
  }

  // Generate 256-bit SHA-256 hash using native Web Crypto API
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);

  // Convert ArrayBuffer to byte array
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // Convert bytes to hex string
  const hexString = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Prepend "0x" so ethers.js treats it as valid bytes32
  return `0x${hexString}`;
}

/**
 * Validates whether a given string is a valid 32-byte hex string (bytes32).
 */
export function isValidBytes32(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Generates a random cryptographic access key for AES-256-GCM (hex string).
 */
export function generateAccessKey(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Imports a raw hex key string as a CryptoKey for AES-GCM.
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
  const cleanHex = hexKey.replace(/^0x/, "");
  const keyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts an ArrayBuffer with AES-256-GCM using client-side Web Crypto.
 * Returns the encrypted ArrayBuffer and the 12-byte IV in hex format.
 */
export async function encryptDocument(
  data: ArrayBuffer,
  hexKey: string
): Promise<{ encryptedBuffer: ArrayBuffer; ivHex: string }> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit recommended IV for GCM

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );

  const ivHex = Array.from(iv)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { encryptedBuffer, ivHex };
}

/**
 * Decrypts an encrypted ArrayBuffer using AES-256-GCM and the supplied hex key and IV.
 */
export async function decryptDocument(
  encryptedData: ArrayBuffer,
  hexKey: string,
  ivHex: string
): Promise<ArrayBuffer> {
  const key = await importKey(hexKey);
  const ivBytes = new Uint8Array(ivHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);

  return await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes,
    },
    key,
    encryptedData
  );
}
