const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalReadServices,
} = require("../packages/family-health-business");

test("getContext 只返回令牌所有者有效家庭的成员和模板白名单", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId(userId) {
        assert.equal(userId, "user-1");
        return {
          user: {
            _id: "user-1",
            displayName: "小明",
            wechatOpenId: "must-not-leak",
          },
          familyContexts: [{
            family: {
              _id: "family-1",
              name: "测试家庭",
              systemTemplateSettings: [],
              storageUsedBytes: 12345,
            },
            callerMembership: {
              userId: "user-1",
              role: "admin",
              status: "active",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
            activeMemberships: [
              {
                userId: "user-1",
                role: "admin",
                status: "active",
                externalAccessNoticeVersion:
                  "experimental_full_family_health_v1",
              },
              {
                userId: "user-2",
                role: "member",
                status: "active",
                externalAccessNoticeVersion:
                  "experimental_full_family_health_v1",
              },
            ],
            users: [
              {
                _id: "user-1",
                displayName: "小明",
                wechatOpenId: "must-not-leak",
              },
              {
                _id: "user-2",
                displayName: "妈妈",
              },
            ],
            customTemplates: [
              {
                _id: "template-1",
                familyId: "family-1",
                name: "睡眠",
                colorKey: "blue",
                status: "active",
                fields: [
                  {
                    key: "duration",
                    label: "时长",
                    type: "number",
                    unit: "小时",
                    required: true,
                    sortOrder: 10,
                  },
                ],
                revision: 2,
                secretInternalField: "must-not-leak",
              },
            ],
          }],
        };
      },
    },
    listSystemTemplates: () => [
      {
        id: "sys_temperature",
        sourceType: "system",
        name: "体温",
        fields: [
          {
            key: "temperature",
            label: "体温",
            type: "number",
            unit: "℃",
            required: true,
            sortOrder: 10,
          },
        ],
      },
    ],
  });

  const result = await services.context(
    {
      action: "getContext",
      requestId: "request-context",
      data: {},
    },
    {
      userId: "user-1",
      externalTokenId: "token-1",
    },
  );

  assert.deepEqual(result, {
    ok: true,
    requestId: "request-context",
    data: {
      user: {
        id: "user-1",
        displayName: "小明",
      },
      families: [
        {
          id: "family-1",
          name: "测试家庭",
          role: "admin",
          externalAccessReady: true,
          members: [
            {
              id: "user-1",
              displayName: "小明",
              role: "admin",
              isSelf: true,
            },
            {
              id: "user-2",
              displayName: "妈妈",
              role: "member",
              isSelf: false,
            },
          ],
          templates: [
            {
              id: "sys_temperature",
              sourceType: "system",
              name: "体温",
              status: "active",
              sortOrder: 10,
              fields: [
                {
                  key: "temperature",
                  label: "体温",
                  type: "number",
                  unit: "℃",
                  required: true,
                  sortOrder: 10,
                },
              ],
            },
            {
              id: "template-1",
              sourceType: "custom",
              name: "睡眠",
              colorKey: "blue",
              status: "active",
              sortOrder: 100,
              fields: [
                {
                  key: "duration",
                  label: "时长",
                  type: "number",
                  unit: "小时",
                  required: true,
                  sortOrder: 10,
                },
              ],
              revision: 2,
            },
          ],
        },
      ],
    },
  });
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("getContext 无需逐人确认即可返回同家庭成员和模板", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return {
          user: { _id: "user-1", displayName: "小明" },
          familyContexts: [
            {
              family: { _id: "family-1", name: "测试家庭" },
              callerMembership: {
                userId: "user-1",
                role: "admin",
                externalAccessNoticeVersion:
                  "experimental_full_family_health_v1",
              },
              activeMemberships: [
                {
                  userId: "user-1",
                  role: "admin",
                  externalAccessNoticeVersion:
                    "experimental_full_family_health_v1",
                },
                {
                  userId: "user-2",
                  role: "member",
                },
              ],
              users: [
                { _id: "user-1", displayName: "小明" },
                { _id: "user-2", displayName: "尚未确认的成员" },
              ],
              customTemplates: [
                {
                  _id: "template-private",
                  name: "不应公开的模板",
                  fields: [],
                  revision: 1,
                },
              ],
            },
          ],
        };
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.context(
    { action: "getContext", requestId: "request-not-ready", data: {} },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(result.data.families, [
    {
      id: "family-1",
      name: "测试家庭",
      role: "admin",
      externalAccessReady: true,
      members: [
        {
          id: "user-1",
          displayName: "小明",
          role: "admin",
          isSelf: true,
        },
        {
          id: "user-2",
          displayName: "尚未确认的成员",
          role: "member",
          isSelf: false,
        },
      ],
      templates: [
        {
          id: "template-private",
          sourceType: "custom",
          name: "不应公开的模板",
          colorKey: "purple",
          status: "active",
          sortOrder: 100,
          fields: [],
          revision: 1,
        },
      ],
    },
  ]);
  assert.equal(
    JSON.stringify(result).includes("尚未确认的成员"),
    true,
  );
  assert.equal(JSON.stringify(result).includes("不应公开的模板"), true);
});

