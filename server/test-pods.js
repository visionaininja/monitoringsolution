const { Client } = require('ssh2');
const fs = require('fs');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('kubectl top pods -A --no-headers', (err, stream) => {
    let out = '', errOut = '';
    stream.on('data', d => out+=d).stderr.on('data', d => errOut+=d);
    stream.on('close', () => { 
      console.log('OUT:', out.substring(0, 100)); 
      console.log('ERR:', errOut.substring(0, 100)); 
      conn.end(); 
    });
  });
}).connect({
  host: '170.9.233.236',
  port: 22,
  username: 'dev',
  privateKey: require('./ppk-validator').loadPrivateKey('./keys/dev_key.ppk') 
});
