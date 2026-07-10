const { Client } = require('ssh2');
const { loadPrivateKey } = require('./ppk-validator');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('uptime', (err, stream) => {
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
}).on('error', (err) => {
  console.log('Client :: error :: ' + err);
}).on('end', () => {
  console.log('Client :: end');
}).on('close', () => {
  console.log('Client :: close');
}).connect({
  host: '170.9.233.236',
  port: 22,
  username: 'dev',
  privateKey: loadPrivateKey('keys/dev_key.ppk'),
  debug: console.log
});
