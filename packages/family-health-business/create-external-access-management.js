const {
  EXTERNAL_ACCESS_PERMISSION_PRESET,
} = require("./external-access-policy");
const {
  renderExternalAccessSkillDraft,
} = require("./render-external-access-skill-draft");

class ManagementError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function toTokenSummary(token) {
  return {
    id: token._id,
    name: token.name,
    status: token.revokedAt ? "revoked" : "active",
    permissionPreset: token.permissionPreset,
    secretHint: token.secretHint,
    lastUsedAt: toIso(token.lastUsedAt),
    createdAt: toIso(token.createdAt),
    revokedAt: toIso(token.revokedAt),
    revision: token.revision,
  };
}

function toAccessSummary(event) {
  return {
    id: event._id,
    requestId: event.requestId,
    action: event.action,
    familyId: event.familyId ?? null,
    familyName: event.familyNameSnapshot ?? null,
    resourceType: event.resourceType ?? null,
    resourceId: event.resourceId ?? null,
    resourceName: event.resourceNameSnapshot ?? null,
    ok: event.ok === true,
    resultCode: event.resultCode,
    durationMs: event.durationMs,
    accessedAt: toIso(event.accessedAt),
  };
}

function createExternalAccessManagement({
  getCallerIdentity,
  tokenStore,
  tokenSecurity,
  createId,
  now,
  externalBaseUrl,
  renderTokenSkill = renderExternalAccessSkillDraft,
  reportError = () => {},
} = {}) {
  function requireTokenSecurity() {
    if (!tokenSecurity) {
      throw new ManagementError(
        "SERVICE_NOT_READY",
        "外部访问安全配置尚未完成",
      );
    }

    return tokenSecurity;
  }

  async function getCaller() {
    const identity = await getCallerIdentity();
    const user = identity?.openId
      ? await tokenStore.getUserByOpenId(identity.openId)
      : null;

    if (!user) {
      throw new ManagementError(
        "UNAUTHENTICATED",
        "无法确认微信身份，请重新进入小程序",
      );
    }

    return user;
  }

  async function getOwnedToken(tokenId, ownerUserId) {
    const token = tokenId
      ? await tokenStore.getTokenById(tokenId)
      : null;

    if (!token || token.ownerUserId !== ownerUserId) {
      throw new ManagementError(
        "TOKEN_NOT_FOUND",
        "令牌不存在或已不可用",
      );
    }

    return token;
  }

  const actions = {
    async createToken(data, request) {
      const name = data.name?.trim();

      if (!name || name.length > 40) {
        throw new ManagementError(
          "INVALID_ARGUMENT",
          "令牌名称应为 1 至 40 个字",
        );
      }

      if (data.riskAcknowledged !== true) {
        throw new ManagementError(
          "RISK_ACKNOWLEDGEMENT_REQUIRED",
          "请先确认你已了解永久令牌的权限和风险",
        );
      }

      const user = await getCaller();
      const existing =
        await tokenStore.getTokenByCreationRequest(
          user._id,
          request.requestId,
        );

      if (existing) {
        if (existing.name !== name) {
          throw new ManagementError(
            "REQUEST_CONFLICT",
            "同一请求编号不能用于不同的令牌内容",
          );
        }

        return {
          token: {
            ...toTokenSummary(existing),
            credential:
              requireTokenSecurity().revealCredential(existing),
          },
        };
      }

      const timestamp = now();
      const tokenId = createId({
        ownerUserId: user._id,
        requestId: request.requestId,
      });
      const security = requireTokenSecurity();
      const credential = security.createCredential({
        tokenId,
        ownerUserId: user._id,
      });
      const token = {
        _id: tokenId,
        ownerUserId: user._id,
        name,
        permissionPreset: EXTERNAL_ACCESS_PERMISSION_PRESET,
        secretHash: credential.secretHash,
        encryptedSecret: credential.encryptedSecret,
        encryptionNonce: credential.encryptionNonce,
        encryptionAuthTag: credential.encryptionAuthTag,
        encryptionKeyVersion: credential.encryptionKeyVersion,
        secretHint: credential.secretHint,
        lastUsedAt: null,
        revokedAt: null,
        revision: 1,
        creationRequestId: request.requestId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const persistedToken = await tokenStore.createToken(token);

      if (
        persistedToken.ownerUserId !== user._id ||
        persistedToken.creationRequestId !== request.requestId ||
        persistedToken.name !== name
      ) {
        throw new ManagementError(
          "REQUEST_CONFLICT",
          "同一请求编号不能用于不同的令牌内容",
        );
      }

      return {
        token: {
          ...toTokenSummary(persistedToken),
          credential: security.revealCredential(persistedToken),
        },
      };
    },

    async listTokens() {
      const user = await getCaller();
      const tokens = await tokenStore.listTokensByOwner(user._id);

      return {
        tokens: tokens.map(toTokenSummary),
      };
    },

    async copyToken(data) {
      const user = await getCaller();
      const token = await getOwnedToken(data.tokenId, user._id);

      if (token.revokedAt) {
        throw new ManagementError(
          "TOKEN_REVOKED",
          "这个令牌已经永久撤销",
        );
      }

      return {
        credential: requireTokenSecurity().revealCredential(token),
      };
    },

    async renderTokenSkill(data) {
      const user = await getCaller();
      const token = await getOwnedToken(data.tokenId, user._id);

      if (token.revokedAt) {
        throw new ManagementError(
          "TOKEN_REVOKED",
          "这个令牌已经永久撤销",
        );
      }

      if (
        typeof externalBaseUrl !== "string" ||
        !externalBaseUrl
      ) {
        throw new ManagementError(
          "SERVICE_NOT_READY",
          "外部访问地址尚未配置",
        );
      }

      return {
        skill: renderTokenSkill({
          baseUrl: externalBaseUrl,
          token: requireTokenSecurity().revealCredential(token),
        }),
      };
    },

    async revokeToken(data) {
      if (
        !data.tokenId ||
        !Number.isInteger(data.expectedRevision) ||
        data.expectedRevision < 1
      ) {
        throw new ManagementError(
          "INVALID_ARGUMENT",
          "请刷新令牌信息后再撤销",
        );
      }

      const user = await getCaller();
      const result = await tokenStore.revokeToken({
        tokenId: data.tokenId,
        ownerUserId: user._id,
        expectedRevision: data.expectedRevision,
        timestamp: now(),
      });

      if (result.outcome === "revision-conflict") {
        throw new ManagementError(
          "REVISION_CONFLICT",
          "令牌状态已经变化，请刷新后重试",
        );
      }

      if (result.outcome !== "revoked") {
        throw new ManagementError(
          "TOKEN_NOT_FOUND",
          "令牌不存在或已不可用",
        );
      }

      return {
        token: toTokenSummary(result.token),
      };
    },

    async getRecentAccesses(data) {
      const user = await getCaller();
      const accesses = await tokenStore.listRecentAccesses({
        tokenId: data.tokenId,
        ownerUserId: user._id,
        limit: 20,
      });

      if (!accesses) {
        throw new ManagementError(
          "TOKEN_NOT_FOUND",
          "令牌不存在或已不可用",
        );
      }

      return {
        accesses: accesses.map(toAccessSummary),
      };
    },
  };

  return {
    async handle(request = {}) {
      const action = actions[request.action];

      if (!action) {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "UNSUPPORTED_ACTION",
            message: "暂不支持这个操作",
          },
        };
      }

      try {
        return {
          ok: true,
          requestId: request.requestId,
          data: await action(request.data ?? {}, request),
        };
      } catch (error) {
        if (error instanceof ManagementError) {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: error.code,
              message: error.message,
            },
          };
        }

        reportError(error);
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "INTERNAL_ERROR",
            message: "服务暂时不可用，请稍后重试",
          },
        };
      }
    },
  };
}

module.exports = {
  createExternalAccessManagement,
};
