/**
 * Breadcord Voice Plugin - Discord User Voice API Implementation
 * This implements Discord's user voice API (different from bot voice API)
 * Supports WebRTC-based audio/video communication
 */

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

/**
 * Discord User Voice Handler
 * Handles WebRTC-based voice connections for Discord user accounts
 */
class BreadVoiceHandler {
  // Audio monitoring capabilities
  _micMonitor = { ctx: null, source: null, gain: null, stream: null }
  _remoteAudioEl = null

  // Voice opcodes for Discord User Voice API
  static OPCODES = {
    IDENTIFY: 0,
    SELECT_PROTOCOL: 1,
    READY: 2,
    HEARTBEAT: 3,
    SESSION_DESCRIPTION: 4,
    SPEAKING: 5,
    HEARTBEAT_ACK: 6,
    RESUME: 7,
    HELLO: 8,
    RESUMED: 9,
    CLIENT_DISCONNECT: 13,
    STREAM_UPDATE: 12,
    PING: 15,
    PONG: 16
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
    this._currentSSRCs = { audio: 0, video: 0, rtx: 0 }
    this._streamActive = false
    this._connectionAttempts = 0
    this._maxConnectionAttempts = 3
    this._reconnectTimeout = null
  }

  /**
   * Enable/disable microphone monitoring for local feedback
   */
  enableMicMonitor = async (on = true, gainValue = 0.3) => {
    try {
      if (on) {
        // Reuse existing mic if available, otherwise capture a minimal audio stream
        if (!this.localStream || this.localStream.getAudioTracks().length === 0) {
          this._micMonitor.stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          })
        } else {
          this._micMonitor.stream = new MediaStream([ this.localStream.getAudioTracks()[0] ])
        }

        if (!this._micMonitor.ctx) {
          const Ctx = window.AudioContext || window.webkitAudioContext
          this._micMonitor.ctx = new Ctx()
          this._micMonitor.source = this._micMonitor.ctx.createMediaStreamSource(this._micMonitor.stream)
          this._micMonitor.gain = this._micMonitor.ctx.createGain()
          this._micMonitor.gain.gain.value = gainValue // lower to avoid feedback
          this._micMonitor.source.connect(this._micMonitor.gain).connect(this._micMonitor.ctx.destination)
        }

        // Autoplay policies: must be called from a user gesture
        await this._micMonitor.ctx.resume()
        console.log("[Voice] Mic monitor ON")
      } else {
        if (this._micMonitor.source) this._micMonitor.source.disconnect()
        if (this._micMonitor.gain) this._micMonitor.gain.disconnect()
        if (this._micMonitor.ctx) await this._micMonitor.ctx.close()
        this._micMonitor = { ctx: null, source: null, gain: null, stream: null }
        console.log("[Voice] Mic monitor OFF")
      }
    } catch (e) {
      console.error("[Voice] Mic monitor error:", e)
    }
  }

  /**
   * Ensure a hidden <audio> element exists for remote playback
   */
  _ensureRemoteAudioEl = () => {
    if (this._remoteAudioEl) return this._remoteAudioEl
    const el = document.createElement('audio')
    el.autoplay = true
    el.playsInline = true
    el.controls = false
    el.muted = false // we want to hear it
    el.style.display = 'none'
    document.body.appendChild(el)
    this._remoteAudioEl = el
    return el
  }

  /**
   * Attach an incoming audio track to the hidden <audio> element
   */
  _attachRemoteAudio = (track, streams) => {
    const el = this._ensureRemoteAudioEl()
    const stream = streams?.[0] ?? new MediaStream([track])
    el.srcObject = stream
    // Try to start playback (may require a click due to autoplay policy)
    el.play().catch(() => {
      console.warn("[Voice] Autoplay blocked. Call voiceHandler.resumeAudio() after a user gesture.")
    })
  }

  /**
   * Call this from a user gesture to fix autoplay blocks
   */
  resumeAudio = async () => {
    try {
      const el = this._ensureRemoteAudioEl()
      await el.play()
      console.log("[Voice] Remote audio playing")
    } catch (e) {
      console.error("[Voice] Failed to resume audio:", e)
    }
  }

  /**
   * Open WebSocket connection to Discord voice server
   */
  async openVoiceConnection(endpoint, token, sessionId) {
    const url = `wss://${endpoint}/?v=9`
    this.sessionId = sessionId
    this._connectionAttempts++
    
    console.log(`[Voice] Connecting to ${url} (attempt ${this._connectionAttempts})`)
    this.ws = new WebSocket(url)
    
    this.ws.addEventListener("open", () => {
      console.log("[Voice] WebSocket connected")
      this.isOpen = true
      this._connectionAttempts = 0 // Reset on successful connection
      this.events.emit("open")
      this.identify(token)
    })
    
    this.ws.addEventListener("close", evt => {
      console.log(`[Voice] WebSocket closed: ${evt.code} ${evt.reason}`)
      this.isOpen = false
      this.stopHeartbeat()
      this._teardownPeer()
      
      // Attempt reconnection for certain close codes
      if (evt.code !== 1000 && this._connectionAttempts < this._maxConnectionAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this._connectionAttempts), 30000)
        console.log(`[Voice] Reconnecting in ${delay}ms...`)
        this._reconnectTimeout = setTimeout(() => {
          this.openVoiceConnection(endpoint, token, sessionId)
        }, delay)
      }
      
      this.events.emit("close", evt)
    })
    
    this.ws.addEventListener("error", evt => {
      console.error("[Voice] WebSocket error:", evt)
      this.events.emit("error", evt)
    })
    
    this.ws.addEventListener("message", evt => this.onMessage(evt))
  }

  /**
   * Send message to Discord voice WebSocket
   */
  send(op, d) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Voice WebSocket not open")
    }
    const payload = { op, d }
    console.log("[Voice] Sending:", payload)
    this.ws.send(JSON.stringify(payload))
  }

  /**
   * Send identify payload for Discord user voice API
   */
  identify(token) {
    const payload = {
      server_id: this.guildId.toString(),
      channel_id: this.channelId.toString(),
      user_id: this.userId,
      session_id: this.sessionId,
      token,
      video: true, // User accounts can send video
      streams: [{ type: "video", rid: "100", quality: 100 }]
    }
    this.send(BreadVoiceHandler.OPCODES.IDENTIFY, payload)
  }

  /**
   * Handle incoming WebSocket messages
   */
  async onMessage(evt) {
    console.log("[Voice] Received:", evt.data)
    let parsed
    try { 
      parsed = JSON.parse(evt.data) 
    } catch { 
      console.warn("[Voice] Failed to parse message:", evt.data)
      return 
    }

    // Update sequence for heartbeat acknowledgment
    if (typeof parsed?.seq === "number") {
      this.lastServerSeq = parsed.seq
      if (parsed.op === BreadVoiceHandler.OPCODES.PONG) {
        this.events.emit("pong", parsed.seq)
      }
    }

    switch (parsed.op) {
      case BreadVoiceHandler.OPCODES.HELLO: {
        this.startHeartbeat(parsed.d.heartbeat_interval)
        this.events.emit("hello", parsed.d)
        break
      }
      
      case BreadVoiceHandler.OPCODES.READY: {
        // Send initial ping to establish connection
        this.send(BreadVoiceHandler.OPCODES.PONG, {})
        this.events.emit("ready", parsed.d)
        
        // Start WebRTC offer process
        if (!this._madeOffer) {
          this._startWebRTCAndOffer().catch(err => this.events.emit("error", err))
        }
        break
      }
      
      case BreadVoiceHandler.OPCODES.SESSION_DESCRIPTION: {
        try {
          await this._handleSessionDescription(parsed.d)
        } catch (e) {
          console.error("[Voice] Session description error:", e)
          this.events.emit("error", e)
        }
        break
      }
      
      case BreadVoiceHandler.OPCODES.PONG: {
        console.log("[Voice] Pong received, ready for offer")
        if (!this._madeOffer) {
          this._startWebRTCAndOffer().catch(err => this.events.emit("error", err))
        }
        break
      }
      
      default:
        this.events.emit("message", parsed)
    }
  }

  /**
   * Handle session description from Discord
   */
  async _handleSessionDescription(data) {
    if (!this.pc) {
      console.warn("[Voice] No peer connection for session description")
      return
    }

    const { sdp, type, video_codec } = data || {}
    if (!sdp) {
      console.warn("[Voice] No SDP in session description")
      return
    }

    // Handle ICE/SDP fragments that Discord sometimes sends
    let remoteSdp
    if (/^m=audio\s+\d+\s+ICE\/SDP/m.test(sdp)) {
      remoteSdp = this._synthesizeAnswerFromIce(sdp, video_codec || 'H264')
    } else {
      remoteSdp = sdp
    }

    await this.pc.setRemoteDescription({ 
      type: (type || "answer"), 
      sdp: remoteSdp 
    })

    // Send stream update with current SSRCs
    this._buildAndSendInitialStreamUpdate()
    this.events.emit("sessionDescription", data)
  }

  /**
   * Start WebRTC peer connection and create offer
   */
  async _startWebRTCAndOffer() {
    if (this._madeOffer) return

    try {
      // 1) Create peer connection with no STUN/TURN (Discord handles this)
      this.pc = new RTCPeerConnection({ 
        iceServers: [],
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      })

      // Set up event handlers
      this.pc.onconnectionstatechange = () => {
        console.log("[Voice] Connection state:", this.pc.connectionState)
        this.events.emit("pc:connectionstate", this.pc.connectionState)
      }
      
      this.pc.oniceconnectionstatechange = () => {
        console.log("[Voice] ICE connection state:", this.pc.iceConnectionState)
        this.events.emit("pc:ice", this.pc.iceConnectionState)
      }
      
      this.pc.ontrack = (ev) => {
        console.log("[Voice] Remote track received:", ev.track.kind)
        if (ev.track.kind === 'audio') {
          this._attachRemoteAudio(ev.track, ev.streams)
        }
        this.events.emit("pc:track", ev)
      }

      // 2) Add transceivers in correct order (audio first, then video)
      const aTx = this.pc.addTransceiver('audio', { 
        direction: 'sendonly',
        streams: []
      })
      
      const vTx = this.pc.addTransceiver('video', { 
        direction: 'sendonly',
        streams: []
      })

      // 3) Get user media with optimized settings for Discord
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true, 
            autoGainControl: true,
            sampleRate: 48000, // Discord uses 48kHz
            channelCount: 2,
            latency: 0.02 // Low latency for real-time
          },
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: 'user'
          }
        })
        
        const [aTrack] = this.localStream.getAudioTracks()
        const [vTrack] = this.localStream.getVideoTracks()
        
        if (aTrack) {
          await aTx.sender.replaceTrack(aTrack)
          console.log("[Voice] Audio track attached")
        }
        
        if (vTrack) {
          await vTx.sender.replaceTrack(vTrack)
          console.log("[Voice] Video track attached")
        }
        
        console.log("[Voice] Media tracks attached successfully")
      } catch (err) {
        console.warn("[Voice] getUserMedia failed, proceeding without tracks:", err)
      }

      // 4) Create and set local offer
      const offer = await this.pc.createOffer({ 
        offerToReceiveAudio: false, 
        offerToReceiveVideo: false 
      })
      await this.pc.setLocalDescription(offer)

      // 5) Extract protocol information from SDP
      const sdp = this.pc.localDescription?.sdp
      if (!sdp) throw new Error("No localDescription SDP")
      
      const fragment = this._buildSelectProtocolFragment(sdp)

      // 6) Send select protocol message to Discord
      const payload = {
        protocol: "webrtc",
        data: fragment,
        sdp: fragment,
        codecs: this._getCodecList(),
        rtc_connection_id: this.rtcConnectionId
      }

      console.log("[Voice] Sending SelectProtocol")
      this.send(BreadVoiceHandler.OPCODES.SELECT_PROTOCOL, payload)
      this._madeOffer = true
      this.events.emit("offerSent", fragment)

    } catch (error) {
      console.error("[Voice] WebRTC setup failed:", error)
      this.events.emit("error", error)
    }
  }

  /**
   * Get codec list for Discord
   */
  _getCodecList() {
    return [
      { name: "opus", type: "audio", priority: 1000, payload_type: 111, rtx_payload_type: null },
      { name: "H264", type: "video", priority: 1000, payload_type: 103, rtx_payload_type: 104 },
      { name: "VP8",  type: "video", priority: 2000, payload_type: 96,  rtx_payload_type: 97  },
      { name: "VP9",  type: "video", priority: 3000, payload_type: 98,  rtx_payload_type: 99  }
    ]
  }

  /**
   * Build select protocol fragment from SDP
   */
  _buildSelectProtocolFragment(fullSdp) {
    const lines = fullSdp.replace(/\r/g, '').split('\n').filter(Boolean)
    const pick = (re) => lines.find(l => re.test(l))
    const pickAll = (re) => lines.filter(l => re.test(l))
    const keep = []

    // 1) extmap-allow-mixed
    const extmapAllowMixed = pick(/^a=extmap-allow-mixed$/)
    if (extmapAllowMixed) keep.push(extmapAllowMixed)

    // 2) ICE credentials and options
    const iceUfrag = pick(/^a=ice-ufrag:/)
    const icePwd = pick(/^a=ice-pwd:/)
    const iceOpts = pick(/^a=ice-options:/)
    if (iceUfrag) keep.push(iceUfrag)
    if (icePwd) keep.push(icePwd)
    if (iceOpts) keep.push(iceOpts)

    // 3) Fingerprint
    const fingerprint = pick(/^a=fingerprint:sha-256 /)
    if (fingerprint) keep.push(fingerprint)

    // 4) Extension maps (Discord specific IDs)
    const extmapIds = new Set([1,2,3,4,5,6,7,8,10,11,13,14])
    const extmaps = pickAll(/^a=extmap:\d+\s/).filter(l => {
      const m = l.match(/^a=extmap:(\d+)\s/)
      return m && extmapIds.has(Number(m[1]))
    })
    keep.push(...extmaps)

    // 5) RTP mappings for essential codecs
    const opus = pick(/^a=rtpmap:111\s+opus\/48000\/2$/)
    const vp8  = pick(/^a=rtpmap:96\s+VP8\/90000$/)
    const rtx  = pick(/^a=rtpmap:97\s+rtx\/90000$/)
    if (opus) keep.push(opus)
    if (vp8) keep.push(vp8)
    if (rtx) keep.push(rtx)

    return keep.join('\n')
  }

  /**
   * Extract SSRCs from SDP
   */
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
        if (fid) { 
          out.video = Number(fid[1])
          out.rtx = Number(fid[2]) 
        } else if (any) { 
          out.video = Number(any[1]) 
        }
      }
    }
    return out
  }

  /**
   * Build and send initial stream update to Discord
   */
  _buildAndSendInitialStreamUpdate() {
    const ssrcs = this._extractSSRCs(this.pc?.localDescription?.sdp || "")
    this._currentSSRCs = ssrcs
    
    const payload = {
      audio_ssrc: ssrcs.audio || 0,
      video_ssrc: ssrcs.video || 0,
      rtx_ssrc: ssrcs.rtx || 0,
      streams: [{
        type: "video",
        rid: "100",
        ssrc: ssrcs.video || 0,
        active: this._streamActive,
        quality: 100,
        rtx_ssrc: ssrcs.rtx || 0,
        max_bitrate: 2500000,
        max_framerate: 30,
        max_resolution: { type: "fixed", width: 1280, height: 720 }
      }]
    }
    
    console.log("[Voice] Sending stream update:", payload)
    this.send(BreadVoiceHandler.OPCODES.STREAM_UPDATE, payload)
  }

  /**
   * Parse server ICE fragment
   */
  _parseServerIceFragment(fragment) {
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

  /**
   * Find payload types from local offer
   */
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
        const pt = Number(m[1])
        const codec = m[2].toUpperCase()
        ptByCodec[codec] = ptByCodec[codec] || []
        ptByCodec[codec].push(pt)
      }
    }
    return { mPayloads, ptByCodec }
  }

  /**
   * Synthesize SDP answer from ICE fragment
   */
  _synthesizeAnswerFromIce(fragment, preferVideo = 'H264') {
    if (!this.pc?.localDescription?.sdp) {
      throw new Error('No local offer SDP to base answer on')
    }
    
    const offer = this.pc.localDescription.sdp
    const ice = this._parseServerIceFragment(fragment)

    // Get media IDs from our offer
    const mids = [...offer.matchAll(/^a=mid:(.+)$/mg)].map(m => m[1])
    const audioMid = mids.find(Boolean) ?? '0'
    const videoMid = mids.length > 1 ? mids[1] : '1'

    // Get payload types
    const { ptByCodec: ptA } = this._offerPayloadTypes('audio', offer)
    const opusPT = (ptA['OPUS'] || [111])[0]

    const { ptByCodec: ptV } = this._offerPayloadTypes('video', offer)
    const prefer = preferVideo?.toUpperCase() || 'H264'
    const chosenVideoPT = (ptV[prefer] || ptV['VP8'] || [96])[0]

    // Find RTX for chosen video codec
    const aptMatch = offer.match(new RegExp(`^a=fmtp:(\\d+)\\s+apt=${chosenVideoPT}$`, 'm'))
    const rtxPT = aptMatch ? Number(aptMatch[1]) : null

    // Copy codec lines from offer
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
    const bundleMids = [audioMid, videoMid].filter(Boolean).join(' ')
    const candLines = ice.candidates.length ? ice.candidates.join('\n') + '\n' : ''

    const sdp = `v=0
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

  /**
   * Clean up peer connection
   */
  _teardownPeer() {
    // Clear reconnect timeout
    if (this._reconnectTimeout) {
      clearTimeout(this._reconnectTimeout)
      this._reconnectTimeout = null
    }
    
    try {
      if (this.pc) {
        this.pc.onicecandidate = null
        this.pc.ontrack = null
        this.pc.onconnectionstatechange = null
        this.pc.oniceconnectionstatechange = null
        this.pc.close()
      }
    } catch (err) {
      console.warn("[Voice] Error tearing down peer connection:", err)
    }
    
    this.pc = null
    this._madeOffer = false
    this._streamActive = false
    
    try { 
      this.localStream?.getTracks()?.forEach(t => t.stop()) 
    } catch (err) {
      console.warn("[Voice] Error stopping local tracks:", err)
    }
    this.localStream = null
  }

  /**
   * Start heartbeat timer
   */
  startHeartbeat(intervalMs) {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      this.send(BreadVoiceHandler.OPCODES.HEARTBEAT, { 
        t: now, 
        seq_ack: this.lastServerSeq 
      })
      this.events.emit("heartbeat", now)
    }, intervalMs)
    console.log("[Voice] Heartbeat started with interval:", intervalMs)
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
      console.log("[Voice] Heartbeat stopped")
    }
  }

  /**
   * Send ping to Discord voice server
   */
  ping(seq = Math.floor(Math.random() * 1e9)) {
    this.send(BreadVoiceHandler.OPCODES.PING, { any: 1, seq })
    return seq
  }

  /**
   * Send stream update to Discord
   */
  sendStreamUpdate(update = {}) {
    const video_ssrc = update.video_ssrc ?? this._currentSSRCs.video ?? 0
    const rtx_ssrc   = update.rtx_ssrc   ?? this._currentSSRCs.rtx   ?? 0
    const audio_ssrc = update.audio_ssrc ?? this._currentSSRCs.audio ?? 0

    const payload = {
      audio_ssrc,
      video_ssrc,
      rtx_ssrc,
      streams: update.streams ?? [{
        type: "video",
        rid: "100",
        ssrc: video_ssrc,
        active: update.active ?? this._streamActive,
        quality: 100,
        rtx_ssrc: rtx_ssrc,
        max_bitrate: 2500000,
        max_framerate: 30,
        max_resolution: { type: "fixed", width: 1280, height: 720 }
      }]
    }
    
    this.send(BreadVoiceHandler.OPCODES.STREAM_UPDATE, payload)
  }

  /**
   * Send speaking state to Discord
   */
  setSpeaking(speaking = true, soundshare = false) {
    let flags = 0
    if (speaking) flags |= 1 << 0      // MICROPHONE
    if (soundshare) flags |= 1 << 1    // SOUNDSHARE
    
    const payload = {
      speaking: flags,
      delay: 0,
      ssrc: this._currentSSRCs.audio || 0
    }
    
    this.send(BreadVoiceHandler.OPCODES.SPEAKING, payload)
  }

  /**
   * Enable/disable video stream
   */
  setVideoEnabled(enabled = true) {
    if (!this.localStream) return false
    
    const videoTracks = this.localStream.getVideoTracks()
    videoTracks.forEach(track => {
      track.enabled = enabled
    })
    
    this.sendStreamUpdate({ active: enabled })
    return true
  }

  /**
   * Enable/disable audio stream  
   */
  setAudioEnabled(enabled = true) {
    if (!this.localStream) return false
    
    const audioTracks = this.localStream.getAudioTracks()
    audioTracks.forEach(track => {
      track.enabled = enabled
    })
    
    this.setSpeaking(enabled)
    return true
  }

  /**
   * Set stream active state
   */
  setStreamActive(active) {
    this._streamActive = active
    this.sendStreamUpdate({ active })
  }

  /**
   * Get current connection state
   */
  getConnectionState() {
    return {
      wsState: this.ws?.readyState,
      pcState: this.pc?.connectionState,
      iceState: this.pc?.iceConnectionState,
      streamActive: this._streamActive,
      ssrcs: this._currentSSRCs
    }
  }
}

/** Global state for voice connection */
let guild_id, channel_id, session_id
let voiceHandler

/**
 * Connect to a Discord voice channel
 */
async function connect(guild, channel) {
  console.log("[Voice] Connecting to guild:", guild, "channel:", channel)
  guild_id = guild
  channel_id = channel
  
  // Send voice state update to Discord gateway
  BreadAPI.gateway.send({
    op: 4,
    d: { 
      guild_id, 
      channel_id, 
      self_mute: false, 
      self_deaf: false, 
      self_video: false, 
      flags: 0 
    }
  })
}

/**
 * Disconnect from current voice channel
 */
async function disconnect() {
  console.log("[Voice] Disconnecting")
  
  if (voiceHandler) {
    voiceHandler._teardownPeer()
    voiceHandler.stopHeartbeat()
    if (voiceHandler.ws) voiceHandler.ws.close()
    voiceHandler = null
  }
  
  // Send disconnect to gateway
  if (guild_id) {
    BreadAPI.gateway.send({
      op: 4,
      d: { 
        guild_id, 
        channel_id: null, 
        self_mute: false, 
        self_deaf: false, 
        self_video: false, 
        flags: 0 
      }
    })
  }
  
  guild_id = null
  channel_id = null
  session_id = null
}

/**
 * Listen for Discord gateway events
 */
BreadAPI.gateway.on_message((data) => {
  if (data.t === "READY") {
    session_id = data.d.session_id
    console.log("[Voice] Got session ID:", session_id)
  }
  
  if (data.t === "VOICE_SERVER_UPDATE") {
    console.log("[Voice] Voice server update:", data.d)
    
    // Create new voice handler
    voiceHandler = new BreadVoiceHandler({
      guildId: guild_id,
      channelId: channel_id,
      userId: BreadCache.user.id
    })
    
    // Set up event listeners
    voiceHandler.events.on("ready", () => {
      console.log("[Voice] Voice connection ready")
    })
    
    voiceHandler.events.on("error", (error) => {
      console.error("[Voice] Voice connection error:", error)
    })
    
    voiceHandler.events.on("pc:connectionstate", (state) => {
      console.log("[Voice] WebRTC connection state:", state)
    })
    
    // Connect to voice server
    voiceHandler.openVoiceConnection(data.d.endpoint, data.d.token, session_id)
  }
})

/**
 * Public API for Breadcord Voice
 */
class BreadVoiceAPI {
  static connect = connect
  static disconnect = disconnect
  
  static getCurrentHandler() {
    return voiceHandler
  }
  
  static isConnected() {
    return voiceHandler && voiceHandler.isOpen
  }
  
  static getConnectionState() {
    return voiceHandler?.getConnectionState() || null
  }
  
  static setStreamActive(active) {
    return voiceHandler?.setStreamActive(active)
  }
  
  static enableMicMonitor(enabled, gain) {
    return voiceHandler?.enableMicMonitor(enabled, gain)
  }
  
  static resumeAudio() {
    return voiceHandler?.resumeAudio()
  }
  
  static setSpeaking(speaking, soundshare) {
    return voiceHandler?.setSpeaking(speaking, soundshare)
  }
  
  static setVideoEnabled(enabled) {
    return voiceHandler?.setVideoEnabled(enabled)
  }
  
  static setAudioEnabled(enabled) {
    return voiceHandler?.setAudioEnabled(enabled)
  }
  
  static sendStreamUpdate(update) {
    return voiceHandler?.sendStreamUpdate(update)
  }
  
  // Utility methods for easier use
  static mute() {
    return this.setAudioEnabled(false)
  }
  
  static unmute() {
    return this.setAudioEnabled(true)
  }
  
  static enableVideo() {
    return this.setVideoEnabled(true)
  }
  
  static disableVideo() {
    return this.setVideoEnabled(false)
  }
}

// Export to global scope
window.BreadVoiceAPI = BreadVoiceAPI
console.log("[Voice] Breadcord Voice API loaded")