const COOLDOWN_MS = 48 * 60 * 60 * 1000;

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function show(id) {
  ["setupView", "codeView", "activeView", "freeView"].forEach((v) => {
    document.getElementById(v).style.display = v === id ? "block" : "none";
  });
}

function fmtLeft(ms) {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  return `あと ${days}日 ${hours}時間`;
}

async function render() {
  const state = await send({ type: "GET_STATE" });

  if (!state.setupDone) {
    show("setupView");
    return;
  }

  const left = state.lockEndDate ? state.lockEndDate - Date.now() : 0;

  if (left > 0) {
    show("activeView");
    document.getElementById("statusText").textContent =
      "解除予定日時: " + new Date(state.lockEndDate).toLocaleString("ja-JP");
    document.getElementById("countdownText").textContent = fmtLeft(left);

    const pending = state.pendingUnlock;
    if (pending) {
      document.getElementById("noRequestView").style.display = "none";
      document.getElementById("pendingView").style.display = "block";
      const elapsed = Date.now() - pending.requestedAt;
      const remaining = COOLDOWN_MS - elapsed;
      if (remaining > 0) {
        document.getElementById("cooldownText").textContent =
          "クールダウン中: " + fmtLeft(remaining) + " 待つとコード入力が可能になります。";
        document.getElementById("codeEntry").style.display = "none";
      } else {
        document.getElementById("cooldownText").textContent =
          "クールダウン終了。コードを入力すると解除できます。";
        document.getElementById("codeEntry").style.display = "block";
      }
    } else {
      document.getElementById("noRequestView").style.display = "block";
      document.getElementById("pendingView").style.display = "none";
    }
  } else {
    show("freeView");
  }
}

document.getElementById("startBtn")?.addEventListener("click", async () => {
  const days = parseInt(document.getElementById("daysInput").value, 10) || 14;
  const res = await send({ type: "SETUP", days });
  document.getElementById("codeBox").textContent = res.code;
  show("codeView");
});

document.getElementById("codeDoneBtn")?.addEventListener("click", render);

document.getElementById("extendBtn")?.addEventListener("click", async () => {
  const days = parseInt(document.getElementById("extendDays").value, 10) || 7;
  await send({ type: "EXTEND", days });
  render();
});

document.getElementById("requestUnlockBtn")?.addEventListener("click", async () => {
  await send({ type: "REQUEST_UNLOCK" });
  render();
});

document.getElementById("cancelRequestBtn")?.addEventListener("click", async () => {
  await send({ type: "CANCEL_UNLOCK_REQUEST" });
  render();
});

document.getElementById("confirmUnlockBtn")?.addEventListener("click", async () => {
  const code = document.getElementById("unlockCodeInput").value.trim();
  const res = await send({ type: "CONFIRM_UNLOCK", code });
  if (!res.ok) {
    document.getElementById("unlockError").textContent = res.error;
  } else {
    render();
  }
});

document.getElementById("restartBtn")?.addEventListener("click", async () => {
  const days = parseInt(document.getElementById("restartDays").value, 10) || 14;
  const res = await send({ type: "SETUP", days });
  document.getElementById("codeBox").textContent = res.code;
  show("codeView");
});

render();
setInterval(render, 30000);
