# @p2b/db-backup

Database backup, restore, sanitization, and health management utilities for P2B microservices.

## Features

- **Encrypted Backups** - AES-256-GCM encryption before upload
- **Wasabi/S3 Storage** - Cloud backup with configurable retention
- **Data Sanitization** - Safely prepare production data for dev/test
- **Auto-Repair** - Detect and repair corrupted databases
- **Integrity Checking** - Comprehensive database health validation
- **VACUUM Support** - Reclaim space from deleted records
- **SQLite Backup API** - Consistent snapshots even with active writers (WAL mode)
- **Simplified Codebase** - 29% less code with utility functions and better patterns

## Installation

Add to your service's `deno.json`:

```json
{
  "imports": {
    "@p2b/db-backup": "../packages/db-backup/src/index.ts"
  }
}
```

## Quick Start

### 1. Environment Configuration

Create `.env` file with Wasabi credentials:

```bash
# Wasabi S3 Configuration
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_REGION=us-east-1
WASABI_BUCKET=p2b-backups
WASABI_ACCESS_KEY_ID=your-access-key
WASABI_SECRET_ACCESS_KEY=your-secret-key

# Encryption (generate with: deno task db:generate-key)
DB_BACKUP_ENCRYPTION_KEY=base64-encoded-32-byte-key

# Environment
ENVIRONMENT=dev
```

### 2. Create Backup Manager

```typescript
import { BackupManager } from '@p2b/db-backup';

const backupManager = new BackupManager({
  service: 'crm',
  dbPath: '/app/database/crm.db',
  s3: {
    endpoint: Deno.env.get('WASABI_ENDPOINT')!,
    region: Deno.env.get('WASABI_REGION')!,
    bucket: Deno.env.get('WASABI_BUCKET')!,
    accessKeyId: Deno.env.get('WASABI_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('WASABI_SECRET_ACCESS_KEY')!,
  },
  encryption: {
    key: Deno.env.get('DB_BACKUP_ENCRYPTION_KEY')!,
  },
  environment: 'production',
  retentionDays: 30,
});
```

### 3. Create a Backup

```typescript
const result = await backupManager.backup({
  environment: 'production',
  tags: { scheduled: 'true' },
  notes: 'Daily automated backup',
  compress: true,
  verify: true,
});

if (result.success) {
  console.log(`Backup created: ${result.metadata.id}`);
  console.log(`Size: ${result.metadata.backupSize} bytes (${result.duration}ms)`);
}
```

### 4. Restore a Backup

```typescript
const result = await backupManager.restore(backupId, {
  targetPath: './database/test/crm.db',
  overwrite: true,
  verify: true,
});

if (result.success) {
  console.log(`Restored to: ${result.targetPath}`);
}
```

### 5. Restore with Sanitization

```typescript
import { SanitizationRules } from '@p2b/db-backup';

const sanitizationRules: SanitizationRules = {
  tables: {
    contacts: {
      columns: {
        email: 'hash',
        phone: 'clear',
        name: 'anonymize',
      },
    },
    sessions: {
      deleteWhere: '1=1', // Delete all sessions
    },
  },
};

const result = await backupManager.restore(backupId, {
  targetPath: './database/dev/crm.db',
  sanitize: true,
  sanitizationRules,
  targetEnvironment: 'dev',
});
```

## CLI Usage

Use the `scripts/db-tools.ts` CLI for common operations:

```bash
# List available backups
deno task db:list --service=crm --env=production

# Pull latest production backup (sanitized) to dev
deno task db:pull --service=crm --env=production --sanitize

# Pull specific backup
deno task db:pull --service=crm --backup-id=abc123 --target=./test-db.db

# Create a backup
deno task db:backup --service=crm --env=production

# Run integrity check
deno task db:health-check --service=crm

# Run VACUUM
deno task db:vacuum --service=crm

# Generate encryption key
deno task db:generate-key
```

## Integration with BaseDatabaseManager

Extend your database manager with backup capabilities:

```typescript
import { BaseDatabaseManager } from '@p2b/db-core';
import { BackupManager, SanitizationRules } from '@p2b/db-backup';

export class CrmDatabaseManager extends BaseDatabaseManager {
  private backupManager?: BackupManager;

  async initBackup() {
    this.backupManager = new BackupManager({
      service: 'crm',
      dbPath: this.dbPath,
      s3: { /* ... */ },
      encryption: { /* ... */ },
      sanitizationRules: crmSanitizationRules,
    });
  }

  async backup() {
    if (!this.backupManager) await this.initBackup();
    return await this.backupManager!.backup();
  }

  async restore(backupId: string, options?: RestoreOptions) {
    if (!this.backupManager) await this.initBackup();
    return await this.backupManager!.restore(backupId, options);
  }

  async integrityCheck() {
    if (!this.backupManager) await this.initBackup();
    return this.backupManager!.integrityCheck();
  }

  async autoRepair() {
    if (!this.backupManager) await this.initBackup();
    return await this.backupManager!.autoRepair();
  }
}
```

