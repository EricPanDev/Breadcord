// --- COMPACT live UI (no preview), narrow width, text labels ---------------
function mountLiveSpotifyUI(player) {
  const host = document.querySelector('[data-container-id="breadcord-message-container"][data-type="vstack"]');
  if (!host) return console.error("Container not found");

  // Card
  const card = document.createElement("div");
  card.style.cssText = `
    display:flex; gap:8px; align-items:center;
    padding:8px; border:1px solid #e5e7eb;
    border-radius:10px; background:#fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.05);
    max-width:480px; width:100%;
  `;

  const cover = document.createElement("img");
  cover.style.cssText = "width:60px; height:60px; border-radius:8px; object-fit:cover; background:#f3f4f6;";

  const meta = document.createElement("div");
  meta.style.cssText = "display:flex; flex-direction:column; gap:6px; flex:1; min-width:0;";

  const title = document.createElement("div");
  title.style.cssText = "font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

  const author = document.createElement("div");
  author.style.cssText = "color:#6b7280; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

  const device = document.createElement("div");
  device.style.cssText = "color:#9ca3af; font-size:10px;";

  const barRow = document.createElement("div");
  barRow.style.cssText = "display:flex; align-items:center; gap:6px;";

  const elapsed = document.createElement("span");
  elapsed.style.cssText = "font-variant-numeric: tabular-nums; font-size:10px; color:#6b7280; width:34px; text-align:right;";
  const duration = document.createElement("span");
  duration.style.cssText = "font-variant-numeric: tabular-nums; font-size:10px; color:#6b7280; width:34px;";

  const progress = document.createElement("input");
  progress.type = "range";
  progress.min = 0;
  progress.max = 1000;
  progress.value = 0;
  progress.style.cssText = "flex:1; accent-color:#10b981; height:4px;";

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex; align-items:center; gap:4px;";

  // Compact text buttons (no funky unicode)
  const btnPrev = button("Prev");
  const btnPlayPause = button("Play");
  const btnNext = button("Next");

  function button(label) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `
      padding:4px 8px;
      border-radius:6px;
      border:1px solid #e5e7eb;
      background:#f9fafb;
      font-size:11px;
      cursor:pointer;
      line-height:1;
      min-width:auto;
    `;
    return b;
  }

  barRow.append(elapsed, progress, duration);
  meta.append(title, author, device, barRow);
  controls.append(btnPrev, btnPlayPause, btnNext);

  card.append(cover, meta, controls);
  host.append(card);

  // Helpers
  const fmt = ms => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  // Wire controls
  btnPlayPause.onclick = async () => {
    try {
      if (player.state === "playing") {
        await player.pause();
      } else {
        await player.resume();
      }
      paintState();
    } catch (e) { console.error("Play/Pause failed", e); }
  };
  btnNext.onclick = () => player.next && player.next().catch(console.error);
  btnPrev.onclick = () => player.previous && player.previous().catch(console.error);

  // Seek: live thumb while dragging; commit on change
  let dragging = false;
  progress.addEventListener("input", () => {
    dragging = true;
    const total = player.track.duration || 0;
    const pos = Math.floor((progress.value / 1000) * total);
    elapsed.textContent = fmt(pos);
  });
  progress.addEventListener("change", async () => {
    const total = player.track.duration || 0;
    const pos = Math.floor((progress.value / 1000) * total);
    try { player.seek && await player.seek(pos); } catch (e) { console.error("Seek failed", e); }
    dragging = false;
  });

  // Painters
  function paintTrack() {
    cover.src = player.track.image_url || "";
    cover.alt = player.track.name || "Album cover";
    title.textContent = player.track.name ?? "—";
    author.textContent = player.track.author ?? "";
    device.textContent = player.deviceName ? `Device: ${player.deviceName}` : "";
  }
  function paintState() {
    btnPlayPause.textContent = player.state === "playing" ? "Pause" : "Play";
  }
  function paintProgress() {
    const total = player.track.duration || 0;
    if (!dragging) {
      const pos = player.progress();
      elapsed.textContent = fmt(pos || 0);
      duration.textContent = total ? fmt(total) : "0:00";
      if (total) {
        progress.disabled = false;
        progress.value = Math.max(0, Math.min(1000, Math.floor(((pos || 0) / total) * 1000)));
      } else {
        progress.disabled = true;
        progress.value = 0;
      }
    }
  }

  // Tick loop
  const interval = setInterval(() => {
    paintState();
    paintTrack();
    paintProgress();
  }, 250);

  // Cleanup if container is removed
  const observer = new MutationObserver(() => {
    if (!document.body.contains(host)) {
      clearInterval(interval);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial paint
  paintTrack(); paintState(); paintProgress();
}

BreadAPI.gateway.on_message((data) => {
  if (data.t === "READY") {
    const connected_accounts = data.d.connected_accounts || [];
    for (const acct of connected_accounts) {
      if (acct.type === "spotify" && acct.access_token) {
        const player = new SpotifyPlayer(acct.access_token);
        window.spotifyPlayer = player; // optional
        player.on_ready(() => mountLiveSpotifyUI(player));
        player.connect();
      }
    }
  }
});