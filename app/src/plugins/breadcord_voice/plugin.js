class Emitter {
  listeners = new Map()
  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event).add(cb)
    return () => this.off(event, cb)
  }
  off(event, cb) {
    this.listeners.get(event)?.delete(cb)
  }
  emit(event, ...args) {
    this.listeners.get(event)?.forEach(fn => fn(...args))
  }
}

class BreadVoiceHandler {
  _micMonitor = { ctx: null, source: null, gain: null, stream: null };

enableMicMonitor = async (on = true, gainValue = 0.3) => {
  try {
    if (on) {
      // Reuse existing mic if available, otherwise capture a minimal audio stream
      if (!this.localStream || this.localStream.getAudioTracks().length === 0) {
        this._micMonitor.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
      } else {
        this._micMonitor.stream = new MediaStream([ this.localStream.getAudioTracks()[0] ]);
      }

      if (!this._micMonitor.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this._micMonitor.ctx = new Ctx();
        this._micMonitor.source = this._micMonitor.ctx.createMediaStreamSource(this._micMonitor.stream);
        this._micMonitor.gain = this._micMonitor.ctx.createGain();
        this._micMonitor.gain.gain.value = gainValue; // lower to avoid feedback
        this._micMonitor.source.connect(this._micMonitor.gain).connect(this._micMonitor.ctx.destination);
      }

      // Autoplay policies: must be called from a user gesture
      await this._micMonitor.ctx.resume();
      console.log("[Voice] Mic monitor ON");
    } else {
      if (this._micMonitor.source) this._micMonitor.source.disconnect();
      if (this._micMonitor.gain) this._micMonitor.gain.disconnect();
      if (this._micMonitor.ctx) await this._micMonitor.ctx.close();
      this._micMonitor = { ctx: null, source: null, gain: null, stream: null };
      console.log("[Voice] Mic monitor OFF");
    }
  } catch (e) {
    console.error("[Voice] Mic monitor error:", e);
  }
};

// Hidden audio element for remote playback
_remoteAudioEl = null;

// Ensure a hidden <audio> exists and is wired up
_ensureRemoteAudioEl = () => {
  if (this._remoteAudioEl) return this._remoteAudioEl;
  const el = document.createElement('audio');
  el.autoplay = true;
  el.playsInline = true;
  el.controls = false;
  el.muted = false; // we want to hear it
  el.style.display = 'none';
  document.body.appendChild(el);
  this._remoteAudioEl = el;
  return el;
};

// Attach an incoming audio track to the hidden <audio>
_attachRemoteAudio = (track, streams) => {
  const el = this._ensureRemoteAudioEl();
  const stream = streams?.[0] ?? new MediaStream([track]);
  el.srcObject = stream;
  // Try to start playback (may require a click due to autoplay policy)
  el.play().catch(() => {
    console.warn("[Voice] Autoplay blocked. Call voiceHandler.resumeAudio() after a user gesture.");
  });
};

// Call this from a user gesture to fix autoplay blocks
resumeAudio = async () => {
  try {
    const el = this._ensureRemoteAudioEl();
    await el.play();
    console.log("[Voice] Remote audio playing");
  } catch (e) {
    console.error("[Voice] Failed to resume audio:", e);
  }
};

_buildSelectProtocolFragment(fullSdp) {
  // Normalize to \n
  const lines = fullSdp.replace(/\r/g, '').split('\n').filter(Boolean)

  const pick = (re) => lines.find(l => re.test(l))
  const pickAll = (re) => lines.filter(l => re.test(l))

  const keep = []

  // Order roughly like your "correct" example:
  // 1) extmap-allow-mixed
  const extmapAllowMixed = pick(/^a=extmap-allow-mixed$/)
  if (extmapAllowMixed) keep.push(extmapAllowMixed)

  // 2) ICE creds + options
  const iceUfrag = pick(/^a=ice-ufrag:/)
  const icePwd = pick(/^a=ice-pwd:/)
  const iceOpts = pick(/^a=ice-options:/)
  if (iceUfrag) keep.push(iceUfrag)
  if (icePwd) keep.push(icePwd)
  if (iceOpts) keep.push(iceOpts)

  // 3) Fingerprint
  const fingerprint = pick(/^a=fingerprint:sha-256 /)
  if (fingerprint) keep.push(fingerprint)

  // 4) extmaps (only the IDs you showed)
  const extmapIds = new Set([1,2,3,4,5,6,7,8,10,11,13,14])
  const extmaps = pickAll(/^a=extmap:\d+\s/).filter(l => {
    const m = l.match(/^a=extmap:(\d+)\s/)
    return m && extmapIds.has(Number(m[1]))
  })
  keep.push(...extmaps)

  // 5) rtpmap minimal set (opus 111, VP8 96, RTX 97)
  const opus = pick(/^a=rtpmap:111\s+opus\/48000\/2$/)
  const vp8  = pick(/^a=rtpmap:96\s+VP8\/90000$/)
  const rtx  = pick(/^a=rtpmap:97\s+rtx\/90000$/)
  if (opus) keep.push(opus)
  if (vp8) keep.push(vp8)
  if (rtx) keep.push(rtx)

  // Return with \n separators (no v=/m=/c=/candidates/etc.)
  return keep.join('\n')
}

