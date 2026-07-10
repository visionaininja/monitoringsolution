const fs = require('fs');
const { Client } = require('ssh2');
const path = require('path');
const config = require('./config.json');
const { loadPrivateKey } = require('./ppk-validator');

const envCfg = config.envs.dev;
const keyPath = path.resolve(__dirname, envCfg.keyPath);
const privateKey = loadPrivateKey(keyPath);

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  const cmd = `kubectl auth can-i create pods -n yourspeak-be-dev-v2`;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let data = '';
    stream.on('close', (code, signal) => {
      console.log('OUTPUT:\n' + data);
      conn.end();
    }).on('data', (d) => {
      data += d;
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: envCfg.host,
  port: envCfg.sshPort,
  username: envCfg.username,
  privateKey: privateKey
});
