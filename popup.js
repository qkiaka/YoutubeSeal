chrome.runtime.sendMessage({ type: "GET_PLANET_STATE" }, (planet) => {
  if (window.YoutubeSealPlanetTheme) window.YoutubeSealPlanetTheme.apply(planet?.level || 1);
});

function fmtDays(ms) {
  if (ms <= 0) return "封印なし";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `あと ${days} 日`;
}

chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
  const left = state.lockEndDate ? Math.max(0, state.lockEndDate - Date.now()) : 0;
  document.getElementById("status").textContent = state.setupDone
    ? fmtDays(left)
    : "未設定";
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
