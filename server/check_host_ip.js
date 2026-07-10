const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const { loadPrivateKey } = require('./ppk-validator');

const conn = new Client();
const keyPath = path.resolve(__dirname, 'keys/dev_key.ppk');
const privateKey = loadPrivateKey(keyPath);

conn.on('ready', () => {
  console.log('SSH Connection ready to 170.9.233.236');
  conn.exec('ip route && ip addr show', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT:\n' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR:\n' + data);
    });
  });
}).connect({
  host: '170.9.233.236',
  port: 22,
  username: 'dev',
  privateKey: privateKey
});
