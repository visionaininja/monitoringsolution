const fs = require('fs');

try {
  const pem = fs.readFileSync('dev_key_new', 'utf8');
  const lines = pem.split('\n');
  const b64 = lines.slice(1, lines.length - 2).join('');
  const buf = Buffer.from(b64, 'base64');

  const pubIdx = buf.indexOf(Buffer.from('ssh-ed25519')) + 11 + 4;
  const pubKey = buf.subarray(pubIdx, pubIdx + 32);

  const privIdx = buf.lastIndexOf(Buffer.from('ssh-ed25519')) + 11 + 4;
  const privKey = buf.subarray(privIdx + 32 + 4, privIdx + 32 + 4 + 32);

  const pubPrefix = Buffer.from('\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20', 'binary');
  const pubBlob = Buffer.concat([pubPrefix, pubKey]).toString('base64');

  const privBlob = Buffer.concat([Buffer.from('\x00\x00\x40\x00', 'binary'), privKey, pubKey]).toString('base64');

  const privLines = privBlob.match(/.{1,64}/g) || [];

  const ppk = `PuTTY-User-Key-File-3: ssh-ed25519
Encryption: none
Comment: dev-team-key
Public-Lines: 1
${pubBlob}
Private-Lines: ${privLines.length}
${privLines.join('\n')}
Private-MAC: 0000000000000000000000000000000000000000000000000000000000000000
`;
  fs.writeFileSync('server/keys/dev_key.ppk', ppk);
  fs.writeFileSync('server/keys/dev_key.pub', fs.readFileSync('dev_key_new.pub', 'utf8'));
  console.log('Successfully generated dev_key.ppk!');
} catch (e) {
  console.error(e);
}
