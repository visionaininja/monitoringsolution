const common = require('oci-common');
const identity = require('oci-identity');

const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAurq9UYV5f6XQY2s+rA3oBqqcPAQTK1ZAeQEhsONkC0vPPL+p
etMN78MAVoPiIXNQWpHVVnSe5KjrXka97TViRkysRHov02j6fjIJ0BlbQzP+sr3k
QpvByAVxL2tzH5YMXJl2+ADD1SQp53lpENsRd6rsCy9tFch6eJ29R2EPo1OvmOl1
Ym2V4hvLX6CCdpaLl1W8OQgiin0l5SzhnGdlhiwLO/iP9zho6YjCzpamKsxTsFSe
UnNhVBFz9/N2NQV8thGRchcSrEFb2cWLz2S7zXI5QMG5s+mFu8TMiYCWy6e4wWBo
MjJ6gJqUfU2El6yFKpBhe7b2pY1TH4p6P+76rwIDAQABAoIBAQC3jXUoO5JxXed4
syVKL+lTFEa74C2PvhtmVyxtGzluuTifuK+6otjiRMeCQ+X3h8kHHq+dasn+b+Xe
KJ/uGzndbOUx8wIsSNdjUYC/5Q0HBIdr4KoOp9lW67KVMIRcGj1QkTKXGvll/USL
25biENYc0hFx9U6/yPBKvJQhJFIg8yZPyhnwnrLarcgIiA2H3haCwmQC6le+HpxL
rRbhsZ+/oUIERPAPZSrvlJcvRb7yzRxF+q94YV30QqQH3ERwc38gfMGq/X8uFbGQ
pl5TQvM/Wi6Og/wTy8pk7+uMkyDtRbUSJQ8HJj3fZmSLjwCSydZHDtGZYWv2RQoP
asWxDq3BAoGBAONXXjjfZIkHch68nxX1tCds1ukOpjEi9L4cErs33MSYz8XSMB2v
L3VnNRQovTc7QRMUBhNjpbVJ+q9BWVFaxksRSwZY3gy8Wyn5NyDGU7Hs0kJVn88V
eGPH5FeN1qwChEZ9VXTEGl5m638l9X20pBS9p/EjWodfierN6DR9GLTfAoGBANJE
xNuGRHn6JAROMEA2OeSOWG1N0ct6BoYvGJkU1URG7wx6gD2/F8/YYqT99/WMx2lS
X9zaNz8efPEI+EYqfnVdfHB5n1kJ8KOta/gnhk2nQOE+HHZKc8dGj/Qur0KIk98m
ABb+pd/6asITDU2W6MWOd1+tonzFDTix8IUm2yQxAoGAFPu+bZ9o5yDxzpZ4VI2O
KElqeK5qdoSUdGug6vjX/qlgHBEvcb32sm5pPsgX1t44PmuNuAJtjBMc+Uod1V18
ifc5podTT3efLnubNAI6PWTvb0H58yI3L3aGw/IKi2vcC6mL1rA3AtmbCOxXAVhI
AMYUlzQ9KduOnkaNFTMqsZ8CgYBJRsvv0OfWNlUM5w6rofok63JnjSIargjOBGWn
G3qDE9FE4QAGBK1QspEV/KfH++qWiq17stRj+8UA3uZe1XpCfnTaYZglmHAzKkGh
Nmz4bNwQYuvaUXHttWp/ZzGOlzgpIP4RBWdbGdLQlYEiVAAEsPRq9IDWyHkmE+TF
Elh2UQKBgEnDpHeJSqFCF7lAPUhZPQNtcwbZXWUF+44u4nuoC2DMzTjTrxBhn/+a
aZcprQB/oOnieITuIck8rJ25ukWdgVOVRk/ykKkJUsQxaQeobP2utnz5C+YBmI3X
Q4sYK5+GEpV/ulf0cfiFKyBuATtbusg1BLgQDYrtPbdKmpkqrKgE
-----END RSA PRIVATE KEY-----`;

const provider = new common.SimpleAuthenticationDetailsProvider(
  'ocid1.tenancy.oc1..aaaaaaafeegupccff4g6nvrn6f3u73m5z4rz251w1xbhac4x3tvj13qepua',
  'ocid1.user.oc1..aaaaaaaagw2oaxlaq25ohax5cqzsmg2wnojqktskyxee2v7puvqeznunzqfa',
  'ee:61:8d:ce:d9:48:8f:68:b9:66:95:c7:93:c6:8b:a3',
  privateKey,
  null,
  common.Region.fromRegionId('us-chicago-1')
);

const client = new identity.IdentityClient({ 
  authenticationDetailsProvider: provider
});

client.listRegions({}).then(res => console.log("SUCCESS!")).catch(err => console.error("CAUGHT:", err));
