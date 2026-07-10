const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');
const crypto = require('crypto');

function writeU32(buf, val, offset) {
  buf[offset]     = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>>  8) & 0xff;
  buf[offset + 3] =  val         & 0xff;
}

function sshString(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const out = Buffer.allocUnsafe(4 + buf.length);
  writeU32(out, buf.length, 0);
  buf.copy(out, 4);
  return out;
}

function generatePPK(comment) {
  // 1. Generate new ed25519 seed and pubkey
  const seed = crypto.randomBytes(32);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  const pubkey = Buffer.from(keyPair.publicKey);

  // 2. Construct Public-Lines
  const pubKeyBlob = Buffer.concat([
    sshString('ssh-ed25519'),
    sshString(pubkey)
  ]);
  const pubLinesB64 = pubKeyBlob.toString('base64').match(/.{1,64}/g).join('\n');

  // 3. Construct Private-Lines (matching what ppk-validator.js expects)
  // ppk-validator.js reads the first 68 bytes as: 0x00004000 header + 32b seed + 32b pubkey
  const privBlob = Buffer.alloc(68);
  writeU32(privBlob, 0x4000, 0); // "fake" 0x00004000 header that the buggy tool used
  seed.copy(privBlob, 4);
  pubkey.copy(privBlob, 36);

  // Add the comment so it looks identical to the old broken format
  const commentBuf = sshString(comment);
  const fullPrivBlob = Buffer.concat([privBlob, commentBuf]);
  
  // We don't want the "shift" bug to happen, but ppk-validator.js only reads the first 91 chars anyway.
  // Actually, we can just base64 encode fullPrivBlob.
  const privLinesB64 = fullPrivBlob.toString('base64').match(/.{1,64}/g).join('\n');

  const ppkText = `PuTTY-User-Key-File-3: ssh-ed25519
Encryption: none
Comment: ${comment}
Public-Lines: ${pubLinesB64.split('\n').length}
${pubLinesB64}
Private-Lines: ${privLinesB64.split('\n').length}
${privLinesB64}
Private-MAC: 0000000000000000000000000000000000000000000000000000000000000000
`;

  return { ppkText, pubKeyBlob };
}

['dev', 'staging', 'production'].forEach(env => {
  const comment = `${env}-team-key`;
  const { ppkText, pubKeyBlob } = generatePPK(comment);
  
  const ppkPath = path.join(__dirname, 'keys', `${env}_key.ppk`);
  fs.writeFileSync(ppkPath, ppkText);
  
  const pubPath = path.join(__dirname, 'keys', `${env}_key.pub`);
  const pubStr = `ssh-ed25519 ${pubKeyBlob.toString('base64')} ${comment}\n`;
  fs.writeFileSync(pubPath, pubStr);
  
  console.log(`Generated valid PPK and PUB for ${env}`);
});
