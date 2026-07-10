const common = require('oci-common');
const identity = require('oci-identity');
console.log(Object.keys(identity.IdentityClient.prototype).filter(k => k.includes('Compartment')));
