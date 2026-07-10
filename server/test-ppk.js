/**
 * test-ppk.js  — Run with: node test-ppk.js
 * Tests that all .ppk files in server/keys/ convert correctly to OpenSSH format
 * and are parseable by ssh2.
 */
'use strict'

const fs   = require('fs')
const path = require('path')
const { loadPrivateKey, validatePpk } = require('./ppk-validator')
const { parseKey } = require('ssh2/lib/protocol/keyParser')

const keysDir = path.resolve(__dirname, 'keys')
const ppkFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.ppk'))

if (ppkFiles.length === 0) {
  console.error('No .ppk files found in server/keys/')
  process.exit(1)
}

let allPassed = true

for (const file of ppkFiles) {
  const filePath = path.join(keysDir, file)
  console.log(`\nTesting: ${file}`)

  try {
    // Step 1: validate format
    const buf = fs.readFileSync(filePath)
    validatePpk(buf)
    console.log('  [OK] validatePpk() passed')

    // Step 2: convert and parse
    const opensshPem = loadPrivateKey(filePath)
    console.log('  [OK] loadPrivateKey() converted to OpenSSH PEM successfully')

    // Step 3: verify ssh2 can parse it
    const parsed = parseKey(opensshPem)
    if (parsed instanceof Error) throw parsed
    const keys = Array.isArray(parsed) ? parsed : [parsed]
    console.log(`  [OK] ssh2 parsed key: type=${keys[0].type}, comment="${keys[0].comment}"`)

    // Step 4: show first few chars of PEM to confirm format
    const pem = opensshPem.toString('utf8')
    console.log(`  [OK] PEM header: ${pem.split('\n')[0]}`)
  } catch (err) {
    console.error(`  [FAIL] ${err.message}`)
    allPassed = false
  }
}

console.log('\n' + (allPassed ? '✔ All PPK files converted and verified OK' : '✘ Some files FAILED'))
process.exit(allPassed ? 0 : 1)
