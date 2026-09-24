'use client'

const enc = new TextEncoder()
const dec = new TextDecoder()

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64.trim())
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function pemFormat(b64: string, label: string): string {
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`
}

function pemToBuf(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  return base64ToBuf(clean)
}

// AES (symmetric)

// Derive a 256-bit AES-GCM key from a passphrase using PBKDF2.
async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function aesEncrypt(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(passphrase, salt)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  )
  // package: salt | iv | ciphertext
  const out = new Uint8Array(salt.length + iv.length + cipher.byteLength)
  out.set(salt, 0)
  out.set(iv, salt.length)
  out.set(new Uint8Array(cipher), salt.length + iv.length)
  return bufToBase64(out.buffer)
}

export async function aesDecrypt(
  payload: string,
  passphrase: string,
): Promise<string> {
  const buf = new Uint8Array(base64ToBuf(payload))
  const salt = buf.slice(0, 16)
  const iv = buf.slice(16, 28)
  const data = buf.slice(28)
  const key = await deriveAesKey(passphrase, salt)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  )
  return dec.decode(plain)
}

export function randomPassphrase(bytes = 24): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return bufToBase64(arr.buffer).replace(/[+/=]/g, '').slice(0, 32)
}

// AES (binary files)

// نفس فكرة aesEncrypt بس على ArrayBuffer عشان تشتغل مع أي نوع ملف
const FILE_MAGIC = 'NMSENC1' // بصمة نتحقق منها عند فك التشفير

export async function aesEncryptFile(
  fileBuffer: ArrayBuffer,
  passphrase: string,
  originalName: string,
): Promise<ArrayBuffer> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(passphrase, salt)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer)

  // نضمّن اسم الملف الأصلي (مشفّراً ضمن نفس الحمولة) عشان نقدر نرجّعه
  // بدقة عند فك التشفير، بدل ما يفقد المستخدم امتداد/اسم ملفه الأصلي.
  const nameBytes = enc.encode(originalName)
  const nameLenBytes = new Uint8Array(2)
  new DataView(nameLenBytes.buffer).setUint16(0, nameBytes.length, false)

  const magicBytes = enc.encode(FILE_MAGIC)
  const out = new Uint8Array(
    magicBytes.length + salt.length + iv.length + nameLenBytes.length + nameBytes.length + cipher.byteLength,
  )
  let offset = 0
  out.set(magicBytes, offset); offset += magicBytes.length
  out.set(salt, offset); offset += salt.length
  out.set(iv, offset); offset += iv.length
  out.set(nameLenBytes, offset); offset += nameLenBytes.length
  out.set(nameBytes, offset); offset += nameBytes.length
  out.set(new Uint8Array(cipher), offset)
  return out.buffer
}

export async function aesDecryptFile(
  fileBuffer: ArrayBuffer,
  passphrase: string,
): Promise<{ data: ArrayBuffer; originalName: string }> {
  const buf = new Uint8Array(fileBuffer)
  const magicBytes = enc.encode(FILE_MAGIC)

  const magic = dec.decode(buf.slice(0, magicBytes.length))
  if (magic !== FILE_MAGIC) {
    throw new Error('هذا الملف غير مشفّر بهذا التطبيق أو تالف')
  }
  let offset = magicBytes.length
  const salt = buf.slice(offset, offset + 16); offset += 16
  const iv = buf.slice(offset, offset + 12); offset += 12
  const nameLen = new DataView(buf.buffer, buf.byteOffset + offset, 2).getUint16(0, false)
  offset += 2
  const originalName = dec.decode(buf.slice(offset, offset + nameLen))
  offset += nameLen
  const cipherData = buf.slice(offset)

  const key = await deriveAesKey(passphrase, salt)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherData)
    return { data: plain, originalName }
  } catch {
    throw new Error('كلمة المرور غير صحيحة أو الملف تالف')
  }
}

// RSA (asymmetric)

export interface RsaKeyPairPem {
  publicKey: string
  privateKey: string
}

export async function rsaGenerateKeyPair(
  modulusLength: 2048 | 4096 = 2048,
): Promise<RsaKeyPairPem> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  return {
    publicKey: pemFormat(bufToBase64(spki), 'PUBLIC KEY'),
    privateKey: pemFormat(bufToBase64(pkcs8), 'PRIVATE KEY'),
  }
}

export async function rsaEncrypt(
  plaintext: string,
  publicKeyPem: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'spki',
    pemToBuf(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const cipher = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    enc.encode(plaintext),
  )
  return bufToBase64(cipher)
}

export async function rsaDecrypt(
  payload: string,
  privateKeyPem: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBuf(privateKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  )
  const plain = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    key,
    base64ToBuf(payload),
  )
  return dec.decode(plain)
}

export function rsaMaxBytes(modulusLength: 2048 | 4096): number {
  return modulusLength / 8 - 2 * 32 - 2
}

// Password hashing

async function pbkdf2Hash(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    baseKey,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2Hash(password, salt)
  const out = new Uint8Array(salt.length + hash.length)
  out.set(salt, 0)
  out.set(hash, salt.length)
  return bufToBase64(out.buffer)
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const buf = new Uint8Array(base64ToBuf(stored))
    const salt = buf.slice(0, 16)
    const expected = buf.slice(16)
    const hash = await pbkdf2Hash(password, salt)
    if (hash.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i]
    return diff === 0
  } catch {
    return false
  }
}
