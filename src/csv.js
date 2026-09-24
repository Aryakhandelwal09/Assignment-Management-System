// Minimal CSV writer — zero dependencies.
// Escapes a field per RFC 4180: wrap in quotes if it contains a comma,
// quote, or newline; double up any internal quotes.

function escapeField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields) {
  return fields.map(escapeField).join(',') + '\r\n';
}

// rows: array of objects; columns: array of { key, header }
function toCsv(rows, columns) {
  let out = toCsvRow(columns.map((c) => c.header));
  for (const row of rows) {
    out += toCsvRow(columns.map((c) => row[c.key]));
  }
  return out;
}

module.exports = { toCsvRow, toCsv };