const {
  getMainNavigationItems,
  getNextQuickAddVisibility,
  getQuickAddActions,
  getQuickAddRoute,
  getSelectedNavigationIndex,
} = require("../services/main-navigation");

const ICONS = {
  records: "/assets/icons/record.svg",
  "daily-health": "/assets/icons/daily.svg",
  "advanced-analysis": "/assets/icons/analysis.svg",
  "me-and-family": "/assets/icons/family.svg",
};

Component({
  data: {
    selected: -1,
    showQuickAdd: false,
    quickAddActions: getQuickAddActions(),
    items: getMainNavigationItems().map((item) => ({
      ...item,
      icon: ICONS[item.id],
    })),
  },

  lifetimes: {
    attached() {
      this.syncSelection();
    },
  },

  pageLifetimes: {
    show() {
      this.syncSelection();
    },
  },

  methods: {
    syncSelection() {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      const selected = currentPage
        ? getSelectedNavigationIndex(currentPage.route)
        : -1;

      if (selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    onTapItem(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.items[index];

      if (!item) {
        return;
      }

      if (item.kind === "action") {
        this.toggleQuickAdd();
        return;
      }

      if (index === this.data.selected) {
        return;
      }

      wx.switchTab({
        url: item.route,
      });
    },

    toggleQuickAdd() {
      this.setData({
        showQuickAdd: getNextQuickAddVisibility(this.data.showQuickAdd),
      });
    },

    onCloseQuickAdd() {
      this.setData({
        showQuickAdd: false,
      });
    },

    onChooseQuickAdd(event) {
      const action = this.data.quickAddActions.find(
        (item) => item.id === event.currentTarget.dataset.actionId,
      );
      this.setData({
        showQuickAdd: false,
      });
      this.runQuickAddAction(action);
    },

    runQuickAddAction(action) {
      if (!action) {
        return;
      }

      const familyId = wx.getStorageSync("currentFamilyId");

      if (!familyId) {
        wx.showToast({
          title: "请先创建或加入家庭",
          icon: "none",
        });
        wx.switchTab({
          url: "/pages/index/index",
        });
        return;
      }

      const url = getQuickAddRoute(action.id, familyId);

      if (url) {
        wx.navigateTo({
          url,
        });
        return;
      }
    },
  },
});
