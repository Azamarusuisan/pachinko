export class PlayAudio {
    context = null;
    lastNailAt = -Infinity;
    silentUntil = -Infinity;
    unlock() {
        this.context ??= new AudioContext();
        if (this.context.state === "suspended")
            void this.context.resume();
    }
    launch() { this.tone(150, 0.045, 0.045, "triangle", 80); }
    nail() {
        const now = performance.now();
        if (now - this.lastNailAt < 18)
            return;
        this.lastNailAt = now;
        this.tone(1500, 0.018, 0.018, "square", -500);
    }
    pocket() { this.chord([660, 880, 1100], 0.13, 0.045); }
    out() { this.tone(105, 0.08, 0.025, "sine", -45); }
    rush() { this.chord([392, 523.25, 659.25, 783.99], 0.45, 0.06); }
    storyAlarm() { this.sequence([[190, .12], [190, .12], [285, .2]], 120, "sawtooth"); }
    storyLaunch() { this.tone(70, .65, .075, "sawtooth", 850); window.setTimeout(() => this.noise(.32, .075), 180); }
    storyImpact() { this.noise(.22, .09); this.tone(55, .38, .1, "square", -20); }
    storySync() { this.sequence([[330, .12], [440, .12], [660, .16], [990, .25]], 85, "triangle"); }
    storyStrike() { this.noise(.42, .13); this.chord([110, 220, 440, 880], .48, .055); }
    kyuin() {
        this.tone(1320, 0.28, 0.075, "sine", 1320);
        window.setTimeout(() => this.tone(1760, 0.42, 0.065, "sine", 1760), 155);
        window.setTimeout(() => this.tone(3520, 0.32, 0.03, "sine", -900), 330);
    }
    normal() { this.chord([523.25, 392], 0.2, 0.035); }
    silence(milliseconds) { this.silentUntil = performance.now() + milliseconds; }
    dispose() { if (this.context !== null)
        void this.context.close(); this.context = null; }
    tone(frequency, duration, gainValue, type, sweep) {
        const context = this.context;
        if (context === null || context.state !== "running" || performance.now() < this.silentUntil)
            return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + sweep), now + duration);
        gain.gain.setValueAtTime(gainValue, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }
    chord(frequencies, duration, gain) {
        frequencies.forEach((frequency, index) => window.setTimeout(() => this.tone(frequency, duration, gain, "sine", frequency * 0.08), index * 45));
    }
    sequence(notes, delay, type) {
        notes.forEach(([frequency, duration], index) => window.setTimeout(() => this.tone(frequency, duration, .05, type, frequency * .18), index * delay));
    }
    noise(duration, gainValue) {
        const context = this.context;
        if (context === null || context.state !== "running" || performance.now() < this.silentUntil)
            return;
        const length = Math.ceil(context.sampleRate * duration);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < length; index += 1)
            data[index] = Math.random() * 2 - 1;
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        const now = context.currentTime;
        source.buffer = buffer;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1800, now);
        gain.gain.setValueAtTime(gainValue, now);
        gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(now);
    }
}
//# sourceMappingURL=PlayAudio.js.map