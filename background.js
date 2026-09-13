const COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48時間

async function getState() {
  return await chrome.storage.local.get([
    "lockEndDate",
    "codeHash",
    "pendingUnlock",
    "setupDone",
  ]);
}

async function setState(patch) {
  await chrome.storage.local.set(patch);
}

function msLeft(lockEndDate) {
  if (!lockEndDate) return 0;
  return Math.max(0, lockEndDate - Date.now());
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function updateBadge() {
  const { lockEndDate } = await getState();
  const left = msLeft(lockEndDate);
  if (left <= 0) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }
  const days = Math.ceil(left / (24 * 60 * 60 * 1000));
  chrome.action.setBadgeText({ text: String(days) });
  chrome.action.setBadgeBackgroundColor({ color: "#c0392b" });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { setupDone } = await getState();
  if (!setupDone) {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html?first=1") });
  }
  chrome.alarms.create("tick", { periodInMinutes: 30 });
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") updateBadge();
});

chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    if (details.frameId !== 0) return;
    const { lockEndDate, setupDone } = await getState();
    if (!setupDone) return;
    const left = msLeft(lockEndDate);
    if (left <= 0) return;
    const days = Math.ceil(left / (24 * 60 * 60 * 1000));
    const hours = Math.ceil(left / (60 * 60 * 1000));
    const blockedUrl = chrome.runtime.getURL(
      `blocked.html?days=${days}&hours=${hours}&until=${lockEndDate}`
    );
    chrome.tabs.update(details.tabId, { url: blockedUrl });
  },
  {
    url: [
      { hostSuffix: "youtube.com" },
      { hostSuffix: "youtu.be" },
      { hostSuffix: "youtube-nocookie.com" },
    ],
  }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "GET_STATE": {
        sendResponse(await getState());
        break;
      }
      case "SETUP": {
        const code = randomCode();
        const codeHash = await sha256(code);
        const lockEndDate = Date.now() + msg.days * 24 * 60 * 60 * 1000;
        await setState({
          lockEndDate,
          codeHash,
          setupDone: true,
          pendingUnlock: null,
        });
        updateBadge();
        sendResponse({ code, lockEndDate });
        break;
      }
      case "EXTEND": {
        const { lockEndDate } = await getState();
        const base = Math.max(lockEndDate || Date.now(), Date.now());
        const newEnd = base + msg.days * 24 * 60 * 60 * 1000;
        await setState({ lockEndDate: newEnd });
        updateBadge();
        sendResponse({ ok: true, lockEndDate: newEnd });
        break;
      }
      case "REQUEST_UNLOCK": {
        await setState({ pendingUnlock: { requestedAt: Date.now() } });
        sendResponse({ ok: true });
        break;
      }
      case "CANCEL_UNLOCK_REQUEST": {
        await setState({ pendingUnlock: null });
        sendResponse({ ok: true });
        break;
      }
      case "CONFIRM_UNLOCK": {
        const { pendingUnlock, codeHash } = await getState();
        if (!pendingUnlock) {
          sendResponse({ ok: false, error: "先に解除リクエストをしてください。" });
          break;
        }
        const elapsed = Date.now() - pendingUnlock.requestedAt;
        if (elapsed < COOLDOWN_MS) {
          sendResponse({ ok: false, error: "まだクールダウン期間中です。" });
          break;
        }
        const inputHash = await sha256(msg.code || "");
        if (inputHash !== codeHash) {
          sendResponse({ ok: false, error: "コードが一致しません。" });
          break;
        }
        await setState({ lockEndDate: Date.now(), pendingUnlock: null });
        updateBadge();
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true;
});
