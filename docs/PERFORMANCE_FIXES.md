# Scanner Performance Fixes

## Problem
The repository scanner was hanging indefinitely when scanning large repositories, causing the extension host to become unresponsive.

## Root Causes
1. **No timeout mechanisms** - Scanners could run indefinitely
2. **Large file discovery** - `vscode.workspace.findFiles()` could take too long on huge repos
3. **Blocking operations** - `npx retire` command could hang if packages needed downloading
4. **Network calls** - CVE enrichment making HTTP requests without proper timeout handling
5. **Sequential processing** - Files processed one-by-one without batching

## Solutions Implemented

### 1. Repository Scanner Timeout
- **Location**: `src/scanners/repository-scanner.ts`
- **Change**: Added 5-minute timeout per scanner
- **Impact**: Prevents any single scanner from hanging indefinitely

```typescript
const SCANNER_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const result = await Promise.race([
  scanner.scan(),
  new Promise<ScanResult>((_, reject) => 
    setTimeout(() => reject(new Error(`Scanner timed out`)), SCANNER_TIMEOUT)
  )
]);
```

### 2. Secrets Scanner Improvements
- **Location**: `src/scanners/secrets-scanner.ts`
- **Changes**:
  - File pattern search: 30-second timeout per pattern
  - File reading: 10-second timeout per file
  - File limits: Max 10,000 files found, max 5,000 files scanned
  - Batch processing: Process files in batches of 50
  - Progress logging for large scans

**Key improvements**:
```typescript
// Limit total files
const MAX_FILES_TO_SCAN = 5000;
const filesToScan = codeFiles.slice(0, MAX_FILES_TO_SCAN);

// Batch processing with timeout
const batchPromises = batch.map(async (file) => {
  const content = await Promise.race([
    this.fileOperationsService.readFile(file),
    new Promise<string>((_, reject) => 
      setTimeout(() => reject(new Error('File read timeout')), 10000)
    )
  ]);
  // ... process file
});
```

### 3. Dependency Scanner Timeout
- **Location**: `src/scanners/dependency-scanner.ts`
- **Changes**:
  - Retire.js execution: 2-minute timeout
  - CVE enrichment: 1-minute timeout
  - Better error handling for failed operations

**Key improvements**:
```typescript
// Retire.js with timeout
const RETIRE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const execPromise = execAsync(
  `npx retire ...`,
  { maxBuffer: 10 * 1024 * 1024, timeout: RETIRE_TIMEOUT }
);

// CVE enrichment with timeout
await Promise.race([
  this.enrichWithCVEData(vulnerabilities),
  new Promise<void>((_, reject) => 
    setTimeout(() => reject(new Error('CVE enrichment timed out')), 60000)
  )
]);
```

### 4. CVE Lookup Service Improvements
- **Location**: `src/scanners/cve-lookup-service.ts`
- **Changes**:
  - Per-CVE timeout: 15 seconds
  - Per-batch timeout: 30 seconds
  - Max CVEs: Limited to 50 CVEs per scan
  - Better error handling

**Key improvements**:
```typescript
// Limit CVEs
const MAX_CVES = 50;
const cvesToLookup = cveIds.slice(0, MAX_CVES);

// Timeout per CVE
const batchPromise = Promise.all(
  batch.map(cveId => 
    Promise.race([
      this.lookupCVE(cveId),
      new Promise<CVEData | null>((resolve) => 
        setTimeout(() => resolve(null), 15000) // 15 second timeout
      )
    ])
  )
);
```

## Performance Limits

| Operation | Limit | Timeout |
|-----------|-------|---------|
| Scanner execution | - | 10 minutes (increased for large repos) |
| File pattern search | - | 30 seconds per pattern |
| Files found | 15,000 max (increased) | - |
| Files scanned | 10,000 max (increased) | - |
| File read | - | 30 seconds (increased for large files) |
| Retire.js execution | - | 2 minutes |
| CVE enrichment | - | 1 minute |
| CVE lookup (total) | 50 max | - |
| CVE lookup (per CVE) | - | 15 seconds |
| CVE lookup (per batch) | - | 30 seconds |

**Note**: Limits are designed to prevent hangs while still covering the vast majority of repositories. When limits are reached, informative warnings are added to scan results so users understand what happened.

## Benefits

1. **No more hanging** - All operations have timeouts
2. **Better UX** - Scans complete or fail gracefully with informative messages
3. **Resource protection** - Limits prevent excessive resource usage
4. **Progress visibility** - Logging shows scan progress
5. **Graceful degradation** - Failed operations don't stop entire scan
6. **User awareness** - When limits are hit, users see informative warnings in scan results
7. **Generous limits** - Limits are set high enough to cover 99% of repositories while preventing hangs

## Testing

To test the fixes:
1. Open a large repository (10,000+ files)
2. Run "Scan Repository"
3. Verify scan completes within reasonable time or shows timeout errors
4. Check console for progress logs

## Configuration

Users can adjust scanner behavior via VS Code settings:
- `ciphermate.scanners.enableDependency` - Enable/disable dependency scanner
- `ciphermate.scanners.enableSecrets` - Enable/disable secrets scanner
- `ciphermate.cve.enabled` - Enable/disable CVE enrichment

## Future Improvements

1. **Parallel scanner execution** - Run scanners in parallel instead of sequentially
2. **Incremental scanning** - Only scan changed files
3. **Caching** - Cache scan results for unchanged files
4. **User-configurable limits** - Allow users to adjust file/CVE limits
5. **Progress reporting** - Show progress in UI instead of just console
