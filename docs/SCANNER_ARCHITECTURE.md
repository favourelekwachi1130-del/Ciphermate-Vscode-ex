# Repository Scanner Architecture

## Overview

CipherMate now uses a **unified repository scanning architecture** based on CipherMate Core features. This provides comprehensive security scanning of developer repositories.

## Architecture

```
RepositoryScanner (orchestrator)
    ↓
├─ DependencyScanner
│   ├─ npm (package.json) via retire.js
│   ├─ Python (requirements.txt, Pipfile)
│   ├─ Rust (Cargo.toml)
│   ├─ Go (go.mod)
│   └─ Other dependency files
│
├─ SecretsScanner
│   ├─ AWS Keys
│   ├─ API Keys
│   ├─ GitHub Tokens
│   ├─ Database Credentials
│   ├─ Private Keys
│   └─ OAuth Tokens
│
├─ SmartContractScanner (TODO)
│   └─ 11 vulnerability detectors
│
├─ CodePatternScanner (TODO)
│   └─ OWASP Top 10 patterns
│
└─ SSLAnalyzer (TODO)
    └─ Certificate validation
```

## Core Components

### 1. BaseScanner (`src/scanners/base-scanner.ts`)
Abstract base class for all scanners.

**Methods**:
- `getName()` - Scanner identifier
- `isAvailable()` - Check if scanner can run
- `scan()` - Perform scan
- `getDescription()` - Human-readable description

### 2. RepositoryScanner (`src/scanners/repository-scanner.ts`)
Orchestrates all scanners and aggregates results.

**Usage**:
```typescript
const scanner = new RepositoryScanner(workspacePath);
const result = await scanner.scan();

// Result includes:
// - All scan results from each scanner
// - Aggregated summary
// - All vulnerabilities combined
```

### 3. DependencyScanner (`src/scanners/dependency-scanner.ts`)
Scans dependency files for known vulnerabilities.

**Supported**:
- `package.json` (npm) - via retire.js
- `requirements.txt`, `Pipfile` (Python)
- `Cargo.toml` (Rust)
- `go.mod` (Go)
- `pom.xml` (Maven/Java)
- `Gemfile` (Ruby)
- `composer.json` (PHP)

### 4. SecretsScanner (`src/scanners/secrets-scanner.ts`)
Detects hardcoded secrets in code files.

**Detects**:
- AWS Access Keys & Secret Keys
- GitHub Tokens
- API Keys
- Passwords
- Database Connection Strings
- Private Keys
- OAuth Tokens
- JWT Tokens
- Slack Tokens
- Stripe Keys

## Integration

### With Agentic Core

The `AgenticCore` now uses `RepositoryScanner` for the `scan_repository` tool:

```typescript
// In agentic-core.ts
private async executeScanRepository(path: string) {
  const scanner = new RepositoryScanner(workspacePath);
  const scanResult = await scanner.scan();
  // Returns comprehensive scan results
}
```

### With Extension Commands

The `intelligentRepositoryScan` function now uses the unified scanner:

```typescript
// In extension.ts
const scanner = new RepositoryScanner(workspacePath);
const scanResult = await scanner.scan();
// Results integrated with existing scan pipeline
```

## Adding New Scanners

To add a new scanner:

1. **Create scanner class**:
```typescript
import { BaseScanner } from './base-scanner';
import { ScanResult, Vulnerability } from './types';

export class MyScanner extends BaseScanner {
  getName(): string {
    return 'my-scanner';
  }

  async isAvailable(): Promise<boolean> {
    // Check if scanner can run
    return true;
  }

  async scan(): Promise<ScanResult> {
    // Perform scan
    const vulnerabilities: Vulnerability[] = [];
    // ... scan logic ...
    
    return {
      scanner: this.getName(),
      success: true,
      vulnerabilities,
      summary: this.calculateSummary(vulnerabilities),
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}
```

2. **Register in RepositoryScanner**:
```typescript
// In repository-scanner.ts
private initializeScanners(): void {
  this.scanners.push(new DependencyScanner(this.workspacePath));
  this.scanners.push(new SecretsScanner(this.workspacePath));
  this.scanners.push(new MyScanner(this.workspacePath)); // Add here
}
```

## Results Format

All scanners return `ScanResult`:

```typescript
interface ScanResult {
  scanner: string;
  success: boolean;
  vulnerabilities: Vulnerability[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  duration: number;
  timestamp: Date;
  error?: string;
}
```

## Next Steps

1. ✅ Dependency Scanner - Implemented
2. ✅ Secrets Scanner - Implemented
3. ⏳ Smart Contract Scanner - TODO
4. ⏳ Code Pattern Scanner - TODO
5. ⏳ SSL Analyzer - TODO
6. ⏳ Log Analyzer - TODO

## Usage Examples

### Basic Scan
```typescript
const scanner = new RepositoryScanner(workspacePath);
const result = await scanner.scan();
console.log(`Found ${result.aggregated.total} vulnerabilities`);
```

### Selective Scanning
```typescript
// Only run specific scanners
const result = await scanner.scan({
  scanners: ['dependency-scanner', 'secrets-scanner']
});
```

### Skip Scanners
```typescript
// Skip certain scanners
const result = await scanner.scan({
  skipScanners: ['secrets-scanner']
});
```

## Performance

- **Dependency Scanner**: ~2-5 seconds (depends on retire.js)
- **Secrets Scanner**: ~5-10 seconds (depends on codebase size)
- **Total**: Usually completes in under 15 seconds for medium repos

## Error Handling

Scanners handle errors gracefully:
- If a scanner fails, others continue
- Failed scanners return `success: false` with error message
- Results still aggregated from successful scanners

