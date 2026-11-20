/*! @snap/web-lens-api v0.2.0 | Copyright © 2026 Snap Inc. | MIT License */

// src/errors.ts
var errors = Object.freeze({
  MALFORMED_REQUEST: "ERR_MALFORMED_REQUEST",
  UNKNOWN_CAPABILITY: "ERR_UNKNOWN_CAPABILITY",
  INVALID_PARAMS: "ERR_INVALID_PARAMS",
  INTERNAL: "ERR_INTERNAL",
  QUOTA_EXCEEDED: "ERR_QUOTA_EXCEEDED",
  STORAGE_UNAVAILABLE: "ERR_STORAGE_UNAVAILABLE",
  UNSUPPORTED_HOST: "ERR_UNSUPPORTED_HOST",
  NOT_INITIALIZED: "ERR_NOT_INITIALIZED"
});
function bridgeError(code) {
  return new Error(code);
}
function normalizeRejection(reason) {
  const message = reason && typeof reason.message === "string" ? reason.message : typeof reason === "string" ? reason : "";
  return bridgeError(message.indexOf("ERR_") === 0 ? message : errors.INTERNAL);
}

// src/push.ts
function createPushHub(global) {
  const listeners = /* @__PURE__ */ new Map();
  const key = (capability, event) => `${capability}/${event}`;
  if (global.addEventListener) {
    global.addEventListener("snapWebLensPush", (event) => {
      const data = event && event.data;
      if (!data || !data.capability || !data.event) return;
      const list = listeners.get(key(data.capability, data.event));
      if (!list || !list.length) return;
      let payload;
      try {
        payload = JSON.parse(data.json);
      } catch {
        return;
      }
      for (const listener of list.slice()) {
        try {
          listener(payload);
        } catch (e) {
          if (typeof console !== "undefined" && typeof console.error === "function") {
            console.error("[snapchat] push listener threw", e);
          }
        }
      }
    });
  }
  return {
    add(capability, event, callback) {
      if (typeof callback !== "function") throw new TypeError("snapchat: listener must be a function");
      const k = key(capability, event);
      const list = listeners.get(k) || [];
      list.push(callback);
      listeners.set(k, list);
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const current = listeners.get(k);
        const index = current ? current.indexOf(callback) : -1;
        if (current && index !== -1) current.splice(index, 1);
        if (current && !current.length) listeners.delete(k);
      };
    },
    simulate(capability, event, payload) {
      if (!global.dispatchEvent) return;
      global.dispatchEvent(
        new MessageEvent("snapWebLensPush", { data: { capability, event, json: JSON.stringify(payload) } })
      );
    }
  };
}

