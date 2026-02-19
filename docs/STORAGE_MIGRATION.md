# Storage Migration: Moving Large Data to Disk

## Overview

CipherMate was experiencing "large extension state detected" warnings from VS Code because large amounts of data (scans, vulnerabilities, chat sessions, etc.) were being stored in `globalState`, which is an in-memory JSON dictionary not suitable for large data.

## Solution

We've implemented a disk-based storage service using VS Code's `globalStorageUri`, which stores data as JSON files on disk instead of in memory. This addresses the warning and improves performance.

## Changes Made

### 1. New Disk Storage Service (`src/storage/disk-storage-service.ts`)

A new `DiskStorageService` class that:
- Uses `globalStorageUri` to store data as JSON files on disk
- Provides a synchronous API compatible with `globalState` (for API compatibility)
- Handles file operations atomically (write to temp file, then rename)
- Includes migration utilities to move data from `globalState` to disk

### 2. Migrated Components

The following components now use disk storage instead of `globalState`:

#### **Scan Database** (`src/database/scan-database.ts`)
- `ciphermate.db.scans` - Scan records
- `ciphermate.db.vulnerabilities` - Vulnerability records (likely the largest contributor)
- `ciphermate.db.users` - User records

#### **Chat Interface** (`src/ai-agent/chat-interface.ts`)
- `ciphermate.chatSessions` - Chat session history

#### **Developer Profile** (`src/extension.ts`)
- `ciphermate.ai_memory` (MEMORY_KEY) - Developer profile and learning data

#### **Team Features** (`src/extension.ts`)
- `ciphermate.team_data` (TEAM_DATA_KEY) - Team lead data
- `ciphermate.team_reports` (TEAM_REPORTS_KEY) - Team vulnerability reports

#### **Fix System**
- `ciphermate.fixBackups` - Backup snapshots (`src/fix-system/backup-manager.ts`)
- `ciphermate.fixUndoStack` - Undo stack (`src/fix-system/undo-manager.ts`)

### 3. Migration Strategy

Each component implements a lazy migration strategy:
1. On first access, check if data exists in disk storage
2. If not found, check `globalState` for existing data
3. If found in `globalState`, migrate to disk storage and clear from `globalState`
4. Use disk storage for all future operations

Additionally, a one-time migration function (`migrateLargeDataToDisk`) runs during extension activation to proactively migrate all large data keys.

### 4. Data Still in globalState

The following small data remains in `globalState` (appropriate for in-memory storage):
- Settings (`ciphermate.settings`)
- Welcome screen flag (`ciphermate.hasSeenWelcome`)
- JWT secret (`ciphermate.jwt.secret`)
- User profile (`ciphermate.userProfile`) - small profile data
- Anonymous user ID (`ciphermate.anonymousUserId`) - just a string

## Benefits

1. **Eliminates Warning**: No more "large extension state detected" warnings
2. **Better Performance**: Large data is stored on disk, reducing memory pressure on the extension host
3. **Scalability**: Can handle much larger datasets without hitting VS Code's state size limits
4. **Backward Compatible**: Automatic migration ensures existing users don't lose data
5. **Transparent**: The API remains synchronous and compatible with existing code

## Storage Location

Data is stored in VS Code's global storage directory:
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/ciphermate.ciphermate/`
- **Windows**: `%APPDATA%\Code\User\globalStorage\ciphermate.ciphermate\`
- **Linux**: `~/.config/Code/User/globalStorage/ciphermate.ciphermate/`

Files are stored as JSON files with sanitized key names (e.g., `ciphermate.db.vulnerabilities.json`).

## Future Considerations

### Server-Side Storage

The user mentioned potentially moving storage to a server. This would require:
1. Backend API for data storage
2. Authentication/authorization
3. Data synchronization logic
4. Offline support/caching

For now, local disk storage addresses the immediate issue. Server-side storage can be added later as a separate feature if needed.

### Additional Optimizations

Potential future improvements:
- Compression for large JSON files
- Indexing for faster lookups
- Incremental updates instead of full file rewrites
- Data cleanup/archival for old scans

## Testing

To verify the migration worked:
1. Check the VS Code console - the "large extension state detected" warning should no longer appear
2. Verify data persists after extension restart
3. Check the storage directory to see JSON files being created
4. Verify all features (scans, chat, backups) continue to work normally

## Rollback

If issues occur, the migration is reversible:
1. Data remains in `globalState` until accessed (lazy migration)
2. Can manually copy data back from disk storage files if needed
3. The old `globalState` code paths are still present as fallbacks
