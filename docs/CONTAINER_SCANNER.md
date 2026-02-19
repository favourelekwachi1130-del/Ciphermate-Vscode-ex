# Container Image Scanner

CipherMate includes a built-in container scanner that replaces **Snyk Container** and **Docker Scout**.

## Features

- **Dockerfile analysis:** Unpinned base images, root user, insecure fetches, secrets in image
- **Trivy integration:** When Trivy CLI is installed, scans base images for OS package CVEs (real CVE data)
- **Runs on full scan:** Automatically included when you run CipherMate: Scan or Intelligent Scan

## Supported Files

| File | Purpose |
|------|---------|
| Dockerfile | Primary container build file |
| Containerfile | Dockerfile alternate name |
| *.dockerfile | Dockerfile with extension |
| docker-compose.yml | Compose stack definitions |

## Built-in Rules (no Trivy required)

| Rule ID | Severity | Description |
|---------|----------|--------------|
| CONT-001 | High | Unpinned base image (:latest, :stable, :LTS) |
| CONT-003 | High | No USER directive – container runs as root |
| CONT-004 | High | Insecure package fetch (curl \| sh) |
| CONT-005 | Low | apt-get without --no-install-recommends |
| CONT-006 | Medium | Sensitive file (.env, .pem, .key) copied into image |
| CONT-007 | High | ADD from remote URL (use COPY + RUN curl) |
| CONT-008 | High | Potential secret in ARG (use BuildKit secrets) |
| CONT-009 | Medium | sudo in RUN (indicates root) |
| CONT-010 | Low | No HEALTHCHECK directive |
| CONT-011 | High | docker-compose: privileged: true |
| CONT-012 | Medium | docker-compose: broad cap_add (SYS_ADMIN, etc.) |

## Trivy Integration (OS package CVEs)

When **Trivy** is installed (`trivy --version` works), the scanner will:

1. **trivy config:** Scan Dockerfiles for misconfigurations (no image pull, fast)
2. **trivy image:** Extract base images from `FROM`, run `trivy image <base-image>` for each (up to 3 per Dockerfile)
3. Parse CVEs and misconfigs, include them as findings with severity, CVE ID, fix version

**Install Trivy:**
- macOS: `brew install trivy`
- Linux: see https://github.com/aquasecurity/trivy#installation

## Configuration

```json
{
  "ciphermate.scanners.enableContainer": true,
  "ciphermate.scanners.container.useTrivy": true,
  "ciphermate.scanners.container.useTrivyConfig": true,
  "ciphermate.scanners.container.trivyTimeoutMs": 120000,
  "ciphermate.scanners.container.trivyRetries": 2
}
```

## docker-compose Support

The scanner parses `docker-compose.yml` and `docker-compose.yaml` to:

- Flag unpinned images (`image: xxx:latest` or `image: xxx` without tag/digest)
- Flag `privileged: true` (CONT-011)
- Flag broad `cap_add` (e.g. SYS_ADMIN, NET_ADMIN)

## Auto-Fix Support

Rule-based fixes are available for: CONT-001 (pin base image), CONT-003 (add USER), CONT-005 (add --no-install-recommends), CONT-011 (privileged: false).

## How to Run

| Method | Includes Container Scanner |
|--------|----------------------------|
| **CipherMate: Scan** | ✓ Yes |
| **CipherMate: Intelligent Scan** | ✓ Yes |
| **Full scan via Chat** ("scan my repository") | ✓ Yes |
| **Scan Containers** (chat quick action) | ✓ Yes – containers only |
| **Scan IaC** (chat quick action) | No – IaC only |

The container scanner runs as part of every full repository scan when enabled. Use **Scan Containers** for container-only scans.
