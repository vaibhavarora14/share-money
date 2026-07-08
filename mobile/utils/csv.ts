/**
 * Minimal CSV parser (RFC 4180 subset) used for Splitwise exports.
 *
 * Handles quoted fields (including embedded commas, quotes and newlines),
 * CRLF/LF line endings and a leading UTF-8 byte-order mark. Machine-generated
 * exports like Splitwise's fit comfortably within this subset, so no external
 * parsing dependency is needed.
 */
export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM if present
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
    } else if (char === ",") {
      pushField();
      i += 1;
    } else if (char === "\n") {
      pushRow();
      i += 1;
    } else if (char === "\r") {
      pushRow();
      i += input[i + 1] === "\n" ? 2 : 1;
    } else {
      field += char;
      i += 1;
    }
  }

  // Flush the last field/row (files without a trailing newline)
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}
