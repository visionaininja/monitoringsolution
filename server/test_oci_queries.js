const CONFIG = require('./config.json');
const oci = CONFIG.oci || {};
const common = require('oci-common');
const loggingsearch = require('oci-loggingsearch');

const provider = new common.SimpleAuthenticationDetailsProvider(
  oci.tenancyId, oci.userId, oci.fingerprint, oci.privateKey, null, common.Region.fromRegionId(oci.region)
);

const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: provider });

async function run() {
  const now = new Date();
  const start = new Date(now.getTime() - 14 * 24 * 3600000); // 14 days

  const queries = [
    `search "${oci.tenancyId}" | where type = 'com.oraclecloud.apigateway.access' | limit 10`,
    `search "${oci.tenancyId}" | where message = '*api/chat*' | limit 10`,
    `search "${oci.tenancyId}" | where message = '*HTTP*' | limit 10`,
    `search "${oci.tenancyId}" | where type like '*apigateway*' | limit 10`,
    `search "${oci.tenancyId}" | limit 20`
  ];

  for (let q of queries) {
    console.log(`\n--- Running: ${q}`);
    try {
      const res = await client.searchLogs({
        searchLogsDetails: { timeStart: start, timeEnd: now, searchQuery: q, isReturnFieldInfo: false }
      });
      const results = res.searchResponse?.results || [];
      console.log(`Count: ${results.length}`);
      if (results.length > 0) {
        console.log(`Sample type:`, results[0].data?.logContent?.type || results[0].data?.type);
        console.log(`Sample msg:`, results[0].data?.logContent?.data?.message || results[0].data?.logContent?.message || JSON.stringify(results[0]).substring(0, 150));
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

run();