  // ---- NEW: build the short "select protocol" fragment from a full SDP (unchanged from your version) ----
  _buildAndSendInitialStreamUpdate() {
  const ssrcs = this._extractSSRCs(this.pc?.localDescription?.sdp || "")
  const video_ssrc = ssrcs.video || 0
  const rtx_ssrc   = ssrcs.rtx   || 0

  // EXACT shape the server expects:
  this.send(12, {
    audio_ssrc: 0,
    video_ssrc,
    rtx_ssrc,
    streams: [{
      type: "video",
      rid: "100",
      ssrc: video_ssrc,
      active: false,
      quality: 100,
      rtx_ssrc: rtx_ssrc,
      max_bitrate: 2500000,
      max_framerate: 20,
      max_resolution: { type: "fixed", width: 1280, height: 720 }
    }]
  })
}

  // ---- NEW: parse the server's ICE/SDP fragment in op:4 (your example) ----
  _parseServerIceFragment(fragment) {
    // normalize \n and strip \r
    const lines = fragment.replace(/\r/g, '').split('\n').filter(Boolean)
    const get = (re) => (lines.find(l => re.test(l)) || '')
    const getAll = (re) => lines.filter(l => re.test(l))

    const mAudio = get(/^m=audio\s+(\d+)/)
    const mPortMatch = mAudio.match(/^m=audio\s+(\d+)/)
    const port = mPortMatch ? Number(mPortMatch[1]) : 9

    const cLine = get(/^c=IN IP4 /)
    const ip = (cLine.match(/^c=IN IP4\s+([0-9.]+)/) || [])[1] || '0.0.0.0'

    const ufrag = (get(/^a=ice-ufrag:/).split(':')[1] || '').trim()
    const pwd   = (get(/^a=ice-pwd:/).split(':')[1] || '').trim()

    const fpLine = get(/^a=fingerprint:sha-256 /)
    const fingerprint = fpLine.replace(/^a=fingerprint:sha-256\s+/, '').trim()

    const candidates = getAll(/^a=candidate:/)

    return { port, ip, ufrag, pwd, fingerprint, candidates }
  }

