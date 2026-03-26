# Threat Model as Code — Schema

Place `threat-model.json` in your workspace root (or `.ciphermate/threat-model.json`) to provide a human-editable threat model. CipherMate merges it with CVE-derived data when you run **Build Threat Model**.

## Schema

```json
{
  "sliceFocus": "One-sentence focus for the primary audit slice",
  "entryPoints": ["HTTP routes", "RPC handlers", "CLI", "scheduled jobs"],
  "trustBoundaries": ["browser to server", "service to service", "plugin to host"],
  "highRiskOps": ["deserialization", "templating", "authz checks", "parsing untrusted input"],
  "attackerModel": "remote-unauthenticated",
  "crownJewels": ["payment API", "user PII"],
  "invariants": ["Only admins can call DELETE /users"],
  "source": "user"
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sliceFocus` | string | No | One-sentence focus for the audit |
| `entryPoints` | string[] | No | Entry points to audit (HTTP, RPC, CLI, etc.) |
| `trustBoundaries` | string[] | No | Trust boundaries (browser→server, etc.) |
| `highRiskOps` | string[] | No | High-risk operations to focus on |
| `attackerModel` | string | No | One of: `remote-unauthenticated`, `remote-authenticated-low`, `cross-tenant`, `local-code-exec` |
| `crownJewels` | string[] | No | What you're protecting (for future use) |
| `invariants` | string[] | No | Invariants to check (for future use) |
| `source` | string | No | `user` \| `cve-derived` \| `merged` |

## Merge Behavior

When you run **Build Threat Model**:

- If `threat-model.json` exists, its values **override** CVE-derived values when present
- CVE-derived values fill in gaps (e.g. if file has no `highRiskOps`, use CVE-derived)
- If no CVEs found, file model is used as-is

## Example

```json
{
  "sliceFocus": "Authorization boundary between admin and user roles",
  "entryPoints": ["POST /api/admin/*", "GET /api/users", "WebSocket /realtime"],
  "trustBoundaries": ["browser to API", "API to database"],
  "highRiskOps": ["role checks", "JWT validation", "SQL queries"],
  "attackerModel": "remote-authenticated-low",
  "crownJewels": ["/api/payment", "user PII in database"]
}
```

## Save Command

After building a threat model from CVE history, run **CipherMate: Save Threat Model to File** to write the current (possibly merged) model to `threat-model.json`.
