/**
 * Compact pipe-delimited table format for LLM prompts.
 * Serializes arrays of objects into a TOON-inspired format that saves 40-60% tokens vs JSON.
 *
 * Format:
 * [N rows]
 * col1|col2|col3
 * val1|val2|val3
 *
 * Pipe characters in values are escaped as \|
 * Newlines in values are escaped as \\n
 */

/**
 * Convert an array of objects to compact pipe-delimited table format.
 *
 * @param rows - Array of objects to serialize
 * @param columns - Optional column names. If not specified, auto-detected from first row.
 * @returns Compact table string
 */
export function toCompactTable(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  if (rows.length === 0) {
    return "[0 rows]";
  }

  const cols = columns || Object.keys(rows[0]);

  const header = `[${rows.length} rows]\n${cols.join("|")}`;

  const dataRows = rows.map((row) =>
    cols
      .map((col) => escapeValue(row[col]))
      .join("|")
  );

  return `${header}\n${dataRows.join("\n")}`;
}

function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);

  return str
    .replace(/\|/g, "\\|")
    .replace(/\n/g, "\\n");
}
