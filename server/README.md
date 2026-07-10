K8s Backend

This small Express server connects to the Atlas Hub VMs over SSH and runs `kubectl` commands on the remote host, returning JSON results.

Setup

1. Copy `config.example.json` to `config.json` and edit the `host`, `username`, and `keyPath` for each environment. The `keyPath` is a path relative to the `server/` directory, for example `keys/dev_key.ppk`.

2. Place your PuTTY private keys (.ppk) in `server/keys/` (e.g. `server/keys/dev_key.ppk`). Export from PuTTYgen via **File → Save private key** (PPK format v2 or v3). Unencrypted (no passphrase) keys are required.

3. Install dependencies and start the server:

```bash
cd server
npm install
npm start
```

Endpoints

- `GET /api/envs` — returns available environments from server config
- `POST /api/upload-key?env=dev` — upload a `.ppk` private key for an environment
- `GET /api/cluster?env=dev` — connects to the VM defined for `dev`, runs `kubectl` commands and returns JSON.

Key Format

The server expects PuTTY Private Key files (.ppk) format v2 or v3, without a passphrase.
To export from PuTTYgen: open your key → File → Save private key → choose "No" when asked about passphrase.

Notes

- The server requires the remote VM to have `kubectl` configured and available on PATH for the configured user.
- Secrets returned by `kubectl get secret` are redacted by this server.
