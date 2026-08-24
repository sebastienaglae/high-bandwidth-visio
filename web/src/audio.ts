// Subtle UI sound cues, synthesized with WebAudio (no asset downloads).

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, at: number, dur: number, gainValue: number): void {
  const ac = audioContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t = ac.currentTime + at;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(gainValue, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export type Cue = "join" | "leave" | "mute" | "unmute";

export function playCue(kind: Cue): void {
  switch (kind) {
    case "join":
      blip(587, 0, 0.12, 0.05);
      blip(880, 0.1, 0.18, 0.05);
      break;
    case "leave":
      blip(587, 0, 0.12, 0.04);
      blip(392, 0.1, 0.2, 0.04);
      break;
    case "mute":
      blip(330, 0, 0.09, 0.05);
      break;
    case "unmute":
      blip(520, 0, 0.09, 0.05);
      break;
  }
}
