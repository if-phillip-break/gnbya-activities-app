// Light / dark mode. Loaded in <head> (not deferred) so the saved choice is
// applied before the page paints, with no flash of the wrong theme.
//
// With no saved choice the page follows the device's setting through CSS
// (prefers-color-scheme); a choice made with the switch is saved in this
// browser only and wins from then on.
(function () {
  var KEY = "gnbya-theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function saved() {
    try { var v = localStorage.getItem(KEY); return v === "dark" || v === "light" ? v : null; }
    catch (e) { return null; }
  }
  function effective() {
    return saved() || (media && media.matches ? "dark" : "light");
  }

  var s = saved();
  if (s) root.setAttribute("data-theme", s);

  function wire() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    var sync = function () { btn.setAttribute("aria-checked", String(effective() === "dark")); };
    btn.addEventListener("click", function () {
      var next = effective() === "dark" ? "light" : "dark";
      // Colours ease across instead of snapping, just for this switch.
      root.classList.add("theme-fade");
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still switches for this visit */ }
      sync();
      setTimeout(function () { root.classList.remove("theme-fade"); }, 450);
    });
    if (media && media.addEventListener) media.addEventListener("change", sync);
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
