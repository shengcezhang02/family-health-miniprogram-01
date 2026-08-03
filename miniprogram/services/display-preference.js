const DISPLAY_SIZE_STORAGE_KEY = "familyHealthDisplaySize";
const DEFAULT_DISPLAY_SIZE = "large";
const DISPLAY_SIZE_VALUES = ["standard", "large", "extra-large"];
const DISPLAY_SIZE_OPTIONS = [
  {
    value: "standard",
    label: "标准",
    description: "信息更紧凑",
  },
  {
    value: "large",
    label: "大字",
    description: "默认，阅读更轻松",
  },
  {
    value: "extra-large",
    label: "特大",
    description: "文字和卡片更宽松",
  },
];

function normalizeDisplaySize(value) {
  return DISPLAY_SIZE_VALUES.includes(value)
    ? value
    : DEFAULT_DISPLAY_SIZE;
}

function toDisplayPreference(value) {
  const normalizedValue = normalizeDisplaySize(value);

  return {
    value: normalizedValue,
    className: `display-size--${normalizedValue}`,
  };
}

function createDisplayPreference({ get, set }) {
  return {
    read() {
      return toDisplayPreference(get(DISPLAY_SIZE_STORAGE_KEY));
    },

    save(value) {
      const preference = toDisplayPreference(value);
      set(DISPLAY_SIZE_STORAGE_KEY, preference.value);
      return preference;
    },
  };
}

function getDisplaySizeOptions() {
  return DISPLAY_SIZE_OPTIONS.map((option) => ({ ...option }));
}

module.exports = {
  createDisplayPreference,
  getDisplaySizeOptions,
  normalizeDisplaySize,
  toDisplayPreference,
};
