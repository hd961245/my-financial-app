function parseCSV(text) {
    const result = [];
    let row = [];
    let currentCell = '';
    let inQuotes = false;

    // Ensure text ends with a newline to trigger the last row push
    if (!text.endsWith('\n')) text += '\n';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                // Check if it's an escaped quote
                if (i < text.length - 1 && text[i + 1] === '"') {
                    currentCell += '"';
                    i++; // skip next quote
                } else {
                    inQuotes = false; // end of quoted string
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(currentCell);
                currentCell = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && i < text.length - 1 && text[i + 1] === '\n') {
                    i++; // skip \n of \r\n
                }
                row.push(currentCell);
                result.push(row);
                row = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
    }

    // Clean up empty trailing rows caused by extra newlines
    return result.filter(r => r.length > 1 || r[0] !== '');
}

const csvText = `股票代號,公司名稱,目標價
AAPL,Apple Inc,150
TSLA,"Tesla, Inc.",200`;

const rows = parseCSV(csvText);
console.log("ROWS:", rows);

const headers = rows[0].map(h => h.trim());
const data = rows.slice(1).map((row, index) => {
    const rowData = { id: String(index) };
    headers.forEach((header, colIndex) => {
        const cleanHeader = header || `Col${colIndex}`;
        rowData[cleanHeader] = row[colIndex] !== undefined ? row[colIndex].trim() : '';
    });
    return rowData;
});
console.log("FINAL DATA:", JSON.stringify(data, null, 2));
