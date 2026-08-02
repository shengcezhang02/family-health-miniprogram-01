const {
  buildAnalysisTable,
} = require("./analysis-export");

function utf8Bytes(text) {
  const bytes = [];

  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);

    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      index + 1 < text.length
    ) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint =
          0x10000 +
          ((codePoint - 0xd800) << 10) +
          (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(
        0xc0 | (codePoint >> 6),
        0x80 | (codePoint & 0x3f),
      );
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return Uint8Array.from(bytes);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

let crcTable;

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }

  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        value & 1
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
}

function crc32(bytes) {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createHeader(length) {
  const bytes = new Uint8Array(length);
  return {
    bytes,
    view: new DataView(bytes.buffer),
  };
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  files.forEach((file) => {
    const name = utf8Bytes(file.name);
    const data = utf8Bytes(file.content);
    const checksum = crc32(data);
    const local = createHeader(30);

    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    local.view.setUint16(28, 0, true);

    const localEntry = concatBytes([local.bytes, name, data]);
    localParts.push(localEntry);

    const central = createHeader(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, 0, true);
    central.view.setUint32(42, localOffset, true);
    centralParts.push(concatBytes([central.bytes, name]));
    localOffset += localEntry.length;
  });

  const localBytes = concatBytes(localParts);
  const centralBytes = concatBytes(centralParts);
  const end = createHeader(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralBytes.length, true);
  end.view.setUint32(16, localBytes.length, true);
  end.view.setUint16(20, 0, true);

  const result = concatBytes([localBytes, centralBytes, end.bytes]);
  return result.buffer.slice(
    result.byteOffset,
    result.byteOffset + result.byteLength,
  );
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellXml(value, columnIndex, rowIndex, isHeader) {
  const reference = `${columnName(columnIndex)}${rowIndex}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }

  const style = isHeader ? ' s="1"' : "";
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(
    value ?? "",
  )}</t></is></c>`;
}

function sheetXml(headers, rows) {
  const allRows = [headers, ...rows];
  const body = allRows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) =>
          cellXml(value, columnIndex, rowIndex + 1, rowIndex === 0),
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="3" width="21" customWidth="1"/><col min="4" max="10" width="17" customWidth="1"/></cols>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function buildAnalysisXlsx(options) {
  const table = buildAnalysisTable(options);
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="健康分析" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font/><font><b/><color rgb="FFFFFFFF"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2E6F68"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: sheetXml(table.headers, table.rows),
    },
  ];

  return createZip(files);
}

module.exports = {
  buildAnalysisXlsx,
};
