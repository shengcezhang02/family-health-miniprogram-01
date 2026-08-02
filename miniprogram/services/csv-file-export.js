function getErrorMessage(error) {
  return error?.errMsg || error?.message || "微信未返回具体原因";
}

async function exportCsvFile({
  csv,
  userDataPath,
  writeFile,
  shareFile,
  copyToClipboard,
  now = Date.now,
}) {
  const fileName = `health-analysis-${now()}.csv`;
  const filePath = `${userDataPath}/${fileName}`;

  await writeFile({
    filePath,
    data: csv,
    encoding: "utf8",
  });

  if (shareFile) {
    try {
      await shareFile({ filePath, fileName });
      return { method: "shared", filePath, fileName };
    } catch (error) {
      if (getErrorMessage(error).includes("cancel")) {
        return { method: "cancelled", filePath, fileName };
      }

      await copyToClipboard(csv.replace(/^\uFEFF/, ""));
      return {
        method: "copied",
        filePath,
        fileName,
        shareErrorMessage: getErrorMessage(error),
      };
    }
  }

  await copyToClipboard(csv.replace(/^\uFEFF/, ""));
  return {
    method: "copied",
    filePath,
    fileName,
    shareErrorMessage: "当前微信版本不支持直接分享文件",
  };
}

module.exports = {
  exportCsvFile,
};