// src/stub.ts
var STUB_VARIANTS = ["10226807", "20061402", "31151407", "30060626"];
var STUB_FRIENDS = ["stub-friend-1", "stub-friend-2", "stub-friend-3"];
var STUB_MAX_BATCH_COUNT = 20;
var PNG_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
var GLB_URL = "data:model/gltf-binary;base64,Z2xURgIAAABgAAAATAAAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2NlbmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3t9XX0g";
var IMPACT_STYLES = ["light", "medium", "heavy", "soft"];
var HAPTICS_LIMITS = { maxEvents: 16, maxPatternMs: 1e3, maxBuzzMs: 500 };
var STORAGE_LIMITS = { byteLimit: 100 * 1024, keyLimit: 256, valueLimit: 32 * 1024, keyLengthLimit: 256 };
var ok = (value) => Promise.resolve(value);
var fail = (code) => Promise.reject(bridgeError(code));
var isNonEmptyString = (v) => typeof v === "string" && v.length > 0;
var isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function utf8Length(s) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, "x").length;
}
var jsonBytes = (v) => utf8Length(JSON.stringify(v));
var isValidKey = (k) => isNonEmptyString(k) && utf8Length(k) <= STORAGE_LIMITS.keyLengthLimit;
function hasExactly(params, keys) {
  const own = Object.keys(params);
  return own.length === keys.length && keys.every((k) => hasOwn(params, k));
}
var isIntensity = (v) => v === void 0 || typeof v === "number" && v >= 0 && v <= 1;
var hasOnly = (o, keys) => Object.keys(o).every((k) => keys.indexOf(k) !== -1);
function patternLength(events) {
  if (!Array.isArray(events) || events.length < 1 || events.length > HAPTICS_LIMITS.maxEvents) return null;
  let lastT = -1;
  let end = 0;
  for (const e of events) {
    if (!isObject(e) || !Number.isInteger(e.t) || e.t < 0 || !isIntensity(e.intensity)) return null;
    const t = e.t;
    let duration = 0;
    if (e.type === "tap") {
      if (!hasOnly(e, ["t", "type", "intensity"])) return null;
    } else if (e.type === "buzz") {
      const d = e.duration;
      if (!hasOnly(e, ["t", "type", "intensity", "duration"]) || !Number.isInteger(d) || d < 1 || d > HAPTICS_LIMITS.maxBuzzMs) return null;
      duration = d;
    } else {
      return null;
    }
    if (t <= lastT || t < end) return null;
    lastT = t;
    end = t + duration;
  }
  return end <= HAPTICS_LIMITS.maxPatternMs ? end : null;
}
function createStub(simulatePush) {
  let lensPlus = false;
  let store = /* @__PURE__ */ new Map();
  let storeBytes = 0;
  const leaderboards = (action, p) => {
    if (action === "submitScore") {
      const orderingOk = p.ordering === void 0 || p.ordering === "ascending" || p.ordering === "descending";
      if (!isNonEmptyString(p.leaderboardId) || !Number.isInteger(p.score) || !orderingOk) return fail(errors.INVALID_PARAMS);
      return ok({ ok: true, submittedScore: p.score, newScore: p.score });
    }
    if (action === "present") return ok({ ok: true, presented: true });
    return fail(errors.INVALID_PARAMS);
  };
  const subscription = (action) => {
    if (action === "getStatus") return ok({ eligible: lensPlus });
    if (action === "requestUpgrade") {
      if (lensPlus) return ok({ subscribed: true });
      if (typeof console !== "undefined") console.info("[snapchat stub] presenting fake upsell card (subscribes in 500ms)");
      return new Promise((resolve) => {
        setTimeout(() => {
          const flipped = !lensPlus;
          lensPlus = true;
          resolve({ subscribed: true });
          if (flipped) simulatePush("subscription", "statusChanged", { eligible: true });
        }, 500);
      });
    }
    return fail(errors.INVALID_PARAMS);
  };
  const bitmoji = (action, p) => {
    if (action === "getFriendAvatars") {
      const count = p.count;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return fail(errors.INVALID_PARAMS);
      return ok({ avatars: STUB_FRIENDS.slice(0, Math.min(count, STUB_MAX_BATCH_COUNT)).map((avatar2) => ({ avatar: avatar2 })) });
    }
    if (action === "getVariants") return ok({ variants: STUB_VARIANTS.slice() });
    if (hasOwn(p, "participant")) return fail(errors.INVALID_PARAMS);
    const avatar = p.avatar;
    if (avatar !== void 0 && avatar !== null && STUB_FRIENDS.indexOf(avatar) === -1) return fail(errors.INVALID_PARAMS);
    if (action === "getAvatarInfo") return ok({ hasAvatar: true, maxBatchCount: STUB_MAX_BATCH_COUNT });
    if (action === "get2DAvatar") {
      if (p.variant !== void 0 && STUB_VARIANTS.indexOf(p.variant) === -1) return fail(errors.INVALID_PARAMS);
      if (p.size !== void 0 && ["small", "normal", "large"].indexOf(p.size) === -1) return fail(errors.INVALID_PARAMS);
      return ok({ url: PNG_URL });
    }
    if (action === "get3DAvatar") {
      const levels = ["low", "medium", "high"];
      for (const key of ["meshQuality", "textureQuality"]) {
        const level = p[key];
        if (level !== void 0 && level !== null && levels.indexOf(level) === -1) return fail(errors.INVALID_PARAMS);
      }
      return ok({ url: GLB_URL });
    }
    return fail(errors.INVALID_PARAMS);
  };
  const storage = (action, p) => {
    const key = p.key;
    switch (action) {
      case "get":
        if (!hasExactly(p, ["key"]) || !isValidKey(key)) return fail(errors.INVALID_PARAMS);
        return ok(store.has(key) ? { found: true, value: JSON.parse(store.get(key)) } : { found: false });
      case "set": {
        if (!hasExactly(p, ["key", "value"]) || !isValidKey(key) || p.value === void 0) return fail(errors.INVALID_PARAMS);
        let encoded;
        try {
          encoded = JSON.stringify(p.value);
        } catch {
          return fail(errors.INVALID_PARAMS);
        }
        if (encoded === void 0 || utf8Length(encoded) > STORAGE_LIMITS.valueLimit) return fail(errors.INVALID_PARAMS);
        const previous = store.has(key) ? jsonBytes(key) + utf8Length(store.get(key)) : 0;
        const next = storeBytes - previous + jsonBytes(key) + utf8Length(encoded);
        const keyCount = store.size + (previous ? 0 : 1);
        if (next > STORAGE_LIMITS.byteLimit || keyCount > STORAGE_LIMITS.keyLimit) return fail(errors.QUOTA_EXCEEDED);
        store.set(key, encoded);
        storeBytes = next;
        return ok({});
      }
      case "remove":
        if (!hasExactly(p, ["key"]) || !isValidKey(key)) return fail(errors.INVALID_PARAMS);
        if (store.has(key)) {
          storeBytes -= jsonBytes(key) + utf8Length(store.get(key));
          store.delete(key);
        }
        return ok({});
      case "clear":
        if (!hasExactly(p, [])) return fail(errors.INVALID_PARAMS);
        store = /* @__PURE__ */ new Map();
        storeBytes = 0;
        return ok({});
      case "keys":
        if (!hasExactly(p, [])) return fail(errors.INVALID_PARAMS);
        return ok({ keys: Array.from(store.keys()).sort() });
      case "getInfo":
        if (!hasExactly(p, [])) return fail(errors.INVALID_PARAMS);
        return ok({
          bytesUsed: storeBytes,
          byteLimit: STORAGE_LIMITS.byteLimit,
          keyCount: store.size,
          keyLimit: STORAGE_LIMITS.keyLimit,
          valueLimit: STORAGE_LIMITS.valueLimit,
          persistenceMode: "inMemory"
        });
      default:
        return fail(errors.INVALID_PARAMS);
    }
  };
  const haptics = (action, p) => {
    let length = null;
    if (action === "impact") {
      if (hasOnly(p, ["style"]) && (p.style === void 0 || IMPACT_STYLES.indexOf(p.style) !== -1)) length = 0;
    } else if (action === "pattern") {
      if (hasExactly(p, ["events"])) length = patternLength(p.events);
    }
    if (length === null) return fail(errors.INVALID_PARAMS);
    return ok({});
  };
  const capabilities = {
    sdk: (action) => {
      if (action !== "getCapabilities") return fail(errors.INVALID_PARAMS);
      return ok({ capabilities: { leaderboards: 1, subscription: 1, bitmoji: 2, games_storage: 1, haptics: 1 } });
    },
    leaderboards,
    subscription,
    bitmoji,
    games_storage: storage,
    haptics
  };
  return (message) => {
    const [capability, action] = message.uri.replace("app://", "").split("/");
    const handler = hasOwn(capabilities, capability) ? capabilities[capability] : void 0;
    const params = isObject(message.params) ? message.params : {};
    const result = handler ? handler(action, params) : fail(errors.UNKNOWN_CAPABILITY);
    if (typeof console !== "undefined") {
      result.then(
        (v) => console.info("[snapchat stub]", message.uri, params, "->", v),
        (e) => console.info("[snapchat stub]", message.uri, params, "->", e.message)
      );
    }
    return result;
  };
}

