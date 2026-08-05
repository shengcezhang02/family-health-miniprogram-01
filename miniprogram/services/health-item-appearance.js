const HEALTH_ITEM_TONES = {
  sys_blood_pressure: "blood-pressure",
  sys_blood_glucose: "blood-glucose",
  sys_medication: "medication",
  sys_temperature: "temperature",
};

const CUSTOM_TEMPLATE_TONES = new Set([
  "rose",
  "blue",
  "green",
  "amber",
  "purple",
  "teal",
]);

function getHealthItemTone(sourceTemplateId, templateColor) {
  if (HEALTH_ITEM_TONES[sourceTemplateId]) {
    return HEALTH_ITEM_TONES[sourceTemplateId];
  }

  if (/^#[0-9A-Fa-f]{6}$/.test(templateColor || "")) {
    return "custom-color";
  }

  return CUSTOM_TEMPLATE_TONES.has(templateColor)
    ? templateColor
    : "purple";
}

function getHealthItemColorStyles(sourceTemplateId, templateColor) {
  if (
    HEALTH_ITEM_TONES[sourceTemplateId] ||
    !/^#[0-9A-Fa-f]{6}$/.test(templateColor || "")
  ) {
    return {};
  }

  const color = templateColor.toUpperCase();
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const rgba = (alpha) =>
    `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  const textColor = `rgb(${Math.round(red * 0.58)}, ${Math.round(
    green * 0.58,
  )}, ${Math.round(blue * 0.58)})`;

  return {
    surfaceStyle: `border-color: ${rgba(
      0.28,
    )}; background: linear-gradient(90deg, ${rgba(
      0.17,
    )} 0%, ${rgba(0.08)} 44%, #ffffff 78%);`,
    labelStyle: `color: ${textColor}; border: 1rpx solid ${color}; background: ${rgba(
      0.15,
    )};`,
    headerStyle: `background: linear-gradient(135deg, ${rgba(
      0.14,
    )} 0%, #ffffff 64%);`,
    badgeStyle: `color: ${textColor}; background: ${rgba(0.15)};`,
    rowStyle: `border-left-color: ${color}; background: linear-gradient(90deg, ${rgba(
      0.15,
    )} 0%, #ffffff 28%);`,
  };
}

module.exports = {
  getHealthItemColorStyles,
  getHealthItemTone,
};
