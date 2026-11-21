// Send roughly 32 ms per message. The input node has one mixed-down mono channel.
class RoomMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.032);
    this.frame = new Float32Array(this.size);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.frame[this.offset++] = sample;
      if (this.offset === this.size) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(this.size);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('room-mic', RoomMic);
