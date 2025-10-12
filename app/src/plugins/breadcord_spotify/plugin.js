
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