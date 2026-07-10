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
  const start = new Date(now.getTime() - 30 * 24 * 3600000); // 30 days

  const queries = [
    `search "${oci.tenancyId}" | where type = 'com.oraclecloud.vcn.flow' | limit 10`,
    `search "${oci.tenancyId}" | sort by datetime desc | limit 500`
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
        const types = new Set(results.map(r => r.data?.logContent?.type || r.data?.type));
        console.log(`Unique types found:`, Array.from(types));
        if (q.includes('vcn.flow')) {
          console.log(`Sample VCN flow log:`, JSON.stringify(results[0], null, 2));
        }
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}

run();
