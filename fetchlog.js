const https = require('https');
const fs = require('fs');
const req = https.get('http://localhost:4000/api/github-logs?owner=yourspeak&repo=yourspeak-fe&jobId=26658098319', {
  headers: {
    'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN
  }
}, res => {
  let data = '';
  res.on('data', chunk => {
    data += chunk;
    if (data.length > 10000) {
      fs.writeFileSync('sample-log.txt', data);
      console.log('Saved sample-log.txt');
      process.exit(0);
    }
  });
  res.on('end', () => {
    fs.writeFileSync('sample-log.txt', data);
    console.log('Saved full sample-log.txt');
  });
});
req.on('error', console.error);
