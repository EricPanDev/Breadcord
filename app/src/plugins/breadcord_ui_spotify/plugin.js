// --- COMPACT live UI (no preview), narrow width, text labels ---------------
function mountLiveSpotifyUI(player) {
  // Position above the user corner profile card
  const host = document.body;
  if (!host) return console.error("Container not found");

  // Card - connected to the top of user profile card with ultra-compact design
  const card = document.createElement("div");
  card.style.cssText = `
    position: absolute;
    left: 8px;
    bottom: calc(var(--user-corner-profile-card-height) + 8px);
    width: calc(var(--breadcord-channel-container-width) + var(--breadcord-server-container-width) - 16px);
    height: 48px;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border: 1px solid var(--color-muted);
    border-bottom: none;
    border-radius: 5px 5px 0 0;
    background: var(--color-muted-secondary);
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    box-sizing: border-box;
  `;

  const cover = document.createElement("img");
  cover.style.cssText = "width:32px; height:32px; border-radius:4px; object-fit:cover; background:var(--color-surface);";

  const meta = document.createElement("div");
  meta.style.cssText = "display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;";

  const title = document.createElement("div");
  title.style.cssText = "font-weight:600; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--color-text);";

  const author = document.createElement("div");
  author.style.cssText = "color:var(--color-text-muted); font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

  const barRow = document.createElement("div");
  barRow.style.cssText = "display:flex; align-items:center; gap:6px;";

  const elapsed = document.createElement("span");
  elapsed.style.cssText = "font-variant-numeric: tabular-nums; font-size:9px; color:var(--color-text-muted); width:28px; text-align:right;";
  const duration = document.createElement("span");
  duration.style.cssText = "font-variant-numeric: tabular-nums; font-size:9px; color:var(--color-text-muted); width:28px;";

  const progress = document.createElement("input");
  progress.type = "range";
  progress.min = 0;
  progress.max = 1000;
  progress.value = 0;
  progress.style.cssText = "flex:1; accent-color:var(--color-highlight); height:3px;";

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex; align-items:center; gap:4px; flex-shrink:0;";

  // Compact text buttons (no funky unicode)
  const btnPrev = button("‹");
  const btnPlayPause = button("▶");
  const btnNext = button("›");

  function button(label) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `
      padding:4px 6px;
      border-radius:3px;
      border:1px solid var(--color-muted);
      background:var(--color-surface);
      font-size:10px;
      cursor:pointer;
      line-height:1;
      min-width:20px;
      height:20px;
      color:var(--color-text);
      transition: background-color 0.1s ease;
    `;
    b.addEventListener('mouseenter', () => {
      b.style.backgroundColor = 'var(--color-nav-highlight)';
    });
    b.addEventListener('mouseleave', () => {
      b.style.backgroundColor = 'var(--color-surface)';
    });
    return b;
  }

  barRow.append(elapsed, progress, duration);
  meta.append(title, author, barRow);
  controls.append(btnPrev, btnPlayPause, btnNext);

  card.append(cover, meta, controls);
  host.append(card);

  // Add class to body to indicate Spotify UI is present
  document.body.classList.add('spotify-ui-active');

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
  }
  function paintState() {
    btnPlayPause.textContent = player.state === "playing" ? "⏸" : "▶";
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
      // Remove class when Spotify UI is removed
      document.body.classList.remove('spotify-ui-active');
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