// src/transport.ts
function getGlobal() {
  return typeof window !== "undefined" ? window : globalThis;
}
function iosTransport(bridge) {
  return (message) => {
    let reply;
    try {
      reply = bridge.postMessage(message);
    } catch {
      return Promise.reject(bridgeError(errors.INTERNAL));
    }
    return Promise.resolve(reply).catch((reason) => {
      throw normalizeRejection(reason);
    });
  };
}
function androidTransport(bridge) {
  const pending = /* @__PURE__ */ new Map();
  let seq = 0;
  const prefix = `${Math.random().toString(36).slice(2, 8)}-`;
  bridge.addEventListener("message", (event) => {
    let reply;
    try {
      reply = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!reply || reply.requestId == null) return;
    const entry = pending.get(String(reply.requestId));
    if (!entry) return;
    pending.delete(String(reply.requestId));
    if (reply.ok) entry.resolve(reply.payload);
    else entry.reject(bridgeError(typeof reply.error === "string" ? reply.error : errors.INTERNAL));
  });
  return (message) => new Promise((resolve, reject) => {
    const id = prefix + ++seq;
    let serialized;
    try {
      serialized = JSON.stringify({ requestId: id, uri: message.uri, params: message.params });
    } catch {
      reject(bridgeError(errors.INTERNAL));
      return;
    }
    pending.set(id, { resolve, reject });
    try {
      bridge.postMessage(serialized);
    } catch {
      pending.delete(id);
      reject(bridgeError(errors.INTERNAL));
    }
  });
}
var noBridgeTransport = () => Promise.reject(bridgeError(errors.UNSUPPORTED_HOST));
var ANDROID_LENS_HOST = /(?:^|\.)web-lens\.snap\.local$/;
function isLensHostContext(loc) {
  if (!loc) return false;
  if (typeof loc.protocol === "string" && loc.protocol.toLowerCase() === "weblens:") return true;
  return ANDROID_LENS_HOST.test((typeof loc.hostname === "string" ? loc.hostname : "").toLowerCase());
}
function selectTransport(global, makeStub) {
  const ios = global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.snapWebLensBridge;
  if (ios) return { transport: iosTransport(ios), isStub: false };
  const android = global.snapWebLensBridge;
  if (android && typeof android.postMessage === "function") return { transport: androidTransport(android), isStub: false };
  if (isLensHostContext(global.location)) return { transport: noBridgeTransport, isStub: false };
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn("[snapchat] No native bridge. Using the DESKTOP STUB: every value is a canned fixture.");
  }
  return { transport: makeStub(), isStub: true };
}

