// Boot. Everything else lives in renderer/js/*.
(async () => {
  const api = window.api;
  const replaceSettings = (s) => { const S = Island.S; Object.keys(S).forEach((k) => delete S[k]); Object.assign(S, s); };   // keep one shared object
  try { Island.env = (await api.env()) || Island.env; } catch {}
  replaceSettings(await api.getSettings());
  Engine.applyLayout();
  await Workspace.init();
  Header.init();
  Island.own(api.onSettings((s) => { replaceSettings(s); Engine.applyLayout(); Workspace.applySettings(); }));
})();
