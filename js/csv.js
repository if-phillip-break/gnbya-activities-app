// CSV parsing utilities, shared by both data sources.

// Parses CSV text into an array of rows (each row an array of cell strings).
// Written character by character rather than splitting on commas/newlines,
// because a naive split breaks on quoted cells containing commas or embedded
// line breaks — both common in real spreadsheet data.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'; // escaped quote inside a quoted field
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignore; the following \n (if any) ends the row
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell !== ""));
}

// Turns parsed rows into plain objects keyed by the header row's names.
function rowsToRecords(rows) {
  const [headerRow, ...dataRows] = rows;
  return dataRows.map((cells) => {
    const record = {};
    headerRow.forEach((header, index) => {
      record[header.trim()] = (cells[index] ?? "").trim();
    });
    return record;
  });
}
