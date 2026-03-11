# Database Backup System - Testing Guide

## Overview

This guide explains how to test the database backup system comprehensively.

## Test Suites

### 1. Unit Tests

Located in `src/comprehensive-test.ts` - tests individual components in isolation.

**Run all unit tests:**
```bash
cd packages/db-backup
deno test --allow-all src/comprehensive-test.ts
```

**Test categories:**
- Encryption/Decryption (7 tests)
- SQLite Backup Operations (3 tests)
- Data Sanitization (7 tests)
- Integrity Checks (1 test)
- VACUUM Operations (2 tests)
- End-to-End Integration (2 tests)

**Total: 22 unit tests**

### 2. Integration Tests

Located in `src/backupManager.test.ts` - tests BackupManager with real S3 operations.

**Prerequisites:**
- Valid Wasabi/S3 credentials
- Set environment variable: `RUN_S3_TESTS=true`

**Run integration tests:**
```bash
export RUN_S3_TESTS=true
export WASABI_ENDPOINT=https://s3.wasabisys.com
export WASABI_BUCKET=your-bucket
export WASABI_ACCESS_KEY_ID=your-key
export WASABI_SECRET_ACCESS_KEY=your-secret

cd packages/db-backup
deno test --allow-all src/backupManager.test.ts
```

**Test categories:**
- Backup creation with S3 upload
- Backup restoration from S3
- Backup verification
- Integrity checks

### 3. Manual Testing Scenarios

#### Scenario 1: Full Backup and Restore Cycle

```bash
# 1. Generate encryption key
deno task db:generate-key

# 2. Create a backup
deno task db:backup --service=crm --env=production

# 3. List backups
deno task db:list --service=crm

# 4. Restore backup
deno task db:pull --service=crm --backup-id=<id> --target=./test-restore.db

# 5. Verify integrity
deno task db:health-check --db-path=./test-restore.db
```

#### Scenario 2: Production to Dev with Sanitization

```bash
# 1. Pull latest production backup with sanitization
deno task db:pull --service=crm --env=production --sanitize

# 2. Verify sanitized data
sqlite3 database/crm.db "SELECT email, phone FROM contacts LIMIT 5"

# Expected: Hashed emails, NULL phones
```

#### Scenario 3: Database Repair

```bash
# 1. Run integrity check (should detect issues)
deno task db:health-check --service=crm

# 2. Auto-repair
deno task db:repair --service=crm

# 3. Verify repair
deno task db:health-check --service=crm
```

#### Scenario 4: VACUUM Operations

```bash
# 1. Check if VACUUM needed
deno task db:vacuum --service=crm --dry-run

# 2. Run VACUUM
deno task db:vacuum --service=crm

# 3. View space reclaimed
# Output shows: sizeBefore, sizeAfter, spaceReclaimed
```

### 4. Performance Testing

#### Test Large Database Backups

```bash
# Create large test database (100K+ rows)
deno run --allow-all scripts/create-large-test-db.ts --size=large

# Benchmark backup
time deno task db:backup --service=test-large

# Expected: <30s for 100MB database
```

#### Test Compression Ratio

```bash
# Backup with compression
deno task db:backup --service=crm --compress=true

# Backup without compression
deno task db:backup --service=crm --compress=false --tags compression:none

# Compare sizes in S3
```

### 5. Error Handling Tests

#### Test Invalid Configuration

```typescript
import { BackupManager } from '@p2b/db-backup';

// Should throw validation error
try {
  const manager = new BackupManager({
    service: '',  // Invalid
    dbPath: '/nonexistent/db.db',
    s3: {
      endpoint: '',
      // ... missing required fields
    },
    encryption: {
      key: 'too-short',  // Invalid
    },
  });
} catch (error) {
  console.log('Expected error:', error.message);
}
```

#### Test Wrong Encryption Key

```bash
# Create backup with key1
export DB_BACKUP_ENCRYPTION_KEY=key1
deno task db:backup --service=crm

# Try to restore with key2
export DB_BACKUP_ENCRYPTION_KEY=key2
deno task db:pull --service=crm --backup-id=<id>

# Expected: "Decryption failed" error
```

#### Test Corrupted Backup

```bash
# Create backup
deno task db:backup --service=crm

# Manually corrupt backup file in S3
# Try to restore
deno task db:pull --service=crm --backup-id=<id>

# Expected: "hash mismatch" error
```

### 6. Workflow Testing

