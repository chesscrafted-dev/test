/**
 * Encryption Utility for E2EE using Web Crypto API.
 * 
 * Flow:
 * 1. Derive a Master Key from user password using PBKDF2.
 * 2. Encrypt/Decrypt messages using AES-256-GCM.
 */

const ITERATIONS = 100000;
const SALT_STRING = "e2ee-chat-salt-constant"; // In a real app, this should be unique per user (e.g., user_id)

/**
 * Converts a hex string to a Uint8Array.
 */
function hexToUint8Array(hex: string): Uint8Array {
  const match = hex.match(/.{1,2}/g);
  if (!match) return new Uint8Array(0);
  return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
}

/**
 * Converts a Uint8Array to a hex string.
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derives a CryptoKey from a raw password string.
 */
export async function deriveKey(password: string, salt?: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt || SALT_STRING),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plaintext string using the derived key.
 * Returns { ciphertext, iv, auth_tag } in hex format.
 */
export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string; auth_tag: string }> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    key,
    enc.encode(plaintext)
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);
  const tagLength = 16;
  const ciphertext = encryptedArray.slice(0, encryptedArray.length - tagLength);
  const authTag = encryptedArray.slice(encryptedArray.length - tagLength);

  return {
    ciphertext: uint8ArrayToHex(ciphertext),
    iv: uint8ArrayToHex(iv),
    auth_tag: uint8ArrayToHex(authTag),
  };
}

/**
 * Decrypts a ciphertext using the derived key.
 */
export async function decryptMessage(
  ciphertextHex: string,
  ivHex: string,
  authTagHex: string,
  key: CryptoKey
): Promise<string> {
  const dec = new TextDecoder();
  const ciphertext = hexToUint8Array(ciphertextHex);
  const iv = hexToUint8Array(ivHex);
  const authTag = hexToUint8Array(authTagHex);

  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      combined
    );
    return dec.decode(decryptedBuffer);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "[Decryption Error: Invalid Password or Corrupted Data]";
  }
}

/**
 * Encrypts a File object.
 * Returns { ciphertext: Blob, iv: string, auth_tag: string }
 */
export async function encryptFile(
  file: File,
  key: CryptoKey
): Promise<{ ciphertext: Blob; iv: string; auth_tag: string }> {
  const fileBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    key,
    fileBuffer
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);
  const tagLength = 16;
  const ciphertext = encryptedArray.slice(0, encryptedArray.length - tagLength);
  const authTag = encryptedArray.slice(encryptedArray.length - tagLength);

  return {
    ciphertext: new Blob([ciphertext]),
    iv: uint8ArrayToHex(iv),
    auth_tag: uint8ArrayToHex(authTag),
  };
}

/**
 * Decrypts a Blob back into a Uint8Array.
 */
export async function decryptFile(
  encryptedBlob: Blob,
  ivHex: string,
  authTagHex: string,
  key: CryptoKey
): Promise<Uint8Array | null> {
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  const ciphertext = new Uint8Array(encryptedBuffer);
  const iv = hexToUint8Array(ivHex);
  const authTag = hexToUint8Array(authTagHex);

  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as any },
      key,
      combined
    );
    return new Uint8Array(decryptedBuffer);
  } catch (e) {
    console.error("File decryption failed:", e);
    return null;
  }
}
