# Breadcord Voice Plugin

A complete implementation of Discord's User Voice API for the Breadcord client. This plugin provides WebRTC-based voice and video communication capabilities that are compatible with Discord's user account voice system.

## Features

### Core Voice Functionality
- **WebRTC Voice Connection**: Full WebRTC implementation for Discord voice channels
- **Audio/Video Support**: Send and receive both audio and video streams
- **User Voice API**: Implements Discord's user voice protocol (different from bot voice API)
- **Auto-reconnection**: Automatic reconnection with exponential backoff
- **Error Recovery**: Robust error handling and connection state management

### Audio Features
- **High-Quality Audio**: 48kHz stereo audio with noise suppression
- **Microphone Monitoring**: Local audio feedback with adjustable gain
- **Speaking Detection**: Automatic speaking state management
- **Mute/Unmute Controls**: Easy audio control methods

### Video Features
- **HD Video Support**: Up to 1280x720 video streaming
- **Video Controls**: Enable/disable video streaming
- **Codec Support**: H.264, VP8, and VP9 video codecs
- **Stream Management**: Dynamic stream activation and configuration

### Advanced Features
- **SSRC Management**: Proper synchronization source handling
- **ICE/SDP Processing**: Full ICE candidate and SDP negotiation
- **Connection Monitoring**: Real-time connection state tracking
- **Protocol Compliance**: Follows Discord's user voice specification

## API Reference

### Connection Management

#### `BreadVoiceAPI.connect(guildId, channelId)`
Connect to a voice channel.
```javascript
await BreadVoiceAPI.connect("123456789", "987654321");
```

#### `BreadVoiceAPI.disconnect()`
Disconnect from the current voice channel.
```javascript
await BreadVoiceAPI.disconnect();
```

#### `BreadVoiceAPI.isConnected()`
Check if currently connected to a voice channel.
```javascript
const connected = BreadVoiceAPI.isConnected();
```

#### `BreadVoiceAPI.getConnectionState()`
Get detailed connection state information.
```javascript
const state = BreadVoiceAPI.getConnectionState();
// Returns: { wsState, pcState, iceState, streamActive, ssrcs }
```

### Audio Controls

#### `BreadVoiceAPI.mute()` / `BreadVoiceAPI.unmute()`
Control microphone muting.
```javascript
BreadVoiceAPI.mute();    // Mute microphone
BreadVoiceAPI.unmute();  // Unmute microphone
```

#### `BreadVoiceAPI.setAudioEnabled(enabled)`
Enable or disable audio transmission.
```javascript
BreadVoiceAPI.setAudioEnabled(true);  // Enable audio
BreadVoiceAPI.setAudioEnabled(false); // Disable audio
```

#### `BreadVoiceAPI.enableMicMonitor(enabled, gain)`
Enable local microphone monitoring.
```javascript
BreadVoiceAPI.enableMicMonitor(true, 0.3);  // Enable with 30% gain
BreadVoiceAPI.enableMicMonitor(false);       // Disable
```

#### `BreadVoiceAPI.setSpeaking(speaking, soundshare)`
Set speaking state.
```javascript
BreadVoiceAPI.setSpeaking(true);        // Speaking with microphone
BreadVoiceAPI.setSpeaking(true, true);  // Speaking with soundshare
```

### Video Controls

#### `BreadVoiceAPI.enableVideo()` / `BreadVoiceAPI.disableVideo()`
Control video streaming.
```javascript
BreadVoiceAPI.enableVideo();   // Start video stream
BreadVoiceAPI.disableVideo();  // Stop video stream
```

#### `BreadVoiceAPI.setVideoEnabled(enabled)`
Enable or disable video transmission.
```javascript
BreadVoiceAPI.setVideoEnabled(true);   // Enable video
BreadVoiceAPI.setVideoEnabled(false);  // Disable video
```

### Advanced Controls

#### `BreadVoiceAPI.setStreamActive(active)`
Control stream activation state.
```javascript
BreadVoiceAPI.setStreamActive(true);   // Activate stream
BreadVoiceAPI.setStreamActive(false);  // Deactivate stream
```

#### `BreadVoiceAPI.sendStreamUpdate(update)`
Send custom stream update.
```javascript
BreadVoiceAPI.sendStreamUpdate({
  active: true,
  video_ssrc: 12345,
  audio_ssrc: 67890
});
```

#### `BreadVoiceAPI.resumeAudio()`
Resume audio playback (for autoplay policy compliance).
```javascript
// Call after user interaction to enable audio
BreadVoiceAPI.resumeAudio();
```

#### `BreadVoiceAPI.getCurrentHandler()`
Get the current voice handler instance for advanced usage.
```javascript
const handler = BreadVoiceAPI.getCurrentHandler();
if (handler) {
  handler.events.on("pc:connectionstate", (state) => {
    console.log("Connection state:", state);
  });
}
```

## Events

The voice handler emits several events that can be listened to:

```javascript
const handler = BreadVoiceAPI.getCurrentHandler();
if (handler) {
  handler.events.on("open", () => console.log("Voice connection opened"));
  handler.events.on("close", () => console.log("Voice connection closed"));
  handler.events.on("error", (error) => console.error("Voice error:", error));
  handler.events.on("ready", () => console.log("Voice ready"));
  handler.events.on("pc:connectionstate", (state) => console.log("WebRTC state:", state));
  handler.events.on("pc:ice", (state) => console.log("ICE state:", state));
  handler.events.on("pc:track", (event) => console.log("Remote track:", event));
}
```

## Implementation Details

### Discord User Voice API Differences
This implementation follows Discord's user voice API, which differs from the bot voice API in several ways:
- Uses WebRTC instead of UDP voice packets
- Supports video streaming
- Different authentication and session management
- Enhanced codec negotiation
- Real-time stream updates

### Supported Codecs
- **Audio**: Opus (48kHz, stereo)
- **Video**: H.264 (preferred), VP8, VP9
- **RTX**: Retransmission support for video

### Connection Flow
1. Send voice state update to Discord gateway
2. Receive voice server update with endpoint and token
3. Connect to voice WebSocket
4. Perform WebRTC offer/answer exchange
5. Establish media streams
6. Send stream updates and speaking states

### Error Handling
- Automatic reconnection with exponential backoff
- Graceful degradation when media devices unavailable
- ICE connection failure recovery
- WebSocket error handling

## Browser Compatibility

This plugin requires modern browser features:
- WebRTC support (RTCPeerConnection)
- Media Stream API (getUserMedia)
- WebSocket support
- Audio/Video codec support

## Security Considerations

- Media permissions required for microphone/camera access
- Secure WebSocket connections (WSS)
- No credentials stored in plugin code
- Proper cleanup of media resources