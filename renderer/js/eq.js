// The collapsed island's three-line music indicator (DOM glue). The state machine lives in shared/eq-state.js.
//
// Playing: CSS keyframes animate the three bars (transform only, so the compositor does the work; there is no JS loop).
// Stopping: the bars' current pose is captured once and eased back to the resting pose with a CSS transition, so a pause
// never snaps. With reduced motion the bars stay still and only switch between the resting and a taller "playing" pose.
(function () {
  const { $, later, cancel, own } = Island;
  const el = $('#eq');
  if (!el) return;
  const bars = [...el.children];
  let cleanT = null;

  function apply(playing) {
    cancel(cleanT);
    if (Island.reduced) { el.dataset.state = playing ? 'playing' : 'rest'; return; }
    if (playing) {
      bars.forEach((b) => { b.style.transition = ''; b.style.transform = ''; });   // hand control to the keyframes
      el.dataset.state = 'playing';
      return;
    }
    const pose = bars.map((b) => getComputedStyle(b).transform);                    // where each bar is right now
    bars.forEach((b, i) => { b.style.transition = 'none'; b.style.transform = pose[i]; });
    el.dataset.state = 'rest';                                                       // removes the keyframes
    void el.offsetWidth;                                                             // commit the captured pose
    bars.forEach((b) => { b.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'; b.style.transform = ''; });
    cleanT = later(() => bars.forEach((b) => { b.style.transition = ''; }), 520);
  }

  const state = EqState.create({ onChange: apply });
  own(() => state.dispose());
  // media: true/false = a session exists and is/is not playing. null = no session at all.
  window.Eq = { media(playing) { if (playing === null) state.clear(); else state.set(!!playing); }, state: () => el.dataset.state, playing: () => state.playing };
})();
