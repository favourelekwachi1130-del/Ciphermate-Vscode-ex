# Native Module Fix for Mastra LibSQL

## Issue

When using `@mastra/libsql`, you may encounter:
```
Error: Cannot find module './darwin-arm64'
```

This happens because `@mastra/libsql` depends on native SQLite bindings that webpack cannot bundle.

## Solution

The code has been updated to handle this gracefully:

1. **LibSQL is now optional** - Mastra will work without it
2. **Graceful fallback** - Uses in-memory storage if LibSQL unavailable
3. **Webpack externals** - Native modules excluded from bundle
4. **Runtime detection** - Checks for LibSQL availability at runtime

## How It Works

### 1. Optional LibSQL Loading

```typescript
// Try to load LibSQLStore, but make it optional
let LibSQLStore: any = null;
try {
  const requireFunc = new Function('moduleName', 'return require(moduleName)');
  LibSQLStore = requireFunc('@mastra/libsql').LibSQLStore;
} catch (error) {
  console.warn('LibSQLStore not available, will use in-memory storage');
}
```

### 2. Conditional Storage

```typescript
if (LibSQLStore) {
  // Use disk storage
  memoryConfig.storage = new LibSQLStore({ url: `file:${path}` });
} else {
  // Use in-memory storage (still works, just doesn't persist)
  console.warn('Using in-memory storage');
}
```

### 3. Webpack Configuration

```javascript
externals: {
  '@mastra/libsql': 'commonjs @mastra/libsql',
  '@libsql/client': 'commonjs @libsql/client',
  // ... other native modules
}
```

## Installation

To get full disk storage support:

```bash
npm install
```

This will install native dependencies including `@libsql/darwin-arm64` for macOS ARM64.

## Behavior

### With LibSQL (Full Support)
- ✅ Disk-based storage
- ✅ Memory persists between sessions
- ✅ Semantic recall enabled
- ✅ Better performance

### Without LibSQL (Fallback)
- ✅ Still works with in-memory storage
- ⚠️ Memory doesn't persist between sessions
- ⚠️ Semantic recall disabled (requires storage)
- ✅ All other features work normally

## Error Messages

If you see:
```
⚠️ Mastra: LibSQL not available (native module issue)
⚠️ Mastra: Using in-memory storage
```

This is **normal** and the extension will still work. To enable disk storage:
1. Run `npm install` to install native dependencies
2. Rebuild the extension: `npm run compile`
3. Reload VS Code

## Testing

The extension will:
1. Try to load LibSQL
2. If it fails, log a warning and continue
3. Use in-memory storage as fallback
4. All memory management features still work (just without persistence)

## Status

✅ **Fixed** - Extension works with or without LibSQL native modules
