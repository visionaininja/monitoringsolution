const CONFIG = require('./config.json');
const oci = CONFIG.oci || {};
const common = require('oci-common');
const core = require('oci-core');
const identity = require('oci-identity');

const provider = new common.SimpleAuthenticationDetailsProvider(
  oci.tenancyId, oci.userId, oci.fingerprint, oci.privateKey, null, common.Region.fromRegionId(oci.region)
);

const identityClient = new identity.IdentityClient({ authenticationDetailsProvider: provider });
const coreClient = new core.VirtualNetworkClient({ authenticationDetailsProvider: provider });

async function run() {
  try {
    console.log("Listing all Compartments...");
    const compartmentsRes = await identityClient.listCompartments({
      compartmentId: oci.tenancyId,
      compartmentIdInSubtree: true,
      accessLevel: "ACCESSIBLE"
    });
    const compartments = [{ id: oci.tenancyId, name: "Tenancy Root" }, ...(compartmentsRes.items || [])];
    console.log(`Found ${compartments.length} compartment(s). Searching VCNs...`);

    for (let comp of compartments) {
      const vcnsRes = await coreClient.listVcns({ compartmentId: comp.id });
      const vcns = vcnsRes.items || [];
      if (vcns.length > 0) {
        console.log(`\nCompartment: ${comp.name} (${comp.id})`);
        for (let vcn of vcns) {
          console.log(`  - VCN Name: ${vcn.displayName}, CIDR: ${vcn.cidrBlock}, OCID: ${vcn.id}`);
          const subnetsRes = await coreClient.listSubnets({ compartmentId: comp.id, vcnId: vcn.id });
          const subnets = subnetsRes.items || [];
          for (let sub of subnets) {
            console.log(`    * Subnet: ${sub.displayName}, CIDR: ${sub.cidrBlock}, OCID: ${sub.id}`);
          }
        }
      }
    }
  } catch (e) {
    console.log("Error querying compartments/subnets:", e.message);
  }
}

run();
