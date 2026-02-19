# Memory Management Guide for CipherMate

## Common Memory Issues

### 1. **VS Code Extension State Warning**
**Error**: `[mainThreadStorage] large extension state detected (extensionId: ciphermate.ciphermate, global: true): 2864.2431640625kb`

**Cause**: Storing large amounts of data in VS Code's `globalState` (in-memory JSON dictionary)

**Solution**: ✅ **Already Fixed** - Data migrated to disk storage using `DiskStorageService`

### 2. **Extension Host Unresponsive**
**Error**: `Extension host (LocalProcess pid: XXXX) is unresponsive`

**Causes**:
- Reading too many large files into memory simultaneously
- Processing thousands of files without yielding to event loop
- Storing unlimited scan results in memory

**Solutions**: ✅ **Already Implemented**
- File size limits (1-2MB per file)
- Batch processing with event loop yielding
- Memory limits on scan results (5000 max)

### 3. **Out of Memory Errors**
**Error**: `JavaScript heap out of memory` or `ENOMEM`

**Causes**:
- Reading files larger than available memory
- Accumulating unlimited conversation history
- Storing full file contents in vulnerability objects

**Solutions**: ✅ **Already Implemented**
- File size checks before reading
- Conversation history limits (50 messages)
- Code snippet limits (500 chars)

## Best Practices for Memory Management

### 1. **File Reading Strategy**

```typescript
// ✅ GOOD: Check size before reading
async readFile(filePath: string, maxSizeBytes: number = 2 * 1024 * 1024): Promise<string> {
  const stats = await statAsync(filePath);
  if (stats.size > maxSizeBytes) {
    throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  }
  return await readFileAsync(filePath, 'utf-8');
}

// ❌ BAD: Reading without size check
async readFile(filePath: string): Promise<string> {
  return await readFileAsync(filePath, 'utf-8'); // Could load 100MB+ file!
}
```

**Recommendations**:
- **Small files (< 1MB)**: Read directly
- **Medium files (1-5MB)**: Read with size limit
- **Large files (> 5MB)**: Use streaming or skip entirely

### 2. **Batch Processing with Yielding**

```typescript
// ✅ GOOD: Process in batches with event loop yielding
const BATCH_SIZE = 20;
for (let i = 0; i < files.length; i += BATCH_SIZE) {
  const batch = files.slice(i, i + BATCH_SIZE);
  await Promise.allSettled(batch.map(processFile));
  await new Promise(resolve => setTimeout(resolve, 0)); // Yield to event loop
}

// ❌ BAD: Processing all files at once
await Promise.all(files.map(processFile)); // Could block event loop
```

**Benefits**:
- Prevents extension host from becoming unresponsive
- Allows VS Code UI to remain interactive
- Better error handling per batch

### 3. **Memory Limits on Data Structures**

```typescript
// ✅ GOOD: Limit stored data
const MAX_SCAN_RESULTS = 5000;
const MAX_CONVERSATION_MESSAGES = 50;
const MAX_CODE_SNIPPET_LENGTH = 500;

function cleanupScanResults(results: any[]): any[] {
  if (results.length > MAX_SCAN_RESULTS) {
    // Keep only most severe
    return results
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
      .slice(0, MAX_SCAN_RESULTS);
  }
  return results;
}
```

**Key Limits**:
- **Scan Results**: 5000 vulnerabilities max
- **Conversation History**: 50 messages max
- **Code Snippets**: 500 characters max
- **Files Scanned List**: 5000 entries max

### 4. **Disk Storage vs Memory Storage**

```typescript
// ✅ GOOD: Use disk storage for large data
diskStorage.update('scan-results', largeData); // Stored on disk

// ❌ BAD: Store large data in memory
globalState.update('scan-results', largeData); // Stored in memory
```

**When to Use**:
- **Memory (`globalState`)**: Small config values, flags (< 1KB)
- **Disk (`DiskStorageService`)**: Scan results, chat history, large data (> 1KB)

### 5. **Streaming for Large Files**

```typescript
// ✅ GOOD: Stream large files instead of loading entirely
import * as fs from 'fs';
import { createReadStream } from 'fs';

function processLargeFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    let buffer = '';
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      // Process buffer in chunks
      if (buffer.length > 10000) {
        processChunk(buffer);
        buffer = '';
      }
    });
    
    stream.on('end', () => {
      if (buffer) processChunk(buffer);
      resolve();
    });
    
    stream.on('error', reject);
  });
}
```

**Use Cases**:
- Files > 5MB
- Log files
- Large JSON files
- Binary files

