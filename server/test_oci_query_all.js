const CONFIG = require('./config.json');
const oci = CONFIG.oci || {};
const common = require('oci-common');
const loggingsearch = require('oci-loggingsearch');

async function testQuery() {
  const provider = new common.SimpleAuthenticationDetailsProvider(
    oci.tenancyId, oci.userId, oci.fingerprint, oci.privateKey, null, common.Region.fromRegionId(oci.region)
  );
  const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: provider });
  const timeStart = new Date(Date.now() - 24 * 3600000); // 1 day
  const timeEnd = new Date();

  console.log("Querying OCI Logging Search...");
  const searchRes = await client.searchLogs({
    searchLogsDetails: {
      timeStart: timeStart,
      timeEnd: timeEnd,
      searchQuery: `search "${oci.tenancyId}" | sort by datetime desc | limit 20`,
      isReturnFieldInfo: false
    }
  });

  const results = searchRes.searchResponse?.results || [];
  console.log(`Found ${results.length} total logs.`);
  if (results.length > 0) {
    console.log("Sample Log:", JSON.stringify(results[0], null, 2));
  }
}

testQuery().catch(console.error);
