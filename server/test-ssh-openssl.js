const { Client } = require('ssh2');
const fs = require('fs');

const pemPriv = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA0gnhTdoihHOFDfZ8aKwKqMzp3fUvhXC2zWeWEj/aaN\n-----END PRIVATE KEY-----';

const conn = new Client();
conn.on('ready', () => {
  console.log('ready');
  conn.end();
}).on('error', console.error)
.connect({
  host: '170.9.233.236',
  port: 22,
  username: 'dev',
  privateKey: Buffer.from(pemPriv, 'utf8'),
  debug: console.log
});
