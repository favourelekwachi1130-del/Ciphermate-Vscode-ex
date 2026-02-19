# Infrastructure as Code (IaC) Scanner

CipherMate includes a built-in IaC scanner that replaces **Bridgecrew** and **Wiz Code**.

## Features

- **Inline suppressions:** Add `# ciphermate:ignore IAC-XXX` (or `//` for JSON) to suppress a rule
- **Auto-fix:** One-click fix for K8s securityContext and Terraform cidr_blocks (Fix button in results)
- **Fixable rules:** IAC-K8S-001, 002, 003, 006, 007 and IAC-TF-003

## Supported Formats

| Format         | Extensions      | Detection                     |
|----------------|-----------------|-------------------------------|
| **Terraform**  | `.tf`, `.tf.json` | HCL resource blocks          |
| **CloudFormation** | `.yaml`, `.yml`, `.json` | AWS:: resource types      |
| **Kubernetes** | `.yaml`, `.yml` | kind: Deployment/Pod/Service  |

## Security Rules

### Terraform

| Rule ID    | Severity | Description                          |
|------------|----------|--------------------------------------|
| IAC-TF-001 | High     | S3 bucket may allow public access    |
| IAC-TF-002 | High     | S3 bucket encryption disabled        |
| IAC-TF-003 | High     | Security group allows 0.0.0.0/0       |
| IAC-TF-004 | High     | IAM policy allows "*" action         |
| IAC-TF-005 | High     | RDS storage not encrypted            |
| IAC-TF-006 | Medium   | EBS volume unencrypted               |
| IAC-TF-007 | Medium   | Security group allows 0.0.0.0/0 egress|

### Kubernetes

| Rule ID    | Severity | Description                          |
|------------|----------|--------------------------------------|
| IAC-K8S-001| High     | Privileged container                 |
| IAC-K8S-002| High     | Container runs as root               |
| IAC-K8S-003| High     | hostNetwork/hostPID enabled          |
| IAC-K8S-005| Medium   | Default service account              |
| IAC-K8S-006| Medium   | Root filesystem writable             |
| IAC-K8S-007| High     | allowPrivilegeEscalation enabled     |

### CloudFormation

| Rule ID    | Severity | Description                          |
|------------|----------|--------------------------------------|
| IAC-CFN-001| Low      | Critical resources without DeletionPolicy |

## Usage

**Chat:**
- "Scan infrastructure as code"
- "Scan terraform"
- "Check kubernetes misconfigurations"

**Quick Action:** Click **Scan IaC** in the chat quick actions.

**Full Scan:** IaC scanner runs automatically as part of the full repository scan.

## Inline Suppressions

Add a comment on a line before the flagged resource to suppress:

```hcl
# ciphermate:ignore IAC-TF-001 - Intentionally public bucket for CDN
resource "aws_s3_bucket" "cdn" { ... }
```

```yaml
# ciphermate:ignore IAC-K8S-003 - Required for Node exporter
hostNetwork: true
```

Use `ciphermate:ignore *` to suppress all IaC rules for that block.

## Configuration

```json
{
  "ciphermate.scanners.enableIac": true
}
```

## CWE Mappings

- CWE-200: Sensitive data exposure (S3 public)
- CWE-250: Execution with unnecessary privileges (K8s privileged)
- CWE-276: Incorrect default permissions
- CWE-284: Improper access control (IAM, 0.0.0.0/0)
- CWE-311: Missing encryption of sensitive data (RDS, EBS, S3)
- CWE-400: Resource exhaustion (missing K8s limits)
- CWE-732: Incorrect permission assignment (readOnlyRootFilesystem)
