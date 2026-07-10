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
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const req = {
      searchLogsDetails: {
        timeStart: start,
        timeEnd: now,
        searchQuery: `search "${oci.compartmentId || oci.tenancyId}" | where type = 'apigateway.apideployment.access' | sort by datetime desc | limit 10`,
        isReturnFieldInfo: false
      }
    };
    console.log('Searching logs...');
    const res = await client.searchLogs(req);
    console.log('Results:', res.searchResponse?.summary?.resultCount);
    console.log('Sample:', JSON.stringify((res.searchResponse?.results || []).slice(0, 2), null, 2));
  } catch (e) {
    console.error('Search logs err:', e);
  }
}

run();
