function findTemplateHistoryConflict(
  existingTemplate,
  nextFields,
  records,
) {
  const nextFieldsByKey = new Map(
    nextFields.map((field) => [field.key, field]),
  );
  const protectedFields = new Map();

  for (const record of records) {
    if (
      record.familyId !== existingTemplate.familyId ||
      record.sourceTemplateType !== "custom" ||
      record.sourceTemplateId !== existingTemplate._id
    ) {
      continue;
    }

    for (const field of record.fieldSchemaSnapshot ?? []) {
      protectedFields.set(field.key, field);
    }
  }

  for (const [fieldKey, snapshotField] of protectedFields) {
    const nextField = nextFieldsByKey.get(fieldKey);

    if (
      !nextField ||
      nextField.type !== snapshotField.type ||
      (nextField.unit ?? "") !== (snapshotField.unit ?? "")
    ) {
      return {
        fieldKey,
      };
    }

    const nextOptionKeys = new Set(
      (nextField.options ?? []).map((option) => option.key),
    );
    const removedOption = (snapshotField.options ?? []).find(
      (option) => !nextOptionKeys.has(option.key),
    );

    if (removedOption) {
      return {
        fieldKey,
        optionKey: removedOption.key,
      };
    }
  }

  return null;
}

module.exports = {
  findTemplateHistoryConflict,
};
