# Package Structure

Complete file structure and organization of the `@p2b/db-core` package.

## Directory Tree

```
packages/db-core/
├── deno.json                 # Package configuration and exports
├── README.md                 # Main documentation
├── CHANGELOG.md              # Version history
├── MIGRATION_GUIDE.md        # Guide for migrating services to use this package
├── STRUCTURE.md              # This file
├── .gitignore               # Git ignore patterns
│
├── src/                     # Source code
│   ├── index.ts             # Main exports
│   ├── types.ts             # TypeScript type definitions
│   ├── migrations.ts        # MigrationManager class
│   └── databaseManager.ts   # BaseDatabaseManager class
│
└── examples/                # Usage examples
    ├── basic-usage.ts       # Simple example
    └── extended-usage.ts    # Advanced service integration example
```

## File Descriptions

### Core Files

#### `deno.json`
Package configuration defining:
- Package name: `@p2b/db-core`
- Version: `1.0.0`
- Exports: Main module and submodules
- Dependencies: std library and @db/sqlite

#### `src/index.ts`
Main entry point exporting:
- `BaseDatabaseManager` class
- `MigrationManager` class
- Utility functions (`findDbFile`, `checkDirectoryPermissions`)
- TypeScript types

#### `src/types.ts`
Type definitions including:
- `Migration` - Migration metadata
- `MigrationStatus` - Migration status info
- `QueryResult` - Query result wrapper
- `DatabaseConfig` - Database configuration
- `DatabaseManagerOptions` - Constructor options
- `DbSearchOptions` - Database search parameters

#### `src/migrations.ts`
Migration management system:
- `MigrationManager` class
- SQL and TypeScript migration support
- Migration status tracking
- Automatic trigger generation
- Rollback support

#### `src/databaseManager.ts`
Base database manager:
- `BaseDatabaseManager` class
- Connection management
- Configuration (pragmas, extensions)
- Path resolution
- Migration integration

### Documentation

#### `README.md`
Complete package documentation:
- Overview and features
- Installation and usage
- API reference
- Migration guide
- Examples

#### `MIGRATION_GUIDE.md`
Service migration guide:
- Step-by-step migration instructions
- Common patterns
- Before/after examples
- Troubleshooting

#### `CHANGELOG.md`
Version history and release notes

#### `STRUCTURE.md`
This file - package organization reference

### Examples

#### `examples/basic-usage.ts`
Demonstrates:
- Creating a DatabaseManager instance
- Creating tables
- Running queries
- Basic CRUD operations

#### `examples/extended-usage.ts`
Demonstrates:
- Extending BaseDatabaseManager
- Service-specific table managers
- Custom path resolution
- Environment tables
- Extension loading

## Export Structure

The package provides several import paths:

### Default Export
```typescript
import { BaseDatabaseManager, MigrationManager } from "@p2b/db-core";
```

### Submodule Exports
```typescript
import type { Migration, DatabaseConfig } from "@p2b/db-core/types";
import { MigrationManager } from "@p2b/db-core/migrations";
import { BaseDatabaseManager } from "@p2b/db-core/database-manager";
```

## Usage Patterns

### Pattern 1: Basic Usage
```typescript
import { BaseDatabaseManager } from "@p2b/db-core";

const db = new BaseDatabaseManager("/path/to/db.db");
```

### Pattern 2: Extended Usage
```typescript
import { BaseDatabaseManager, DatabaseManagerOptions } from "@p2b/db-core";

export class MyServiceDB extends BaseDatabaseManager {
  constructor(dbPath?: string, options?: DatabaseManagerOptions) {
    super(dbPath, {
      ...options,
      migrationsDir: "./migrations/sql",
    });
  }
}
```

### Pattern 3: Import Utilities
```typescript
import { findDbFile, checkDirectoryPermissions } from "@p2b/db-core";

const dbPath = findDbFile("mydb.db");
if (dbPath) {
  checkDirectoryPermissions(dbPath);
}
```

## Dependencies

### Runtime Dependencies
- `@db/sqlite` (v0.11+) - SQLite database driver
- Deno standard library (v0.224.0)
  - `std/path` - Path utilities
  - `std/fs` - File system utilities

### Development Dependencies
None - minimal package with no dev dependencies

## Integration Points

### Service Integration
Services import the package using workspace references:

```json
// service/deno.json
{
  "imports": {
    "@p2b/db-core": "../packages/db-core/src/index.ts"
  }
}
```

### Migration Integration
Services keep their own migration files and reference them:

```typescript
const migrationsDir = join(
  dirname(new URL(import.meta.url).pathname),
  'migrations',
  'sql'
);

super(dbPath, { migrationsDir });
```

## Design Principles

1. **Minimal Dependencies**: Only essential dependencies (sqlite3, std library)
2. **Extensibility**: Base classes designed to be extended
3. **Flexibility**: Options for customization via constructor parameters
4. **Type Safety**: Comprehensive TypeScript types
5. **Documentation**: Extensive inline comments and external docs
6. **Examples**: Practical examples for common use cases

## Version Management

- Semantic Versioning (semver)
- Breaking changes increment major version
- New features increment minor version
- Bug fixes increment patch version

## Testing Strategy

Services should test their extended implementations:
- Database connection
- Migration execution
- Service-specific methods
- Table operations
- Extension loading

## Future Enhancements

Potential additions for future versions:
- Connection pooling
- Query builder utilities
- Schema validation
- Backup/restore utilities
- Performance monitoring hooks
- Multi-database support
- PostgreSQL adapter

## Contributing

When modifying this package:
1. Update CHANGELOG.md
2. Add examples for new features
3. Update README.md API reference
4. Maintain backward compatibility
5. Add TypeScript types for new functionality
