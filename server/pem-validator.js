const fs = require('fs')
const { parseKey } = require('ssh2/lib/protocol/keyParser')

function validatePem(buffer) {
  const text = buffer.toString('utf8').trim()

  if (/^(ssh-rsa|ssh-ed25519|ssh-dss|ecdsa-)/.test(text) && !text.includes('BEGIN')) {
    throw new Error(
      'This file is a public key, not a private key. In PuTTYgen use Conversions → Export OpenSSH key (not "Copy public key").'
    )
  }

  const isPrivateKey =
    text.includes('-----BEGIN OPENSSH PRIVATE KEY-----') ||
    text.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    text.includes('-----BEGIN EC PRIVATE KEY-----') ||
    text.includes('-----BEGIN PRIVATE KEY-----') ||
    text.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')

  if (!isPrivateKey) {
    throw new Error('Not a valid OpenSSH/PEM private key file')
  }

  const parsed = parseKey(buffer)
  if (parsed instanceof Error) {
    throw new Error(`Invalid private key: ${parsed.message}`)
  }

  const keys = Array.isArray(parsed) ? parsed : [parsed]
  if (!keys.length || keys[0].getPrivatePEM() === null) {
    throw new Error('PEM file does not contain a usable private key')
  }

  return true
}

function loadPrivateKey(pemPath) {
  const buffer = fs.readFileSync(pemPath)
  validatePem(buffer)
  return buffer
}

module.exports = { validatePem, loadPrivateKey }
