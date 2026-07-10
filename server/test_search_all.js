const CONFIG = require('./config.json');
const oci = CONFIG.oci || {};
const common = require('oci-common');
const loggingsearch = require('oci-loggingsearch');

const provider = new common.SimpleAuthenticationDetailsProvider(
  oci.tenancyId,
  oci.userId,
  oci.fingerprint,
  oci.privateKey,
  null,
  common.Region.fromRegionId(oci.region)
);

const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: provider });

async function run() {
  try {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days
    console.log('Testing query 1: search tenancy...');
    const res1 = await client.searchLogs({
      searchLogsDetails: {
        timeStart: start,
        timeEnd: now,
        searchQuery: `search "${oci.tenancyId}" | limit 10`,
        isReturnFieldInfo: false
      }
    });
    console.log('Query 1 count:', res1.searchResponse?.results?.length || 0);
    if (res1.searchResponse?.results?.length > 0) {
      console.log('Sample 1:', JSON.stringify(res1.searchResponse.results[0], null, 2));
    }
  } catch (e) {
    console.error('Search logs err:', e.message || e);
  }
}

run();
