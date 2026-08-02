const test = require("node:test");
const assert = require("node:assert/strict");

const {
  exportCsvFile,
} = require("../miniprogram/services/csv-file-export");

test("真机拒绝分享 CSV 文件时自动复制完整内容而不是报导出失败", async () => {
  const writes = [];
  const copied = [];
  const result = await exportCsvFile({
    csv: "\uFEFF类型,成员\r\n血压记录,小明",
    userDataPath: "wxfile://usr",
    now: () => 123456,
    writeFile: async (options) => writes.push(options),
    shareFile: async () => {
      throw { errMsg: "shareFileMessage:fail unsupported file type" };
    },
    copyToClipboard: async (text) => copied.push(text),
  });

  assert.deepEqual(writes, [
    {
      filePath: "wxfile://usr/health-analysis-123456.csv",
      data: "\uFEFF类型,成员\r\n血压记录,小明",
      encoding: "utf8",
    },
  ]);
  assert.deepEqual(copied, ["类型,成员\r\n血压记录,小明"]);
  assert.deepEqual(result, {
    method: "copied",
    filePath: "wxfile://usr/health-analysis-123456.csv",
    fileName: "health-analysis-123456.csv",
    shareErrorMessage:
      "shareFileMessage:fail unsupported file type",
  });
});

test("用户主动取消文件分享时不误判为失败也不复制内容", async () => {
  let copied = false;
  const result = await exportCsvFile({
    csv: "\uFEFF类型,成员",
    userDataPath: "wxfile://usr",
    now: () => 1,
    writeFile: async () => {},
    shareFile: async () => {
      throw { errMsg: "shareFileMessage:fail cancel" };
    },
    copyToClipboard: async () => {
      copied = true;
    },
  });

  assert.equal(copied, false);
  assert.equal(result.method, "cancelled");
});
