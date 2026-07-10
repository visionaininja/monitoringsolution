const { Client } = require('ssh2');
const { loadPrivateKey } = require('./ppk-validator');

const c = new Client();
c.on('ready', () => {
  console.log('SSH READY');
  c.exec('kubectl top nodes', (err, stream) => {
    if (err) { console.error('EXEC ERR:', err); process.exit(1); }
    let out = '';
    stream.on('data', d => out += d).on('close', code => {
      console.log('TOP NODES EXIT:', code);
      console.log('OUT:', out);
      c.end();
    });
  });
}).on('error', err => {
  console.error('SSH ERR:', err.message);
  process.exit(1);
});

c.connect({
  host: '170.9.233.236',
  port: 22,
  username: 'dev',
  privateKey: loadPrivateKey('keys/dev_key.ppk')
});
