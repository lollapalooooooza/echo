// ──────────────────────────────────────────────────────────────
// EchoNest Widget Embed Script
// ──────────────────────────────────────────────────────────────
// Usage on any website:
//   <script src="https://your-echonest-domain.com/widget.js"
//           data-character-id="clx..."
//           data-position="bottom-right"
//           data-theme="light"
//           async></script>
// ──────────────────────────────────────────────────────────────

(function () {
  var script = document.currentScript;
  var characterId = script.getAttribute("data-character-id");
  var position = script.getAttribute("data-position") || "bottom-right";
  var theme = script.getAttribute("data-theme") || "light";

  if (!characterId) {
    console.error("[EchoNest Widget] data-character-id is required");
    return;
  }

  var host = script.src.replace(/\/widget\.js.*$/, "");
  var isOpen = false;

  // Create launcher button
  var launcher = document.createElement("div");
  launcher.id = "echonest-launcher";
  launcher.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>';
  launcher.style.cssText =
    "position:fixed;bottom:20px;" +
    (position === "bottom-left" ? "left:20px;" : "right:20px;") +
    "width:56px;height:56px;border-radius:50%;background:#000;color:#fff;" +
    "display:flex;align-items:center;justify-content:center;cursor:pointer;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:99998;transition:transform .2s;";
  launcher.onmouseenter = function () { launcher.style.transform = "scale(1.05)"; };
  launcher.onmouseleave = function () { launcher.style.transform = "scale(1)"; };

  // Create iframe container
  var container = document.createElement("div");
  container.id = "echonest-widget";
  container.style.cssText =
    "position:fixed;bottom:88px;" +
    (position === "bottom-left" ? "left:20px;" : "right:20px;") +
    "width:380px;height:560px;border-radius:16px;overflow:hidden;" +
    "box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:99999;" +
    "display:none;border:1px solid #e5e5e5;";

  var iframe = document.createElement("iframe");
  iframe.src = host + "/embed/" + characterId;
  iframe.style.cssText = "width:100%;height:100%;border:none;";
  iframe.allow = "microphone";
  container.appendChild(iframe);

  // Toggle
  launcher.onclick = function () {
    isOpen = !isOpen;
    container.style.display = isOpen ? "block" : "none";
    launcher.innerHTML = isOpen
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>';
  };

  document.body.appendChild(container);
  document.body.appendChild(launcher);
})();
