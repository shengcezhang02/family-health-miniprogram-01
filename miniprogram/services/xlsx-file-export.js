async function exportXlsxFile({
  workbook,
  userDataPath,
  writeFile,
  openDocument,
  now = Date.now,
}) {
  const fileName = `health-analysis-${now()}.xlsx`;
  const filePath = `${userDataPath}/${fileName}`;

  await writeFile({ filePath, data: workbook });
  await openDocument({
    filePath,
    fileType: "xlsx",
    showMenu: true,
  });

  return { filePath, fileName };
}

module.exports = {
  exportXlsxFile,
};
