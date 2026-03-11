# Changelog

All notable changes to the @p2b/db-core package will be documented in this file.

## [1.0.0] - 2025-12-15

### Added

- Initial release of shared database core package
- `BaseDatabaseManager` class for common database operations
- `MigrationManager` for SQL and TypeScript migration support
- Database path discovery with `findDbFile()` utility
- SQLite extension loading support
- Automatic `updated_at` trigger generation
- Type definitions for database operations
- Comprehensive README with usage examples
- Example files demonstrating basic and extended usage

### Features

- Automatic migration running on initialization
- WAL mode and performance pragma configuration
- Foreign key constraint enforcement
- Transaction support
- Extensible design for service-specific implementations
- Environment-dependent table creation callback
- Migration rollback support (with rollback files)
- Migration status tracking and reporting

### Documentation

- Complete API reference in README.md
- Basic usage example
- Extended usage example with service-specific extension
- Integration guide for P2B services
