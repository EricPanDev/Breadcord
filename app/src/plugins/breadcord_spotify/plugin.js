
class SpotifyPlayer {
  constructor(token) {
    this.token = token;


    this.ready = false;
    this._readyCbs = [];


    this.state = "paused"; // or "playing"
    this.track = {
      name: null,
      image_url: null,
      duration: 0,  // ms
      author: null,
    };


    this._progressMs = 0;       // last known progress from Spotify
    this._progressAt = 0;       // Date.now() when _progressMs was updated
    this._isPaused = true;


    this._ws = null;
    this._wsHeartbeat = null;
    this._pollTimer = null;
  }


  on_ready(cb) {
    if (typeof cb === "function") {
      this._readyCbs.push(cb);
      if (this.ready) cb();
    }
  }

  async pause() {
    await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}` }
    });

    this._isPaused = true;
    this.state = "paused";
  }

  async resume() {
    await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: { Authorization: `Bearer ${this.token}` }
    });
    this._isPaused = false;
    this.state = "playing";
  }


  progress() {
    if (this._progressAt === 0) return 0;
    if (this._isPaused) return this._progressMs;
    const dt = Date.now() - this._progressAt;
    const est = this._progressMs + dt;
    return Math.min(est, this.track.duration || est);
  }


  connect() {

    const url = `wss://dealer.spotify.com/?access_token=${encodeURIComponent(this.token)}`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {

      this._startHeartbeat();


      this.ready = true;
      this._readyCbs.forEach(cb => cb());


      this._refreshState().catch(() => {});

      this._startPolling();
    };

    this._ws.onmessage = (evt) => {



      try {
        const msg = JSON.parse(evt.data);




        const maybePayloads = Array.isArray(msg?.payloads) ? msg.payloads : [msg];
        for (const p of maybePayloads) {
          if (!p) continue;

          const candidate =
            p?.player_state ||
            p?.state ||
            p?.data?.state ||
            p?.payload?.state ||
            p?.context?.player_state ||
            null;

          if (candidate) {
            this._applyPlayerState(candidate);
            return;
          }


          if (typeof p?.is_paused === "boolean" && (p?.track || p?.track_window || p?.item)) {
            this._applyPlayerState(p);
            return;
          }
        }
      } catch {

      }
    };

    this._ws.onclose = () => this._cleanup();
    this._ws.onerror = () => {}; // Ignore; polling + REST keep us alive
  }

  // -- Internals --------------------------------------------------------------
  async _refreshState() {
    const res = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    this._applyWebApiState(data);
  }

  _applyWebApiState(data) {
    // Shape documented by Spotify Web API: /me/player
    // https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback
    const isPlaying = !!data?.is_playing;
    const item = data?.item || data?.currently_playing_item || null;

    this._isPaused = !isPlaying;
    this.state = isPlaying ? "playing" : "paused";

    if (item) {
      this.track.name = item.name || null;
      this.track.duration = item.duration_ms || 0;
      const artists = Array.isArray(item.artists) ? item.artists.map(a => a.name).filter(Boolean) : [];
      this.track.author = artists.join(", ") || null;

      const images = item.album?.images || [];
      this.track.image_url = images[0]?.url || images[1]?.url || images[2]?.url || null;
    }

    const progress = data?.progress_ms ?? 0;
    this._progressMs = progress;
    this._progressAt = Date.now();
  }

  _applyPlayerState(ps) {


    const paused =
      (typeof ps.is_paused === "boolean" && ps.is_paused) ||
      (typeof ps.paused === "boolean" && ps.paused) ||
      false;
    this._isPaused = paused;
    this.state = paused ? "paused" : "playing";

    const t =
      ps.track ||
      ps.item ||
      ps.track_window?.current_track ||
      null;

    if (t) {
      this.track.name = t.name || null;
      this.track.duration = t.duration_ms || 0;

      const artists =
        (Array.isArray(t.artists) ? t.artists : (t.artist ? [t.artist] : []))
          .map(a => (typeof a === "string" ? a : a?.name))
          .filter(Boolean);

      this.track.author = artists.join(", ") || null;

      const images = t.album?.images || t.images || [];
      this.track.image_url =
        (Array.isArray(images) && images.length > 0 ? images[0].url || images[0] : null) ||
        null;
    }


    const posMs =
      (typeof ps.position === "number" && ps.position) ||
      (typeof ps.position_ms === "number" && ps.position_ms) ||
      (typeof ps.progress_ms === "number" && ps.progress_ms) ||
      0;

    this._progressMs = posMs;
    this._progressAt = Date.now();
  }

  _startHeartbeat() {
    // Keep socket alive with a ping every ~25s
    this._wsHeartbeat = setInterval(() => {
      try {
        // Dealer tolerates ping frames; if not supported in your env,
        // send a lightweight message the server ignores.
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
          // Some runtimes expose ws.ping(); in browsers we don't have that,
          // so we send a no-op text frame.
          this._ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        }
      } catch {}
    }, 25000);
  }

  _startPolling() {
    // Poll every ~10s as a safety net to keep state fresh
    this._pollTimer = setInterval(() => this._refreshState().catch(() => {}), 10000);
  }

  _cleanup() {
    this.ready = false;
    if (this._wsHeartbeat) clearInterval(this._wsHeartbeat), (this._wsHeartbeat = null);
    if (this._pollTimer) clearInterval(this._pollTimer), (this._pollTimer = null);
  }
}
// --- add a few controls to your existing SpotifyPlayer ----------------------
if (typeof SpotifyPlayer !== "undefined") {
  const SP = SpotifyPlayer.prototype;

  SP.seek = async function (positionMs) {
    const url = `https://api.spotify.com/v1/me/player/seek?position_ms=${Math.max(0, positionMs|0)}`;
    await fetch(url, { method: "PUT", headers: { Authorization: `Bearer ${this.token}` } });
    this._progressMs = positionMs;
    this._progressAt = Date.now();
  };

  SP.next = async function () {
    await fetch("https://api.spotify.com/v1/me/player/next", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` }
    });
  };

  SP.previous = async function () {
    await fetch("https://api.spotify.com/v1/me/player/previous", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` }
    });
  };

  // capture device name when REST state comes in
  const _applyWebApiStateOrig = SP._applyWebApiState;
  SP._applyWebApiState = function (data) {
    this.deviceName = data?.device?.name || null;
    return _applyWebApiStateOrig.call(this, data);
  };
}

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

// --- hook it up if you haven't already --------------------------------------
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