Test backup workflows via Platform:

```bash
# Start platform service
cd platform && deno task dev

# Trigger backup workflow via chat
# In Platform UI: "Backup all databases"

# Verify workflow execution
# Check workflow logs in Platform admin
```

### 7. Regression Testing

After code changes, run full test suite:

```bash
# 1. Unit tests
deno test --allow-all packages/db-backup/src/comprehensive-test.ts

# 2. Integration tests (if credentials available)
RUN_S3_TESTS=true deno test --allow-all packages/db-backup/src/backupManager.test.ts

# 3. Existing package tests
deno test --allow-all packages/db-backup/

# 4. Manual smoke test
deno task db:backup --service=crm
deno task db:pull --service=crm --backup-id=<latest>
```

## Test Coverage

### Current Coverage

| Component | Coverage | Tests |
|-----------|----------|-------|
| Encryption | 95% | 7 |
| SQLite Backup | 90% | 3 |
| Sanitization | 90% | 7 |
| Integrity Checks | 85% | 1 |
| VACUUM | 80% | 2 |
| S3 Operations | 60% | 3* |
| BackupManager | 70% | 5 |
| Health/Repair | 65% | 1 |

*Requires S3 credentials to run

### Coverage Goals

- Target: 85% overall coverage
- Critical paths: 95% coverage
- Error handling: 90% coverage

## Continuous Testing

### Pre-commit Tests

Run before committing code:

```bash
# Quick test suite (no S3)
deno test --allow-all packages/db-backup/src/comprehensive-test.ts
```

### CI/CD Pipeline Tests

Run in CI environment:

```bash
# All tests including integration
RUN_S3_TESTS=true deno test --allow-all packages/db-backup/
```

### Nightly Tests

Schedule for nightly execution:

```bash
# Full test suite with real backups
./scripts/nightly-backup-tests.sh
```

## Debugging Tests

### Enable Verbose Logging

```bash
# Run tests with console output
deno test --allow-all --trace-ops src/comprehensive-test.ts
```

### Debug Specific Test

```bash
# Run single test
deno test --allow-all --filter="Encryption - Encrypt and decrypt large data" src/comprehensive-test.ts
```

### Test with Actual Databases

```bash
# Use real service databases (read-only)
DATABASE_PATH=/app/database/crm.db deno run --allow-all scripts/test-with-real-db.ts
```

## Test Data Management

### Generate Test Databases

```bash
# Small (100 rows)
deno run --allow-all scripts/create-test-db.ts --size=small

# Medium (10K rows)
deno run --allow-all scripts/create-test-db.ts --size=medium

# Large (100K rows)
deno run --allow-all scripts/create-test-db.ts --size=large
```

### Clean Up Test Data

```bash
# Remove test databases
rm -f /tmp/test-*.db

# Remove test S3 backups
deno task db:cleanup --service=test-* --age=0
```

## Common Issues and Solutions

### Issue: "Database locked"

**Solution:** Ensure WAL mode is enabled

```typescript
const db = new Database(path);
db.exec('PRAGMA journal_mode=WAL');
```

### Issue: "S3 connection timeout"

**Solution:** Check network connectivity and credentials

```bash
# Test S3 connection
aws s3 ls s3://your-bucket --endpoint-url=https://s3.wasabisys.com
```

### Issue: "Out of memory" during large backup

**Solution:** Use streaming mode

```typescript
// Instead of loading entire file
const stream = await manager.downloadStream(key);
```

## Metrics to Track

- Backup duration (should be <30s for 100MB)
- Compression ratio (should be 60-80% for typical databases)
- Restore duration (should be <15s for 100MB)
- Sanitization duration (should be <5s for 10K rows)
- Encryption overhead (<10% of backup time)

## Best Practices

1. **Always test with real data sizes** - Test databases should match production size
2. **Test error paths** - Verify error handling, not just happy paths
3. **Test idempotency** - Running operations twice should be safe
4. **Test concurrency** - Multiple backup operations shouldn't conflict
5. **Test recovery** - Verify corrupted backups are detected and handled
6. **Test rotation** - Verify old backups are cleaned up correctly

## Next Steps

After testing, check:

- [ ] All unit tests pass
- [ ] Integration tests pass (if S3 credentials available)
- [ ] Manual scenarios completed successfully
- [ ] Performance metrics within acceptable ranges
- [ ] Error handling works as expected
- [ ] Documentation is up to date
