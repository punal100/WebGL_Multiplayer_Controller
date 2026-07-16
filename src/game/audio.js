// Audio manager. Uses the WebAudio API to synthesize all SFX + a looping BGM
// track at runtime — no binary asset files required, so it always ships cleanly.
//
// Supports overlapping channels, a master gain, and volume ducking: a loud
// explosion briefly lowers the BGM so the mix stays clean (per the audio spec).
//
// The manager is driven by the same engine event bus as the VFX layer. It must
// be unlocked by a user gesture (browsers block audio until then). Call
// `audio.unlock()` from a click/keydown.

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.bgmBus = null;
    this.bgmTimer = null;
    this.enabled = true;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.bgmBus = this.ctx.createGain();
    this.bgmBus.gain.value = 0.18;
    this.bgmBus.connect(this.master);

    this.unlocked = true;
    this.startBGM();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.8 : 0;
  }

  // --- Low-level voice ---
  _blip({ type = 'sine', freq = 440, dur = 0.1, gain = 0.4, bus = this.sfxBus, freqEnd, attack = 0.005, decay = null }) {
    if (!this.unlocked || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    osc.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + (decay || dur) + 0.02);
  }

  _noise({ dur = 0.2, gain = 0.4, filterFreq = 1200, bus = this.sfxBus }) {
    if (!this.unlocked || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(flt); flt.connect(g); g.connect(bus);
    src.start(t);
  }

  // --- Event-driven SFX (consumed from the same event bus as VFX) ---
  handleEvents(events) {
    if (!this.unlocked || !this.enabled) return;
    for (const e of events || []) {
      switch (e.type) {
        case 'sfx_shoot':
          this._blip({ type: 'square', freq: 220 * (e.pitch || 1), freqEnd: 60, dur: 0.18, gain: 0.5, decay: 0.22 });
          this._noise({ dur: 0.08, gain: 0.25, filterFreq: 2200 });
          break;
        case 'sfx_explosion':
          this.explosion();
          break;
        case 'sfx_ricochet':
          this._blip({ type: 'triangle', freq: 880, freqEnd: 1400, dur: 0.06, gain: 0.22 });
          break;
        case 'sfx_deploy':
          this._blip({ type: 'sawtooth', freq: 160, freqEnd: 320, dur: 0.12, gain: 0.3 });
          break;
        default:
          break;
      }
    }
  }

  explosion() {
    this._noise({ dur: 0.5, gain: 0.6, filterFreq: 800 });
    this._blip({ type: 'sine', freq: 120, freqEnd: 30, dur: 0.5, gain: 0.5, decay: 0.55 });
    this.duck();
  }

  // Brief BGM duck so loud booms read clearly.
  duck() {
    if (!this.bgmBus) return;
    const t = this.ctx.currentTime;
    this.bgmBus.gain.cancelScheduledValues(t);
    this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, t);
    this.bgmBus.gain.linearRampToValueAtTime(0.05, t + 0.02);
    this.bgmBus.gain.linearRampToValueAtTime(0.18, t + 0.45);
  }

  // --- Looping aggressive arcade BGM (synthesized) ---
  startBGM() {
    if (!this.unlocked || this.bgmTimer) return;
    // A driving bass + arpeggio loop scheduled with the audio clock.
    const scale = [110, 130.81, 146.83, 164.81, 196, 164.81, 146.83, 130.81];
    let step = 0;
    const stepMs = 180;
    const tick = () => {
      if (!this.unlocked || !this.enabled) { return; }
      const root = scale[step % scale.length];
      // Bass pulse
      this._blip({ type: 'sawtooth', freq: root / 2, dur: 0.16, gain: 0.18, bus: this.bgmBus });
      // Lead arpeggio
      this._blip({ type: 'square', freq: root * 2, dur: 0.1, gain: 0.07, bus: this.bgmBus });
      if (step % 2 === 0) this._noise({ dur: 0.04, gain: 0.04, filterFreq: 4000, bus: this.bgmBus });
      step++;
    };
    this.bgmTimer = setInterval(tick, stepMs);
  }

  stopBGM() {
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
  }
}

export const audio = new AudioManager();
export default AudioManager;