test("listTemplates 只读取令牌所有者指定家庭的模板", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        throw new Error("本动作不应加载全部家庭");
      },
      async getFamilyContextByUserId(familyId, userId) {
        assert.equal(familyId, "family-1");
        assert.equal(userId, "user-1");
        return {
          family: {
            _id: "family-1",
            name: "测试家庭",
            systemTemplateSettings: [
              {
                templateId: "sys_temperature",
                status: "inactive",
                sortOrder: 30,
              },
            ],
          },
          callerMembership: {
            userId: "user-1",
            role: "admin",
          },
          activeMemberships: [
            {
              userId: "user-1",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
          ],
          users: [{ _id: "user-1", displayName: "小明" }],
          customTemplates: [],
        };
      },
    },
    listSystemTemplates: () => [
      {
        id: "sys_temperature",
        sourceType: "system",
        name: "体温",
        fields: [],
      },
    ],
  });

  const result = await services.templates(
    {
      action: "listTemplates",
      requestId: "request-templates",
      data: { familyId: "family-1" },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(result, {
    ok: true,
    requestId: "request-templates",
    data: {
      familyId: "family-1",
      templates: [
        {
          id: "sys_temperature",
          sourceType: "system",
          name: "体温",
          status: "inactive",
          sortOrder: 30,
          fields: [],
        },
      ],
    },
  });
});

test("listTemplates 只校验令牌所有者仍是家庭成员", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        return {
          family: { _id: "family-1", name: "测试家庭" },
          callerMembership: { userId: "user-1", role: "admin" },
          activeMemberships: [
            {
              userId: "user-1",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
            { userId: "user-2" },
          ],
          users: [],
          customTemplates: [
            {
              _id: "template-private",
              name: "家庭模板",
              fields: [],
              revision: 1,
            },
          ],
        };
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.templates(
    {
      action: "listTemplates",
      requestId: "request-templates-not-ready",
      data: { familyId: "family-1" },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(result, {
    ok: true,
    requestId: "request-templates-not-ready",
    data: {
      familyId: "family-1",
      templates: [
        {
          id: "template-private",
          sourceType: "custom",
          name: "家庭模板",
          colorKey: "purple",
          status: "active",
          sortOrder: 100,
          fields: [],
          revision: 1,
        },
      ],
    },
  });
});

test("listHealthItems 无需逐人确认即可读取本人和同家庭成员记录", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        return {
          family: { _id: "family-1", name: "测试家庭" },
          callerMembership: { userId: "user-1", role: "member" },
          activeMemberships: [
            { userId: "user-1", role: "member" },
            { userId: "user-2", role: "member" },
          ],
          users: [],
          customTemplates: [],
        };
      },
      async listHealthItems(query) {
        return [{
          _id: `record-${query.subjectUserId}`,
          familyId: "family-1",
          subjectUserId: query.subjectUserId,
          sourceTemplateType: "system",
          sourceTemplateId: "sys_temperature",
          templateNameSnapshot: "体温",
          fieldSchemaSnapshot: [],
          values: { temperature: 36.5 },
          occurredAt: new Date("2026-08-19T08:00:00.000Z"),
          recordSource: "manual",
          createdByUserId: "user-1",
          updatedByUserId: "user-1",
          revision: 1,
          createdAt: new Date("2026-08-19T08:00:00.000Z"),
          updatedAt: new Date("2026-08-19T08:00:00.000Z"),
          originRecordId: `record-${query.subjectUserId}`,
        }];
      },
    },
    listSystemTemplates: () => [],
  });

  for (const subjectUserId of ["user-1", "user-2"]) {
    const result = await services.healthItems(
      {
        action: "listHealthItems",
        requestId: `request-${subjectUserId}`,
        data: {
          familyId: "family-1",
          itemType: "record",
          subjectUserId,
        },
      },
      { userId: "user-1", externalTokenId: "token-1" },
    );

    assert.equal(result.ok, true);
    assert.equal(result.data.items[0].subjectUserId, subjectUserId);
  }
});

