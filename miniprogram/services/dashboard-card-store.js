const STORAGE_PREFIX = "family-health-dashboard-cards-v1";
const CARD_TYPES = [
  "trend",
  "record_list",
  "latest_data",
  "reminder_completion",
  "recurring_rules",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultId() {
  return `card-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function createDashboardCardStore({
  get,
  set,
  createId = createDefaultId,
}) {
  function getStorageKey({ userId, familyId }) {
    if (!userId || !familyId) {
      throw new Error("保存卡片前需要确认当前账号和家庭");
    }

    return `${STORAGE_PREFIX}:${userId}:${familyId}`;
  }

  function readState(scope) {
    try {
      const stored = get(getStorageKey(scope));

      if (Array.isArray(stored)) {
        return {
          exists: true,
          cards: clone(stored),
        };
      }

      if (stored?.version === 1 && Array.isArray(stored.cards)) {
        return {
          exists: true,
          cards: clone(stored.cards),
        };
      }
    } catch (_error) {
      // 本地卡片配置损坏时按尚未配置处理。
    }

    return {
      exists: false,
      cards: [],
    };
  }

  function load(scope) {
    return readState(scope).cards;
  }

  function save(scope, cards) {
    const key = getStorageKey(scope);
    const saved = Array.isArray(cards) ? clone(cards) : [];
    set(key, {
      version: 1,
      cards: saved,
    });
    return clone(saved);
  }

  function createCard(input) {
    if (!CARD_TYPES.includes(input?.type)) {
      throw new Error("请选择有效的卡片类型");
    }

    return {
      id: createId(),
      type: input.type,
      title: input.title || "健康卡片",
      memberIds: Array.isArray(input.memberIds)
        ? [...input.memberIds]
        : [],
      templateId: input.templateId || "",
      timeRange: input.timeRange || "30d",
      fieldKeys: Array.isArray(input.fieldKeys)
        ? [...input.fieldKeys]
        : [],
    };
  }

  return {
    load,

    initialize(scope) {
      const state = readState(scope);

      if (state.exists) {
        return state.cards;
      }

      return save(scope, [
        createCard({
          type: "record_list",
          title: "近期记录",
        }),
      ]);
    },

    add(scope, input) {
      const card = createCard(input);
      save(scope, [...load(scope), card]);
      return clone(card);
    },

    copy(scope, cardId) {
      const cards = load(scope);
      const sourceIndex = cards.findIndex(
        (card) => card.id === cardId,
      );

      if (sourceIndex < 0) {
        throw new Error("没有找到要复制的卡片");
      }

      const copied = {
        ...clone(cards[sourceIndex]),
        id: createId(),
        title: `${cards[sourceIndex].title} 副本`,
      };
      cards.splice(sourceIndex + 1, 0, copied);
      save(scope, cards);
      return clone(copied);
    },

    update(scope, cardId, patch) {
      const cards = load(scope);
      const cardIndex = cards.findIndex(
        (card) => card.id === cardId,
      );

      if (cardIndex < 0) {
        throw new Error("没有找到要修改的卡片");
      }

      const requestedType = patch?.type || cards[cardIndex].type;

      if (!CARD_TYPES.includes(requestedType)) {
        throw new Error("请选择有效的卡片类型");
      }

      const updated = {
        ...cards[cardIndex],
        type: requestedType,
        ...(typeof patch?.title === "string"
          ? { title: patch.title }
          : {}),
        ...(Array.isArray(patch?.memberIds)
          ? { memberIds: [...patch.memberIds] }
          : {}),
        ...(typeof patch?.templateId === "string"
          ? { templateId: patch.templateId }
          : {}),
        ...(typeof patch?.timeRange === "string"
          ? { timeRange: patch.timeRange }
          : {}),
        ...(Array.isArray(patch?.fieldKeys)
          ? { fieldKeys: [...patch.fieldKeys] }
          : {}),
      };
      cards[cardIndex] = updated;
      save(scope, cards);
      return clone(updated);
    },

    reorder(scope, orderedIds) {
      const cards = load(scope);
      const cardsById = new Map(
        cards.map((card) => [card.id, card]),
      );
      const hasSameCards =
        Array.isArray(orderedIds) &&
        orderedIds.length === cards.length &&
        new Set(orderedIds).size === cards.length &&
        orderedIds.every((cardId) => cardsById.has(cardId));

      if (!hasSameCards) {
        throw new Error("卡片排序信息已失效，请重新打开页面");
      }

      return save(
        scope,
        orderedIds.map((cardId) => cardsById.get(cardId)),
      );
    },

    remove(scope, cardId) {
      const cards = load(scope);
      const retained = cards.filter(
        (card) => card.id !== cardId,
      );

      if (retained.length === cards.length) {
        throw new Error("没有找到要删除的卡片");
      }

      return save(scope, retained);
    },
  };
}

module.exports = {
  CARD_TYPES,
  createDashboardCardStore,
};
