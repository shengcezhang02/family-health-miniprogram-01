const test = require("node:test");
const assert = require("node:assert/strict");

const {
  exportXlsxFile,
} = require("../miniprogram/services/xlsx-file-export");

test("XLSX 写入本地后用微信支持的文档页打开并显示分享菜单", async () => {
  const workbook = new Uint8Array([0x50, 0x4b]).buffer;
  const writes = [];
  const opens = [];

  const result = await exportXlsxFile({
    workbook,
    userDataPath: "wxfile://usr",
    now: () => 123456,
    writeFile: async (options) => writes.push(options),
    openDocument: async (options) => opens.push(options),
  });

  assert.deepEqual(writes, [
    {
      filePath: "wxfile://usr/health-analysis-123456.xlsx",
      data: workbook,
    },
  ]);
  assert.deepEqual(opens, [
    {
      filePath: "wxfile://usr/health-analysis-123456.xlsx",
      fileType: "xlsx",
      showMenu: true,
    },
  ]);
  assert.equal(result.fileName, "health-analysis-123456.xlsx");
});