test("listHealthItems 仍然拒绝令牌所有者未加入的家庭", async () => {
  let readCount = 0;
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        return null;
      },
      async listHealthItems() {
        readCount += 1;
        return [];
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.healthItems(
    {
      action: "listHealthItems",
      requestId: "request-foreign-family",
      data: { familyId: "family-2", itemType: "record" },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(result, {
    ok: false,
    requestId: "request-foreign-family",
    error: {
      code: "FAMILY_ACCESS_DENIED",
      message: "令牌所有者已不是这个家庭的有效成员",
    },
  });
  assert.equal(readCount, 0);
});

test("listHealthItems 按固定筛选分页并只返回记录白名单", async () => {
  const queries = [];
  const records = [1, 2, 3].map((index) => ({
    _id: `record-${index}`,
    familyId: "family-1",
    subjectUserId: "user-2",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: { temperature: 36 + index / 10 },
    remark: `第 ${index} 次`,
    occurredAt: new Date(`2026-08-0${index}T08:00:00.000Z`),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: index,
    createdAt: new Date(`2026-08-0${index}T08:01:00.000Z`),
    updatedAt: new Date(`2026-08-0${index}T08:02:00.000Z`),
    originRecordId: `record-${index}`,
    secretInternalField: "must-not-leak",
  }));
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        return {
          family: { _id: "family-1", name: "测试家庭" },
          callerMembership: { userId: "user-1", role: "admin" },
          activeMemberships: [
            {
              userId: "user-1",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
            {
              userId: "user-2",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
          ],
          users: [],
          customTemplates: [],
        };
      },
      async listHealthItems(query) {
        queries.push(query);
        return records.slice(query.offset, query.offset + query.limit);
      },
    },
    listSystemTemplates: () => [],
  });
  const request = {
    action: "listHealthItems",
    requestId: "request-record-page-1",
    data: {
      familyId: "family-1",
      itemType: "record",
      subjectUserId: "user-2",
      templateType: "system",
      templateId: "sys_temperature",
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-10T00:00:00.000Z",
      limit: 2,
    },
  };

  const firstPage = await services.healthItems(request, {
    userId: "user-1",
    externalTokenId: "token-1",
  });

  assert.equal(firstPage.ok, true);
  assert.equal(firstPage.data.items.length, 2);
  assert.equal(typeof firstPage.data.nextCursor, "string");
  assert.deepEqual(firstPage.data.items[0], {
    itemType: "record",
    id: "record-1",
    familyId: "family-1",
    subjectUserId: "user-2",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: { temperature: 36.1 },
    remark: "第 1 次",
    occurredAt: "2026-08-01T08:00:00.000Z",
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: "2026-08-01T08:01:00.000Z",
    updatedAt: "2026-08-01T08:02:00.000Z",
    originRecordId: "record-1",
  });
  assert.equal(JSON.stringify(firstPage).includes("must-not-leak"), false);

  const secondPage = await services.healthItems(
    {
      ...request,
      requestId: "request-record-page-2",
      data: {
        ...request.data,
        cursor: firstPage.data.nextCursor,
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(
    secondPage.data.items.map((item) => item.id),
    ["record-3"],
  );
  assert.equal(secondPage.data.nextCursor, undefined);
  assert.equal(queries[0].offset, 0);
  assert.equal(queries[0].limit, 3);
  assert.equal(queries[1].offset, 2);
  assert.equal(queries[1].limit, 3);
  assert.equal(queries[0].from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(queries[0].to.toISOString(), "2026-08-10T00:00:00.000Z");
});

test("listHealthItems 返回一次性提醒的状态和关联记录", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        return {
          family: { _id: "family-1", name: "测试家庭" },
          callerMembership: { userId: "user-1", role: "admin" },
          activeMemberships: [
            {
              userId: "user-1",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
          ],
          users: [],
          customTemplates: [],
        };
      },
      async listHealthItems(query) {
        assert.equal(query.itemType, "reminder");
        return [
          {
            _id: "reminder-1",
            familyId: "family-1",
            subjectUserId: "user-1",
            sourceTemplateType: "system",
            sourceTemplateId: "sys_medication",
            templateNameSnapshot: "用药",
            fieldSchemaSnapshot: [],
            values: { medicineName: "测试药物", dosage: "1 片" },
            remark: "饭后",
            plannedAt: new Date("2026-08-20T00:00:00.000Z"),
            notificationTimes: [
              new Date("2026-08-19T23:55:00.000Z"),
            ],
            nextNotificationAt: new Date("2026-08-19T23:55:00.000Z"),
            status: "completed",
            creationSource: "manual",
            completedAt: new Date("2026-08-20T00:05:00.000Z"),
            linkedRecordId: "record-1",
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            revision: 2,
            createdAt: new Date("2026-08-18T00:00:00.000Z"),
            updatedAt: new Date("2026-08-20T00:05:00.000Z"),
            deliveryInternalState: "must-not-leak",
          },
        ];
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.healthItems(
    {
      action: "listHealthItems",
      requestId: "request-reminders",
      data: {
        familyId: "family-1",
        itemType: "reminder",
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(result.data.items, [
    {
      itemType: "reminder",
      id: "reminder-1",
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateType: "system",
      sourceTemplateId: "sys_medication",
      templateNameSnapshot: "用药",
      fieldSchemaSnapshot: [],
      values: { medicineName: "测试药物", dosage: "1 片" },
      remark: "饭后",
      plannedAt: "2026-08-20T00:00:00.000Z",
      notificationTimes: ["2026-08-19T23:55:00.000Z"],
      nextNotificationAt: "2026-08-19T23:55:00.000Z",
      status: "completed",
      creationSource: "manual",
      completedAt: "2026-08-20T00:05:00.000Z",
      linkedRecordId: "record-1",
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      revision: 2,
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-20T00:05:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(result).includes("deliveryInternalState"), false);
});

test("listHealthItems 返回周期规则的重复方式和当前版本", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        return {
          family: { _id: "family-1", name: "测试家庭" },
          callerMembership: { userId: "user-1", role: "member" },
          activeMemberships: [
            {
              userId: "user-1",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
          ],
          users: [],
          customTemplates: [],
        };
      },
      async listHealthItems(query) {
        assert.equal(query.itemType, "recurring_rule");
        return [
          {
            _id: "rule-1",
            familyId: "family-1",
            subjectUserId: "user-1",
            sourceTemplateType: "system",
            sourceTemplateId: "sys_temperature",
            templateNameSnapshot: "体温",
            fieldSchemaSnapshot: [],
            values: {},
            remark: "每天测量",
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            repeat: { type: "weekly", weekdays: [1, 3, 5] },
            dailyTimes: ["08:00", "20:00"],
            status: "paused",
            pausedAt: new Date("2026-08-18T00:00:00.000Z"),
            pausedByUserId: "user-1",
            pauseReason: "manual",
            createdByUserId: "user-1",
            updatedByUserId: "user-1",
            revision: 4,
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
            updatedAt: new Date("2026-08-18T00:00:00.000Z"),
            schedulerInternalState: "must-not-leak",
          },
        ];
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.healthItems(
    {
      action: "listHealthItems",
      requestId: "request-rules",
      data: {
        familyId: "family-1",
        itemType: "recurring_rule",
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.deepEqual(result.data.items, [
    {
      itemType: "recurring_rule",
      id: "rule-1",
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateType: "system",
      sourceTemplateId: "sys_temperature",
      templateNameSnapshot: "体温",
      fieldSchemaSnapshot: [],
      values: {},
      remark: "每天测量",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      repeat: { type: "weekly", weekdays: [1, 3, 5] },
      dailyTimes: ["08:00", "20:00"],
      status: "paused",
      pausedAt: "2026-08-18T00:00:00.000Z",
      pausedByUserId: "user-1",
      pauseReason: "manual",
      createdByUserId: "user-1",
      updatedByUserId: "user-1",
      revision: 4,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(result).includes("schedulerInternalState"), false);
});

test("getHealthItem 按家庭和类型读取一条未删除事项", async () => {
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId(familyId, userId) {
        assert.equal(familyId, "family-1");
        assert.equal(userId, "user-1");
        return {
          family: { _id: "family-1", name: "测试家庭" },
          callerMembership: { userId: "user-1", role: "member" },
          activeMemberships: [
            {
              userId: "user-1",
              externalAccessNoticeVersion:
                "experimental_full_family_health_v1",
            },
          ],
          users: [],
          customTemplates: [],
        };
      },
      async getHealthItem(query) {
        assert.deepEqual(query, {
          familyId: "family-1",
          itemType: "record",
          itemId: "record-1",
        });
        return {
          _id: "record-1",
          familyId: "family-1",
          subjectUserId: "user-1",
          sourceTemplateType: "system",
          sourceTemplateId: "sys_temperature",
          templateNameSnapshot: "体温",
          fieldSchemaSnapshot: [],
          values: { temperature: 36.5 },
          occurredAt: new Date("2026-08-19T01:00:00.000Z"),
          recordSource: "manual",
          createdByUserId: "user-1",
          updatedByUserId: "user-1",
          revision: 3,
          createdAt: new Date("2026-08-19T01:00:00.000Z"),
          updatedAt: new Date("2026-08-19T02:00:00.000Z"),
          originRecordId: "record-1",
        };
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.healthItems(
    {
      action: "getHealthItem",
      requestId: "request-get-record",
      data: {
        familyId: "family-1",
        itemType: "record",
        itemId: "record-1",
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.item.id, "record-1");
  assert.equal(result.data.item.revision, 3);
  assert.deepEqual(result.data.item.values, { temperature: 36.5 });
});

test("listHealthItems 拒绝 includeDeleted 等白名单外查询字段", async () => {
  let readCount = 0;
  const services = createExternalReadServices({
    readStore: {
      async listFamilyContextsByUserId() {
        return { user: null, familyContexts: [] };
      },
      async getFamilyContextByUserId() {
        readCount += 1;
        return null;
      },
      async listHealthItems() {
        readCount += 1;
        return [];
      },
    },
    listSystemTemplates: () => [],
  });

  const result = await services.healthItems(
    {
      action: "listHealthItems",
      requestId: "request-invalid-filter",
      data: {
        familyId: "family-1",
        itemType: "record",
        includeDeleted: true,
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_REQUEST");
  assert.equal(readCount, 0);
});
