# CipherMate Service Registry Guide

## Overview

The Service Registry provides a centralized way to access all CipherMate Core services. It ensures type safety, enables dependency injection, and simplifies service discovery.

## Usage

### Basic Usage

```typescript
import { getServiceRegistry } from '../core';

// Get registry instance
const registry = getServiceRegistry();

// Access services
const fileService = registry.getFileOperationsService();
const hashService = registry.getHashingService();
const secretService = registry.getSecretDetectionService();
```

### Example: Using Multiple Services

```typescript
import { getServiceRegistry } from '../core';

const registry = getServiceRegistry();

// Read a file
const fileService = registry.getFileOperationsService();
const content = await fileService.readFile('config.json');

// Detect secrets in the file
const secretService = registry.getSecretDetectionService();
const secrets = secretService.detectSecrets(content, 'config.json');

// Hash any detected secrets
const hashService = registry.getHashingService();
if (secrets.secrets.length > 0) {
  const hash = hashService.sha256(secrets.secrets[0].value);
  console.log('Hashed secret:', hash);
}
```

### Example: Using Service Interfaces

Services implement interfaces for type safety:

```typescript
import { getServiceRegistry, IFileOperationsService } from '../core';

const registry = getServiceRegistry();
const fileService: IFileOperationsService = registry.getFileOperationsService();

// TypeScript ensures all interface methods are available
await fileService.readFile('test.txt');
await fileService.writeFile('test.txt', 'content');
await fileService.fileExists('test.txt');
```

### Verifying Services

Check if all services are available:

```typescript
import { getServiceRegistry } from '../core';

const registry = getServiceRegistry();
const status = registry.verifyServices();

console.log('Available services:', status.available);
console.log('Missing services:', status.missing);
```

### Getting All Services

For testing or debugging:

```typescript
import { getServiceRegistry } from '../core';

const registry = getServiceRegistry();
const allServices = registry.getAllServices();

// Access all services at once
const { fileOperations, hashing, secretDetection } = allServices;
```

## Service List

The registry provides access to:

1. **FileOperationsService** - File system operations
2. **HashingService** - Hashing algorithms (SHA-256, SHA-512, PBKDF2, etc.)
3. **SecretDetectionService** - Secret detection and pattern matching
4. **PolicyEnforcementService** - Security policy evaluation
5. **CodeAdjustmentService** - Code security fixes
6. **CodeGenerationService** - Secure code generation
7. **IntegrityValidationService** - File integrity checks
8. **CodeDiffingService** - Code diffing and patching
9. **ProjectGenerationService** - Project scaffolding
10. **CitationService** - Citation tracking
11. **RealtimeAnalysisService** - Real-time code analysis

## Architecture Benefits

### 1. Type Safety
- All services implement interfaces
- TypeScript ensures correct usage
- IDE autocomplete works perfectly

### 2. Dependency Injection
- Services can be swapped for testing
- Mock services can be injected
- Easy to extend with new services

### 3. Service Discovery
- Single entry point for all services
- No need to import individual services
- Consistent access pattern

### 4. Independence
- Services work without Mastra
- No external dependencies
- Can be tested in isolation

## Integration with Mastra Tools

Mastra tools use the registry to access core services:

```typescript
// src/mastra/tools/detect-secrets.ts
import { getServiceRegistry } from '../../core';

export const detectSecretsTool = createTool({
  execute: async ({ inputData }) => {
    const registry = getServiceRegistry();
    const secretService = registry.getSecretDetectionService();
    return secretService.detectSecrets(inputData.code, inputData.filePath);
  },
});
```

## Testing

Services can be tested independently:

```typescript
import { getServiceRegistry } from '../core';

describe('Service Registry', () => {
  it('should provide all services', () => {
    const registry = getServiceRegistry();
    const status = registry.verifyServices();
    
    expect(status.missing).toHaveLength(0);
    expect(status.available.length).toBeGreaterThan(0);
  });

  it('should return same instance (singleton)', () => {
    const registry1 = getServiceRegistry();
    const registry2 = getServiceRegistry();
    
    expect(registry1).toBe(registry2);
  });
});
```

## Best Practices

1. **Use the registry** - Don't import services directly, use the registry
2. **Type your services** - Use interfaces for type safety
3. **Verify availability** - Check service status in critical paths
4. **Test independently** - Services can be tested without Mastra

## Migration from Direct Imports

### Before (Direct Import)
```typescript
import { getFileOperationsService } from '../core/file-operations-service';
import { getHashingService } from '../core/hashing-service';

const fileService = getFileOperationsService();
const hashService = getHashingService();
```

### After (Service Registry)
```typescript
import { getServiceRegistry } from '../core';

const registry = getServiceRegistry();
const fileService = registry.getFileOperationsService();
const hashService = registry.getHashingService();
```

## Summary

The Service Registry provides:
- ✅ Centralized service access
- ✅ Type-safe interfaces
- ✅ Dependency injection support
- ✅ Service discovery
- ✅ Independence from Mastra
- ✅ Easy testing

**All core services are now accessible through the registry!**
