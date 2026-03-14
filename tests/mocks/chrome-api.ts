/**
 * Comprehensive mock for chrome.* APIs used by the extension.
 *
 * Provides in-memory implementations of:
 *   - chrome.storage.local  (get / set / remove)
 *   - chrome.runtime        (sendMessage / onMessage)
 *   - chrome.alarms         (create / onAlarm)
 *
 * All methods support both callback and Promise-based calling conventions.
 */

// ── Internal state ──────────────────────────────────────────────────────

let _store: Record<string, unknown> = {};
let _sentMessages: Array<{ message: unknown; response?: unknown }> = [];
let _alarms: Record<string, chrome.alarms.AlarmCreateInfo> = {};
let _messageListeners: Array<
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => void
> = [];
let _alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];

// ── Helpers exposed to tests ────────────────────────────────────────────

/** Reset every piece of mock state. Call in `beforeEach`. */
export function resetMockStorage(): void {
  _store = {};
  _sentMessages = [];
  _alarms = {};
  _messageListeners = [];
  _alarmListeners = [];
}

/** Read the raw in-memory store (useful for assertions). */
export function getStore(): Record<string, unknown> {
  return _store;
}

/** Get captured messages sent via chrome.runtime.sendMessage. */
export function getSentMessages(): Array<{ message: unknown; response?: unknown }> {
  return _sentMessages;
}

/** Get registered alarms. */
export function getAlarms(): Record<string, chrome.alarms.AlarmCreateInfo> {
  return _alarms;
}

/** Manually fire an alarm (simulates chrome triggering it). */
export function fireAlarm(name: string): void {
  const alarm: chrome.alarms.Alarm = {
    name,
    scheduledTime: Date.now(),
  };
  for (const listener of _alarmListeners) {
    listener(alarm);
  }
}

// ── chrome.storage.local ────────────────────────────────────────────────

function storageGet(
  keys?: string | string[] | Record<string, unknown> | null,
): Promise<Record<string, unknown>>;
function storageGet(
  keys: string | string[] | Record<string, unknown> | null | undefined,
  callback: (items: Record<string, unknown>) => void,
): void;
function storageGet(
  keys?: string | string[] | Record<string, unknown> | null,
  callback?: (items: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> | void {
  const result: Record<string, unknown> = {};

  if (keys === null || keys === undefined) {
    // Return everything
    Object.assign(result, _store);
  } else if (typeof keys === 'string') {
    if (keys in _store) result[keys] = _store[keys];
  } else if (Array.isArray(keys)) {
    for (const k of keys) {
      if (k in _store) result[k] = _store[k];
    }
  } else {
    // Object with defaults
    for (const [k, defaultVal] of Object.entries(keys)) {
      result[k] = k in _store ? _store[k] : defaultVal;
    }
  }

  if (callback) {
    callback(result);
    return undefined as unknown as void;
  }
  return Promise.resolve(result);
}

function storageSet(items: Record<string, unknown>): Promise<void>;
function storageSet(items: Record<string, unknown>, callback: () => void): void;
function storageSet(
  items: Record<string, unknown>,
  callback?: () => void,
): Promise<void> | void {
  Object.assign(_store, items);
  if (callback) {
    callback();
    return undefined as unknown as void;
  }
  return Promise.resolve();
}

function storageRemove(keys: string | string[]): Promise<void>;
function storageRemove(keys: string | string[], callback: () => void): void;
function storageRemove(
  keys: string | string[],
  callback?: () => void,
): Promise<void> | void {
  const toDelete = Array.isArray(keys) ? keys : [keys];
  for (const k of toDelete) {
    delete _store[k];
  }
  if (callback) {
    callback();
    return undefined as unknown as void;
  }
  return Promise.resolve();
}

// ── chrome.runtime ──────────────────────────────────────────────────────

function sendMessage(message: unknown): Promise<unknown>;
function sendMessage(message: unknown, callback: (response: unknown) => void): void;
function sendMessage(
  message: unknown,
  callback?: (response: unknown) => void,
): Promise<unknown> | void {
  const entry: { message: unknown; response?: unknown } = { message };
  _sentMessages.push(entry);

  // Notify any registered onMessage listeners
  let responseValue: unknown;
  for (const listener of _messageListeners) {
    listener(message, {} as chrome.runtime.MessageSender, (resp) => {
      responseValue = resp;
      entry.response = resp;
    });
  }

  if (callback) {
    callback(responseValue);
    return undefined as unknown as void;
  }
  return Promise.resolve(responseValue);
}

// ── Build the global mock ───────────────────────────────────────────────

export function installChromeMock(): void {
  const chromeMock = {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
        remove: storageRemove,
      },
    },
    runtime: {
      sendMessage,
      onMessage: {
        addListener(
          fn: (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: unknown) => void,
          ) => void,
        ): void {
          _messageListeners.push(fn);
        },
        removeListener(
          fn: (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: unknown) => void,
          ) => void,
        ): void {
          _messageListeners = _messageListeners.filter((l) => l !== fn);
        },
        hasListeners(): boolean {
          return _messageListeners.length > 0;
        },
      },
      getURL(path: string): string {
        return `chrome-extension://mock-id/${path}`;
      },
      lastError: null as chrome.runtime.LastError | null,
    },
    alarms: {
      create(name: string, info: chrome.alarms.AlarmCreateInfo): void {
        _alarms[name] = info;
      },
      onAlarm: {
        addListener(fn: (alarm: chrome.alarms.Alarm) => void): void {
          _alarmListeners.push(fn);
        },
        removeListener(fn: (alarm: chrome.alarms.Alarm) => void): void {
          _alarmListeners = _alarmListeners.filter((l) => l !== fn);
        },
      },
    },
  };

  // Install on globalThis so `chrome.storage.local.*` works in source code
  (globalThis as Record<string, unknown>).chrome = chromeMock;
}

// Auto-install when the mock module is imported
installChromeMock();