  // ---- NEW: find payload types from our local offer (so answer matches what we offered) ----
  _offerPayloadTypes(kind, sdp) {
    const lines = sdp.replace(/\r/g, '').split('\n')
    const mBlocks = [...sdp.matchAll(/(^m=(audio|video)[\s\S]*?)(?=^m=|\Z)/gm)].map(m => m[1])
    const block = mBlocks.find(b => new RegExp(`^m=${kind}`, 'm').test(b))
    if (!block) return { mPayloads: [], ptByCodec: {} }

    const mLine = (block.match(/^m=.*$/m) || [''])[0]
    const mPayloads = mLine.split(' ').slice(3).map(n => Number(n)).filter(n => !Number.isNaN(n))

    const ptByCodec = {}
    for (const l of lines) {
      const m = l.match(/^a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)\/(\d+)/)
      if (m) {
        const pt = Number(m[1]); const codec = m[2].toUpperCase()
        ptByCodec[codec] = ptByCodec[codec] || []
        ptByCodec[codec].push(pt)
      }
    }
    return { mPayloads, ptByCodec }
  }

  // ---- NEW: synthesize a minimal but valid SDP "answer" from the ICE fragment ----
  _synthesizeAnswerFromIce(fragment, preferVideo = 'H264') {
    if (!this.pc?.localDescription?.sdp) throw new Error('No local offer SDP to base answer on')
    const offer = this.pc.localDescription.sdp
    const ice = this._parseServerIceFragment(fragment)

    // mids from our offer, in order
    const mids = [...offer.matchAll(/^a=mid:(.+)$/mg)].map(m => m[1])
    // fallbacks
    const audioMid = mids.find(Boolean) ?? '0'
    const videoMid = mids.length > 1 ? mids[1] : '1'

    // payload types
    const { ptByCodec: ptA } = this._offerPayloadTypes('audio', offer)
    const opusPT = (ptA['OPUS'] || [111])[0]

    const { ptByCodec: ptV } = this._offerPayloadTypes('video', offer)
    // choose preferred video codec if present, else VP8
    const prefer = preferVideo?.toUpperCase() || 'H264'
    const chosenVideoPT = (ptV[prefer] || ptV['VP8'] || [96])[0]

    // find RTX apt for chosen video
    const aptMatch = offer.match(new RegExp(`^a=fmtp:(\\d+)\\s+apt=${chosenVideoPT}$`, 'm'))
    const rtxPT = aptMatch ? Number(aptMatch[1]) : null

    // Collect rtpmap/fmtp/rtcp-fb lines for the chosen PTs from the offer so browser is happy
    const copyLinesForPTs = (pts) => {
      const set = new Set()
      const lines = []
      for (const pt of pts) {
        if (pt == null) continue
        const reRtpmap = new RegExp(`^a=rtpmap:${pt}\\s+.+$`, 'm')
        const reFmtp   = new RegExp(`^a=fmtp:${pt}\\s+.+$`, 'm')
        const reRtcpfb = new RegExp(`^a=rtcp-fb:${pt}\\s+.+$`, 'mg')
        const r1 = (offer.match(reRtpmap) || [])
        const f1 = (offer.match(reFmtp) || [])
        const fb = (offer.match(reRtcpfb) || [])
        for (const l of [...r1, ...f1, ...fb]) {
          if (!set.has(l)) { set.add(l); lines.push(l) }
        }
      }
      return lines
    }

    const audioCodecLines = copyLinesForPTs([opusPT])
    const videoCodecLines = copyLinesForPTs([chosenVideoPT, rtxPT])

    // m= ports: real port for first (audio), 9 for bundled others
    const bundleMids = [audioMid, videoMid].filter(Boolean).join(' ')

    const candLines = ice.candidates.length ? ice.candidates.join('\n') + '\n' : ''

    const sdp =
`v=0
o=- 0 0 IN IP4 127.0.0.1
s=-
t=0 0
a=extmap-allow-mixed
a=group:BUNDLE ${bundleMids}
m=audio ${ice.port} UDP/TLS/RTP/SAVPF ${opusPT}
c=IN IP4 ${ice.ip}
a=rtcp:${ice.port}
a=ice-ufrag:${ice.ufrag}
a=ice-pwd:${ice.pwd}
a=fingerprint:sha-256 ${ice.fingerprint}
a=setup:active
a=mid:${audioMid}
a=recvonly
a=rtcp-mux
a=rtcp-rsize
${audioCodecLines.join('\n')}
${candLines}m=video 9 UDP/TLS/RTP/SAVPF ${[chosenVideoPT, rtxPT].filter(Boolean).join(' ')}
c=IN IP4 0.0.0.0
a=rtcp:9
a=ice-ufrag:${ice.ufrag}
a=ice-pwd:${ice.pwd}
a=fingerprint:sha-256 ${ice.fingerprint}
a=setup:active
a=mid:${videoMid}
a=recvonly
a=rtcp-mux
a=rtcp-rsize
${videoCodecLines.join('\n')}
`.replace(/[ \t]+$/gm, '')

    return sdp
  }

  constructor({ guildId, channelId, userId }) {
    this.guildId = guildId
    this.channelId = channelId
    this.userId = userId
    this.ws = null
    this.sessionId = null
    this.heartbeatTimer = null
    this.lastServerSeq = 0
    this.isOpen = false
    this.events = new Emitter()
    this.pc = null
    this.localStream = null
    this.rtcConnectionId = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`)
    this._madeOffer = false
  }

  async openVoiceConnection(endpoint, token, sessionId) {
    const url = `wss://${endpoint}/?v=9`
    this.sessionId = sessionId
    this.ws = new WebSocket(url)
    this.ws.addEventListener("open", () => {
      this.isOpen = true
      this.events.emit("open")
      this.identify(token)
    })
    this.ws.addEventListener("close", evt => {
      this.isOpen = false
      this.stopHeartbeat()
      this._teardownPeer()
      this.events.emit("close", evt)
    })
    this.ws.addEventListener("error", evt => this.events.emit("error", evt))
    this.ws.addEventListener("message", evt => this.onMessage(evt))
  }

  send(op, d) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Voice WS not open")
    this.ws.send(JSON.stringify({ op, d }))
  }

  identify(token) {
    const payload = {
      server_id: this.guildId.toString(),
      channel_id: this.channelId.toString(),
      user_id: this.userId,
      session_id: this.sessionId,
      token,
      video: true,
      streams: [{ type: "video", rid: "100", quality: 100 }]
    }
    this.send(0, payload)
  }

  async onMessage(evt) {
    console.log("[Voice]", evt.data)
    let parsed
    try { parsed = JSON.parse(evt.data) } catch { return }

    if (typeof parsed?.seq === "number") {
      this.lastServerSeq = parsed.seq
      if (parsed.op === 15) this.events.emit("pong", parsed.seq)
    }

    switch (parsed.op) {
      case 8: { // Hello
        this.startHeartbeat(parsed.d.heartbeat_interval)
        this.events.emit("hello", parsed.d)
        break
      }
      case 2: { // Ready
        this.send(16, {})
        this.events.emit("ready", parsed.d)
        if (!this._madeOffer) this._startWebRTCAndOffer().catch(err => this.events.emit("error", err))
        break
      }
      case 4: { // Session Description
        try {
          if (!this.pc) return
          const { sdp, type, video_codec } = parsed.d || {}
          if (!sdp) return

          // Your server sometimes sends an ICE/SDP fragment; synthesize a full SDP if needed
          let remoteSdp
          if (/^m=audio\s+\d+\s+ICE\/SDP/m.test(sdp)) {
            remoteSdp = this._synthesizeAnswerFromIce(sdp, video_codec || 'H264')
          } else {
            remoteSdp = sdp
          }

          await this.pc.setRemoteDescription({ type: (type || "answer"), sdp: remoteSdp })

          // >>> Send the REQUIRED stream update, exactly as they expect
          this._buildAndSendInitialStreamUpdate()

          this.events.emit("sessionDescription", parsed.d)
        } catch (e) {
          this.events.emit("error", e)
        }
        break
      }
      case 16: {
        console.log("offer made: ", this._madeOffer)
        if (!this._madeOffer) this._startWebRTCAndOffer()
        break
      }
      default:
        this.events.emit("message", parsed)
    }
  }

  async _startWebRTCAndOffer() {
  if (this._madeOffer) return

  // 1) Create PC
  this.pc = new RTCPeerConnection({ iceServers: [] })
  this.pc.onconnectionstatechange = () => this.events.emit("pc:connectionstate", this.pc.connectionState)
  this.pc.oniceconnectionstatechange = () => this.events.emit("pc:ice", this.pc.iceConnectionState)
  this.pc.ontrack = (ev) => {
  // You’ll also get video here if the server sends it; check kind
  if (ev.track.kind === 'audio') {
    console.log("[Voice] Remote audio track received");
    this._attachRemoteAudio(ev.track, ev.streams);
  }
  this.events.emit("pc:track", ev);
};

  // 2) Keep m-line order stable with transceivers
  const aTx = this.pc.addTransceiver('audio', { direction: 'sendonly' })
  const vTx = this.pc.addTransceiver('video', { direction: 'sendonly' })

  try {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: true
    });
    const [aTrack] = this.localStream.getAudioTracks();
    const [vTrack] = this.localStream.getVideoTracks();
    if (aTrack) await aTx.sender.replaceTrack(aTrack);
    if (vTrack) await vTx.sender.replaceTrack(vTrack);
  } catch (err) {
    console.warn("[Voice] getUserMedia failed:", err);
  }

  // 3) Try to attach media, but don't fail if it’s not available
  try {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    const [aTrack] = this.localStream.getAudioTracks()
    const [vTrack] = this.localStream.getVideoTracks()
    if (aTrack) await aTx.sender.replaceTrack(aTrack)
    if (vTrack) await vTx.sender.replaceTrack(vTrack)
  } catch (err) {
    console.warn("[Voice] getUserMedia failed, proceeding sendonly without tracks:", err)
  }

  // 4) Create & set offer
  const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
  await this.pc.setLocalDescription(offer)

  // 5) Build short fragment from *current* local SDP (has ufrag/pwd/fingerprint even before ICE complete)
  const sdp = this.pc.localDescription?.sdp
  if (!sdp) throw new Error("No localDescription SDP")
  const fragment = this._buildSelectProtocolFragment(sdp)

  // 6) Send op:1 immediately (DON'T wait for ICE to complete)
  const payload = {
    protocol: "webrtc",
    data: fragment,
    sdp: fragment,
    codecs: [
      { name: "opus", type: "audio", priority: 1000, payload_type: 111, rtx_payload_type: null },
      { name: "H264", type: "video", priority: 1000, payload_type: 103, rtx_payload_type: 104 },
      { name: "VP8",  type: "video", priority: 2000, payload_type: 96,  rtx_payload_type: 97  },
      { name: "VP9",  type: "video", priority: 3000, payload_type: 98,  rtx_payload_type: 99  }
    ],
    rtc_connection_id: this.rtcConnectionId
  }

  // Extra visibility
  console.log("[Voice] Sending op:1 SelectProtocol", { readyState: this.ws?.readyState, len: fragment.length })
  this.send(1, payload)
  this._madeOffer = true
  this.events.emit("offerSent", fragment)


}

  _waitForIceGatheringComplete(pc) {
    if (pc.iceGatheringState === "complete") return Promise.resolve()
    return new Promise(resolve => {
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check)
          resolve()
        }
      }
      pc.addEventListener("icegatheringstatechange", check)
    })
  }

  _extractSSRCs(sdp) {
    const out = { audio: 0, video: 0, rtx: 0 }
    const mediaBlocks = [...sdp.matchAll(/(^m=(audio|video)[\s\S]*?)(?=^m=|\Z)/gm)].map(m => m[1])
    for (const block of mediaBlocks) {
      const isAudio = /^m=audio/m.test(block)
      const fid = block.match(/^a=ssrc-group:FID\s+(\d+)\s+(\d+)/m)
      const any = block.match(/^a=ssrc:(\d+)\s+/m)
      if (isAudio) {
        if (any) out.audio = Number(any[1])
      } else {
        if (fid) { out.video = Number(fid[1]); out.rtx = Number(fid[2]) }
        else if (any) { out.video = Number(any[1]) }
      }
    }
    return out
  }

  _teardownPeer() {
    try {
      if (this.pc) {
        this.pc.onicecandidate = null
        this.pc.ontrack = null
        this.pc.close()
      }
    } catch {}
    this.pc = null
    this._madeOffer = false
    try { this.localStream?.getTracks()?.forEach(t => t.stop()) } catch {}
    this.localStream = null
  }

  startHeartbeat(intervalMs) {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      this.send(3, { t: now, seq_ack: this.lastServerSeq })
      this.events.emit("heartbeat", now)
    }, intervalMs)
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  ping(seq = Math.floor(Math.random() * 1e9)) {
    this.send(15, { any: 1, seq })
    return seq
  }

  sendStreamUpdate(update = {}) {
  const video_ssrc = update.video_ssrc ?? 0
  const rtx_ssrc   = update.rtx_ssrc   ?? 0
  const audio_ssrc = update.audio_ssrc ?? 0

  const d = {
    audio_ssrc,
    video_ssrc,
    rtx_ssrc,
    streams: update.streams ?? [{
      type: "video",
      rid: "100",
      ssrc: video_ssrc,
      active: update.active ?? false,
      quality: 100,
      rtx_ssrc: rtx_ssrc,
      max_bitrate: 2500000,
      max_framerate: 20,
      max_resolution: { type: "fixed", width: 1280, height: 720 }
    }]
  }
  this.send(12, d)
}
}

/** Glue layer with BreadAPI.gateway */
let guild_id, channel_id, session_id
let voiceHandler

async function connect(guild, channel) {
  guild_id = guild
  channel_id = channel
  BreadAPI.gateway.send({
    op: 4,
    d: { guild_id, channel_id, self_mute: false, self_deaf: false, self_video: false, flags: 0 }
  })
}

BreadAPI.gateway.on_message((data) => {
  if (data.t === "READY") {
    session_id = data.d.session_id
  }
  if (data.t === "VOICE_SERVER_UPDATE") {
    voiceHandler = new BreadVoiceHandler({
      guildId: guild_id,
      channelId: channel_id,
      userId: BreadCache.user.id
    })
    voiceHandler.openVoiceConnection(data.d.endpoint, data.d.token, session_id)
  }
})

class BreadVoiceAPI {}
BreadVoiceAPI.connect = connect
window.BreadVoiceAPI = BreadVoiceAPI
