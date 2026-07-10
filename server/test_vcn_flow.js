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

  // Let's search for any type = 'com.oraclecloud.vcn.flow'
  const queries = [
    `search "${oci.tenancyId}" | where type = 'com.oraclecloud.vcn.flow' | limit 20`,
    `search "${oci.tenancyId}" | where type = 'com.oraclecloud.vcn.flow.log' | limit 20`,
    `search "${oci.tenancyId}" | where type = 'com.oraclecloud.apigateway.access' | limit 20`,
    `search "${oci.tenancyId}" | limit 100`
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
        // Log all unique types found
        const types = new Set(results.map(r => r.data?.logContent?.type || r.data?.type));
        console.log(`Unique types found:`, Array.from(types));
        console.log(`Sample result:`, JSON.stringify(results[0], null, 2).substring(0, 1000));
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

run();
