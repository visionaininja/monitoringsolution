const CONFIG = require('./config.json');
const oci = CONFIG.oci || {};
const common = require('oci-common');
try {
  const loggingsearch = require('oci-loggingsearch');
  console.log('oci-loggingsearch required successfully');
} catch (e) {
  console.log('oci-loggingsearch require failed:', e.message);
}
