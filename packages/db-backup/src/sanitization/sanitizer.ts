/**
 * Data sanitization for production databases
 */

import { Database } from 'sqlite3';
import type { SanitizationRules, SanitizationStrategy } from '../types.ts';
import { crypto } from 'std/crypto';

export class DatabaseSanitizer {
  constructor(private db: Database) {}

  /**
   * Apply sanitization rules to the database
   */
  async sanitize(rules: SanitizationRules): Promise<void> {
    console.log('Starting database sanitization...');

    for (const [tableName, tableRules] of Object.entries(rules.tables)) {
      console.log(`Sanitizing table: ${tableName}`);

      // Delete rows if deleteWhere is specified
      if (tableRules.deleteWhere) {
        const deleteStmt = `DELETE FROM "${tableName}" WHERE ${tableRules.deleteWhere}`;
        this.db.exec(deleteStmt);
        console.log(`  Deleted rows matching: ${tableRules.deleteWhere}`);
      }

      // Sanitize columns
      if (tableRules.columns) {
        for (const [columnName, strategy] of Object.entries(tableRules.columns)) {
          if (strategy === 'preserve') continue;

          await this.sanitizeColumn(tableName, columnName, strategy);
        }
      }
    }

    // Vacuum to reclaim space from deleted rows
    this.db.exec('VACUUM');

    console.log('Sanitization complete');
  }

  /**
   * Sanitize a specific column
   */
  private async sanitizeColumn(
    tableName: string,
    columnName: string,
    strategy: SanitizationStrategy
  ): Promise<void> {
    // Get all rows - use aliases to ensure consistent column access
    const rows = this.db.prepare(`SELECT rowid AS row_id, "${columnName}" AS col_value FROM "${tableName}"`).all<{
      row_id: number;
      col_value: unknown;
    }>();

    const updateStmt = this.db.prepare(
      `UPDATE "${tableName}" SET "${columnName}" = ? WHERE rowid = ?`
    );

    this.db.exec('BEGIN TRANSACTION');

    try {
      for (const row of rows) {
        const originalValue = row.col_value;
        if (originalValue === null || originalValue === undefined) continue;

        let newValue: any;

        switch (strategy) {
          case 'hash':
            newValue = await this.hashValue(String(originalValue));
            break;

          case 'clear':
            newValue = null;
            break;

          case 'anonymize':
            newValue = this.anonymizeValue(String(originalValue), columnName);
            break;

          default:
            continue;
        }

        updateStmt.run(newValue, row.row_id);
      }

      this.db.exec('COMMIT');
      console.log(`  Sanitized column: ${columnName} (${strategy})`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Hash a value using SHA-256
   */
  private async hashValue(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Detect field type from column name and value
   */
  private detectFieldType(columnName: string, value: string): string {
    const lower = columnName.toLowerCase();

    if (lower.includes('email') || value.includes('@')) return 'email';
    if (lower.includes('phone') || lower.includes('tel')) return 'phone';
    if (lower.includes('name') || lower === 'first_name' || lower === 'last_name') return 'name';
    if (lower.includes('address') || lower.includes('street')) return 'address';

    return 'default';
  }

  /**
   * Anonymization strategies by field type
   */
  private readonly anonymizationStrategies: Record<string, () => string> = {
    email: () => `user${this.randomId()}@example.com`,
    phone: () => `555-${this.randomDigits(3)}-${this.randomDigits(4)}`,
    name: () => this.randomName(),
    address: () => `${this.randomDigits(3)} Anonymous St`,
    default: () => `[REDACTED-${this.randomId()}]`,
  };

  /**
   * Anonymize a value with fake data
   */
  private anonymizeValue(value: string, columnName: string): string {
    const fieldType = this.detectFieldType(columnName, value);
    const strategy = this.anonymizationStrategies[fieldType];
    return strategy();
  }

  /**
   * Generate random ID
   */
  private randomId(): string {
    return crypto.randomUUID().split('-')[0];
  }

  /**
   * Generate random digits
   */
  private randomDigits(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }

  /**
   * Generate random name
   */
  private randomName(): string {
    const firstNames = [
      'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey',
      'Riley', 'Avery', 'Quinn', 'Peyton', 'Skyler'
    ];
    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
      'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'
    ];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    return `${firstName} ${lastName}`;
  }
}

/**
 * Sanitize a database file (creates sanitized copy)
 */
export async function sanitizeDatabase(
  sourcePath: string,
  targetPath: string,
  rules: SanitizationRules
): Promise<void> {
  // Copy database to target
  await Deno.copyFile(sourcePath, targetPath);

  // Open and sanitize
  const db = new Database(targetPath);
  try {
    const sanitizer = new DatabaseSanitizer(db);
    await sanitizer.sanitize(rules);
  } finally {
    db.close();
  }
}