## Data Sanitization

Define sanitization rules for each service:

```typescript
export const mySanitizationRules: SanitizationRules = {
  tables: {
    users: {
      columns: {
        email: 'hash',           // SHA-256 hash
        password: 'clear',       // Set to NULL
        name: 'anonymize',       // Replace with fake names
        user_id: 'preserve',     // Keep original value
      },
      deleteWhere: "role = 'admin'", // Delete admin users
    },
    sessions: {
      deleteWhere: '1=1', // Delete all sessions
    },
  },
};
```

### Sanitization Strategies

- **`hash`** - Replace with SHA-256 hash of original value
- **`clear`** - Set to NULL
- **`anonymize`** - Replace with realistic fake data (emails, names, phones, addresses)
- **`preserve`** - Keep original value unchanged

## Health Management

### Integrity Checks

```typescript
const result = backupManager.integrityCheck();

if (!result.ok) {
  console.error('Integrity issues:', result.errors);
}
```

### Auto-Repair

```typescript
const result = await backupManager.autoRepair();

if (result.success) {
  console.log(`Repaired using: ${result.repairStrategy}`);
}
```

### VACUUM

```typescript
// Check if VACUUM would help
if (await backupManager.shouldVacuum()) {
  const result = await backupManager.vacuum();
  console.log(`Reclaimed ${result.spaceReclaimed} bytes`);
}
```

## Workflow Integration

Use with Platform workflows for scheduled operations:

```yaml
# database-backup-all.yaml
name: Backup All Services
steps:
  - action: crm.database.backup
  - action: bow.database.backup
  - action: bps.database.backup
  - action: platform.database.backup
```

## API Reference

### BackupManager

#### Methods

- `backup(options?: BackupOptions): Promise<BackupResult>`
- `restore(backupId: string, options?: RestoreOptions): Promise<RestoreResult>`
- `integrityCheck(): IntegrityResult`
- `vacuum(): Promise<VacuumResult>`
- `autoRepair(): Promise<RepairResult>`
- `listBackups(options?): Promise<BackupCatalogEntry[]>`
- `findLatestBackup(options?): Promise<BackupMetadata | null>`
- `cleanupOldBackups(): Promise<number>`
- `shouldVacuum(): Promise<boolean>`

### Standalone Functions

```typescript
import {
  generateEncryptionKey,
  checkIntegrity,
  vacuum,
  sanitizeDatabase,
  backupDatabase,
} from '@p2b/db-backup';

// Generate new encryption key
const key = await generateEncryptionKey();

// Check database integrity
const result = checkIntegrity('/path/to/db.db');

// Run VACUUM
const vacResult = await vacuum('/path/to/db.db');

// Sanitize database file
await sanitizeDatabase(
  '/path/to/source.db',
  '/path/to/sanitized.db',
  sanitizationRules
);
```

## Security Considerations

1. **Encryption Keys** - Store in environment variables, never commit to git
2. **Key Rotation** - Use `keyVersion` field to support multiple keys
3. **Production Data** - Always sanitize before using in dev/test
4. **S3 Credentials** - Use least-privilege IAM policies
5. **Environment Checks** - Restore operations verify target environment

## Best Practices

1. **Daily Backups** - Schedule automated backups via workflows
2. **Verify Backups** - Always use `verify: true` option
3. **Retention Policy** - Configure appropriate `retentionDays`
4. **Pre-Sanitized Backups** - Create sanitized versions nightly for faster dev access
5. **Test Restores** - Periodically test restore process
6. **Monitor Health** - Run integrity checks regularly
7. **VACUUM Schedule** - Weekly VACUUM during low-traffic windows

## Troubleshooting

### Backup Fails with "Database Locked"

Ensure WAL mode is enabled (handled by `@p2b/db-core` BaseDatabaseManager).

### Restore Fails Hash Verification

- Backup file may be corrupted
- Wrong encryption key
- Try different backup

### Sanitization Incomplete

- Check sanitization rules syntax
- Verify column names match schema
- Test on copy of database first

## Code Simplifications

This package has been simplified from the original design:

- **29% reduction in total lines of code** (1,200 → 850 lines)
- **87% reduction in duplicate code** (150 → 20 lines)
- **50% reduction in cyclomatic complexity** (8.2 → 4.1 average)

### Key improvements:
1. **Stream Utilities** - Centralized stream handling eliminates 80+ lines of duplicate code
2. **Config Validation** - Centralized validation with clear error messages
3. **Strategy Pattern** - Anonymization strategies are modular and extensible
4. **Simpler Error Handling** - Consistent patterns throughout

See `docs/backup-system-simplifications.md` for detailed analysis.

### Testing

Comprehensive test suite with 22 unit tests covering:
- Encryption/decryption operations
- SQLite backup/restore
- Data sanitization strategies
- Integrity checks
- VACUUM operations
- End-to-end integration

See `TESTING.md` for complete testing guide.

## License

Proprietary - Twin Flames Studios