### 6. **Garbage Collection Hints**

```typescript
// ✅ GOOD: Clear references when done
function cleanup(): void {
  // Clear large arrays
  largeArray.length = 0;
  
  // Remove event listeners
  eventEmitter.removeAllListeners();
  
  // Clear Maps/Sets
  largeMap.clear();
  
  // Null references
  largeObject = null;
  
  // Force GC if available (Node.js with --expose-gc)
  if (global.gc) {
    global.gc();
  }
}
```

### 7. **Memory Monitoring**

```typescript
// ✅ GOOD: Monitor memory usage
function checkMemoryUsage(): void {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  const heapTotalMB = usage.heapTotal / 1024 / 1024;
  
  console.log(`Memory: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`);
  
  if (heapUsedMB > 500) { // 500MB threshold
    console.warn('High memory usage detected, performing cleanup...');
    performMemoryCleanup();
  }
}
```

## Current Implementation Status

### ✅ Implemented
- [x] File size limits (1-2MB)
- [x] Scan results memory limits (5000 max)
- [x] Conversation history limits (50 messages)
- [x] Code snippet limits (500 chars)
- [x] Batch processing with event loop yielding
- [x] Disk storage for large data
- [x] Automatic cleanup functions

### 🔄 Recommended Improvements

1. **Add Memory Monitoring**
   ```typescript
   // Monitor memory every 30 seconds
   setInterval(() => {
     const usage = process.memoryUsage();
     if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
       performMemoryCleanup();
     }
   }, 30000);
   ```

2. **Add User-Configurable Limits**
   ```typescript
   const config = vscode.workspace.getConfiguration('ciphermate');
   const maxFiles = config.get<number>('memory.maxFilesToScan', 10000);
   const maxResults = config.get<number>('memory.maxScanResults', 5000);
   ```

3. **Add Memory Usage Reporting**
   ```typescript
   // Show memory usage in status bar
   statusBarItem.text = `Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)}MB`;
   ```

4. **Add Graceful Degradation**
   ```typescript
   // If memory is high, reduce limits automatically
   if (memoryUsage > threshold) {
     MAX_FILES_TO_SCAN = 5000; // Reduce from 10000
     BATCH_SIZE = 10; // Reduce from 20
   }
   ```

## Error Recovery Strategies

### Memory Error Detection
```typescript
function isMemoryError(error: Error): boolean {
  return error.message.includes('heap') ||
         error.message.includes('out of memory') ||
         error.message.includes('ENOMEM') ||
         error.name === 'RangeError';
}
```

### Automatic Recovery
```typescript
try {
  await performScan();
} catch (error) {
  if (isMemoryError(error)) {
    // Clean up memory
    performMemoryCleanup();
    
    // Retry with reduced limits
    await performScanWithReducedLimits();
  }
}
```

## Configuration Options

Add to `package.json` settings:

```json
{
  "ciphermate.memory.maxFileSize": {
    "type": "number",
    "default": 2097152,
    "description": "Maximum file size to read (bytes)"
  },
  "ciphermate.memory.maxScanResults": {
    "type": "number",
    "default": 5000,
    "description": "Maximum scan results to keep in memory"
  },
  "ciphermate.memory.maxConversationMessages": {
    "type": "number",
    "default": 50,
    "description": "Maximum conversation messages to keep"
  }
}
```

## Testing Memory Management

### Test Large File Handling
```typescript
// Create a 10MB test file
const largeFile = 'x'.repeat(10 * 1024 * 1024);
fs.writeFileSync('test-large.txt', largeFile);

// Should skip or error gracefully
await scanner.scanFile('test-large.txt');
```

### Test Memory Limits
```typescript
// Generate 10000 vulnerabilities
const manyVulns = Array.from({ length: 10000 }, (_, i) => ({
  id: `vuln-${i}`,
  severity: 'medium',
  // ...
}));

// Should reduce to 5000
const cleaned = cleanupScanResults(manyVulns);
assert(cleaned.length === 5000);
```

## Summary

**Key Principles**:
1. ✅ **Check before reading** - Verify file sizes
2. ✅ **Limit stored data** - Set maximums on arrays/objects
3. ✅ **Use disk storage** - For data > 1KB
4. ✅ **Process in batches** - With event loop yielding
5. ✅ **Clean up regularly** - Remove old/unused data
6. ✅ **Monitor usage** - Track memory consumption
7. ✅ **Graceful degradation** - Reduce limits when memory is high

**Current Status**: All critical memory management features are implemented and working! 🎉
