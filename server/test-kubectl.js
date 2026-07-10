const { Client } = require('ssh2');
const fs = require('fs');

const keyPath = './keys/production_key.ppk';
const { loadPrivateKey } = require('./ppk-validator');
let privateKey = loadPrivateKey(keyPath);

const conn = new Client();
conn.on('ready', () => {
  conn.exec('kubectl top pods -A', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).on('error', console.error)
.connect({
  host: '170.9.233.236',
  port: 22,
  username: 'dev',
  privateKey
});
