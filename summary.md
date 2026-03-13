# Remote Access Integration

The remote access integration lets the proxy inject credentials from a user's Bitwarden vault into HTTPS requests, as a fallback when no server-stored secrets match.

## How it works

**Pairing (one-time setup):**

1. User runs `aac listen --psk` to generate a pairing code, then pastes it into the web UI (`vault-access-card.tsx`)
2. Web API forwards to proxy's `POST /api/remote/pair/psk`
3. Proxy establishes a Noise protocol session through a WebSocket relay, persists session state to disk
4. DB records a `VaultConnection` for display/management

**Credential injection (per-request):**

1. Agent sends `CONNECT api.openai.com:443` to the proxy
2. Proxy calls web API `/api/proxy/connect` → gets injection rules from DB-stored secrets
3. If no rules matched (`intercept: false`) and remote access is paired, proxy calls `request_credential("api.openai.com")` on the `RemoteAccessManager`
4. Manager checks local cache (60s positive / 30s negative TTL), or sends a real-time request through the encrypted channel to the `aac listen` process
5. `aac listen` looks up the credential in the user's Bitwarden vault and returns it
6. `remote_mapping::credential_to_rules()` converts it to injection rules (Anthropic → `x-api-key`, default → `Bearer`)
7. Proxy MITMs the connection and injects the headers

**Key properties:**

- Credentials never leave the proxy process or hit disk — cached briefly in memory only
- Vault lookup is a fallback — DB-stored secrets always take priority
- Opt-in via `--enable-remote-access` CLI flag
- Session survives proxy restarts via file-backed identity/session store

## Components

| File                    | Role                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `remote.rs`             | `RemoteAccessManager` — lifecycle, caching, credential requests  |
| `remote_store.rs`       | File-backed identity keypair + session persistence               |
| `remote_api.rs`         | HTTP endpoints for pairing/status/disconnect (called by web API) |
| `remote_mapping.rs`     | Credential → injection rule conversion                           |
| `vault-access-card.tsx` | Pairing UI                                                       |
| `api/vault/*` routes    | Web API endpoints that forward to proxy                          |