// src/index.ts
var VERSION = "0.2.0";
var WIRE_STORAGE = "games_storage";
var API_NAMES = /* @__PURE__ */ new Map([[WIRE_STORAGE, "storage"]]);
function toSubmitScoreResult(reply) {
  const best = reply?.newScore;
  return typeof best === "number" ? { bestScore: best } : {};
}
function toUpgradeOutcome(reply) {
  const outcome = { subscribed: reply?.subscribed === true };
  if (typeof reply?.reason === "string") outcome.reason = reply.reason;
  return outcome;
}
function toStorageInfo(reply) {
  const info = reply ?? {};
  return {
    usedBytes: info.bytesUsed,
    maxBytes: info.byteLimit,
    keyCount: info.keyCount,
    maxKeys: info.keyLimit,
    maxValueBytes: info.valueLimit,
    persistenceMode: info.persistenceMode === "inMemory" ? "memory" : info.persistenceMode
  };
}
var PLACEHOLDER_BOARD_ID = "main";
var nothing = () => void 0;
var AVATAR_TARGET = ["avatar", "participant"];
function get2DAvatarWireParams(params) {
  const { size, ...rest } = pickParams(params, [...AVATAR_TARGET, "variant", "size"]);
  if (size === "normal") return null;
  return size === void 0 ? rest : { ...rest, size: size === "medium" ? "normal" : size };
}
function toFriendAvatars(reply) {
  const list = reply && typeof reply === "object" ? reply.avatars : void 0;
  const avatars = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (typeof entry === "string") avatars.push({ avatar: entry });
    else if (entry && typeof entry === "object" && typeof entry.avatar === "string") avatars.push({ ...entry });
  }
  return { avatars };
}
function isValidTarget(params) {
  if (params === void 0 || params === null) return true;
  if (typeof params !== "object" || Array.isArray(params)) return false;
  const avatar = params.avatar;
  return avatar === void 0 || avatar === null || typeof avatar === "string";
}
function pickParams(params, keys) {
  if (params === null || typeof params !== "object" || Array.isArray(params)) return {};
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(params, key)) out[key] = params[key];
  }
  return out;
}
function createApi(global) {
  const push = createPushHub(global);
  const { transport, isStub } = selectTransport(global, () => createStub(push.simulate));
  let caps = null;
  let subscriptionObservingPrimed = false;
  function init() {
    return call("sdk", "getCapabilities").then((reply) => {
      const discovered = reply && typeof reply === "object" ? reply.capabilities : void 0;
      const next = {};
      if (discovered && typeof discovered === "object") {
        for (const name of Object.keys(discovered)) {
          const version = discovered[name];
          if (typeof version === "number") next[API_NAMES.get(name) ?? name] = version;
        }
      }
      caps = next;
      return caps;
    }).catch((e) => {
      const code = e && typeof e.message === "string" ? e.message : "";
      if (code === errors.UNSUPPORTED_HOST || code === errors.UNKNOWN_CAPABILITY) {
        caps = {};
        return caps;
      }
      throw e;
    });
  }
  function notInitialized(call2) {
    if (caps) return null;
    if (typeof console !== "undefined") console.warn(`[snapchat] ${call2} before init(): await snapchat.init() first`);
    return Promise.reject(bridgeError(errors.NOT_INITIALIZED));
  }
  function invalidTarget(action) {
    if (typeof console !== "undefined") console.warn(`[snapchat] bitmoji.${action}(): pass a friend entry from getFriendAvatars(), not its handle`);
    return Promise.reject(bridgeError(errors.INVALID_PARAMS));
  }
  function avatarCall(action, params) {
    if (params.avatar === void 0 || params.avatar === null) return call("bitmoji", action, params);
    const early = notInitialized(`bitmoji.${action}({ avatar })`);
    if (early) return early;
    if ((caps?.bitmoji ?? 0) < 2) return Promise.reject(bridgeError(errors.INVALID_PARAMS));
    return call("bitmoji", action, params);
  }
  function call(capability, action, params) {
    const p = params !== null && typeof params === "object" && !Array.isArray(params) ? params : {};
    return transport({ uri: `app://${capability}/${action}`, params: p });
  }
  const api = {
    version: VERSION,
    errors,
    get isStub() {
      return isStub;
    },
    init,
    isSupported(capability, minVersion) {
      if (!caps || !Object.prototype.hasOwnProperty.call(caps, capability)) return false;
      const required = typeof minVersion === "number" && minVersion >= 1 ? minVersion : 1;
      return caps[capability] >= required;
    },
    leaderboards: {
      submitScore: (params) => call("leaderboards", "submitScore", {
        ...params,
        leaderboardId: params?.leaderboardId || PLACEHOLDER_BOARD_ID
      }).then(toSubmitScoreResult),
      // The hosts call this action `present`.
      show: () => call("leaderboards", "present", {}).then(nothing)
    },
    subscription: {
      getStatus: () => call("subscription", "getStatus", {}),
      requestUpgrade: () => call("subscription", "requestUpgrade", {}).then(toUpgradeOutcome),
      onStatusChanged(callback) {
        const unsubscribe = push.add("subscription", "statusChanged", callback);
        if (!subscriptionObservingPrimed && !isStub) {
          subscriptionObservingPrimed = true;
          call("subscription", "getStatus", {}).catch(() => {
            subscriptionObservingPrimed = false;
          });
        }
        return unsubscribe;
      }
    },
    bitmoji: {
      getAvatarInfo: (params) => isValidTarget(params) ? avatarCall("getAvatarInfo", pickParams(params, AVATAR_TARGET)) : invalidTarget("getAvatarInfo"),
      get2DAvatar: (params) => {
        if (!isValidTarget(params)) return invalidTarget("get2DAvatar");
        const wire = get2DAvatarWireParams(params);
        return wire ? avatarCall("get2DAvatar", wire) : Promise.reject(bridgeError(errors.INVALID_PARAMS));
      },
      get3DAvatar: (params) => isValidTarget(params) ? avatarCall("get3DAvatar", pickParams(params, [...AVATAR_TARGET, "meshQuality", "textureQuality"])) : invalidTarget("get3DAvatar"),
      getVariants: () => call("bitmoji", "getVariants", {}),
      // iOS reads only `count` here and ignores anything else, `participant` included.
      getFriendAvatars: (params) => notInitialized("bitmoji.getFriendAvatars()") ?? call("bitmoji", "getFriendAvatars", pickParams(params, ["count"])).then(toFriendAvatars)
    },
    storage: {
      get: (key) => call(WIRE_STORAGE, "get", { key }),
      set: (key, value) => call(WIRE_STORAGE, "set", { key, value }).then(nothing),
      remove: (key) => call(WIRE_STORAGE, "remove", { key }).then(nothing),
      clear: () => call(WIRE_STORAGE, "clear", {}).then(nothing),
      keys: () => call(WIRE_STORAGE, "keys", {}),
      getInfo: () => call(WIRE_STORAGE, "getInfo", {}).then(toStorageInfo)
    },
    haptics: {
      impact: (style) => call("haptics", "impact", style === void 0 ? {} : { style }).then(nothing),
      pattern: (events) => call("haptics", "pattern", { events }).then(nothing)
    }
  };
  Object.defineProperty(api, "__isSnapchatWebLensAPI", { value: true });
  return api;
}
function installed(global) {
  const candidate = global.snapchat;
  return candidate && candidate.__isSnapchatWebLensAPI === true ? candidate : void 0;
}
var host = getGlobal();
var existing = installed(host);
var snapchat = existing || createApi(host);
if (!existing) {
  host.snapchat = snapchat;
  if (!host.SnapSDK) host.SnapSDK = snapchat;
}
var index_default = snapchat;
export {
  index_default as default,
  errors,
  snapchat
};
