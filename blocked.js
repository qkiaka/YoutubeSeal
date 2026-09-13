const params = new URLSearchParams(location.search);
const until = parseInt(params.get("until"), 10);

function fmt(ms) {
  if (ms <= 0) return "解除されました";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  return `あと ${days}日 ${hours}時間 ${mins}分`;
}

function tick() {
  const left = until - Date.now();
  document.getElementById("countdown").textContent = fmt(left);
  if (left <= 0) {
    location.reload();
  }
}

if (until) {
  tick();
  setInterval(tick, 30000);
  const d = new Date(until);
  document.getElementById("untilText").textContent =
    `解除予定日時: ${d.toLocaleString("ja-JP")}`;
}

document.getElementById("goOptions").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, () => {});
  window.location.href = chrome.runtime.getURL("options.html");
});
