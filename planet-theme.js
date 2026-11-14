(() => {
  const STAGES = [
    "Origin", "Awakening", "Verdant", "Enchanted", "Celestial",
    "Ringborn", "Lunar", "Aurora", "Ethereal", "Worldheart"
  ];
  function stageFor(level) {
    const safeLevel = Math.max(1, Math.min(100, Math.floor(Number(level) || 1)));
    return Math.min(10, Math.ceil(safeLevel / 10));
  }
  function applyPlanetTheme(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    const stage = stageFor(safeLevel);
    document.body.dataset.stage = String(stage);
    document.body.dataset.level = String(safeLevel);
    document.body.dataset.stageName = STAGES[stage - 1];
    document.querySelectorAll(".planet-scene").forEach(scene => {
      scene.dataset.stage = String(stage);
      scene.dataset.stageName = STAGES[stage - 1];
    });
    document.querySelectorAll(".planet-stage-name").forEach(el => {
      el.textContent = STAGES[stage - 1];
    });
    return { level: safeLevel, stage, name: STAGES[stage - 1] };
  }
  window.YoutubeSealPlanetTheme = { apply: applyPlanetTheme, stageFor, stages: STAGES };
})();