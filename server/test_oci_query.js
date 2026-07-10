const CONFIG = require('./config.json');
const oci = CONFIG.oci || {};
const common = require('oci-common');
const loggingsearch = require('oci-loggingsearch');

async function testQuery() {
  const provider = new common.SimpleAuthenticationDetailsProvider(
    oci.tenancyId, oci.userId, oci.fingerprint, oci.privateKey, null, common.Region.fromRegionId(oci.region)
  );
  const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: provider });
  const timeStart = new Date(Date.now() - 7 * 24 * 3600000); // 7 days!
  const timeEnd = new Date();

  console.log("Querying OCI Logging Search...");
  const searchRes = await client.searchLogs({
    searchLogsDetails: {
      timeStart: timeStart,
      timeEnd: timeEnd,
      searchQuery: `search "${oci.tenancyId}" | sort by datetime desc | limit 50`,
      isReturnFieldInfo: false
    }
  });

  const results = searchRes.searchResponse?.results || [];
  const vcnLogs = results.filter(r => {
    const type = r.data?.logContent?.data?.type || r.data?.type || "";
    return type.includes('vcn');
  });

  console.log(`Found ${results.length} total logs.`);
  console.log(`Found ${vcnLogs.length} VCN logs.`);
  if (vcnLogs.length > 0) {
    console.log("Sample VCN Log:", JSON.stringify(vcnLogs[0], null, 2));
  } else {
    // Show what log types we DO have
    const types = new Set(results.map(r => r.data?.logContent?.data?.type || r.data?.type || "unknown"));
    console.log("Available log types:", Array.from(types));
  }
}

testQuery().catch(console.error);
