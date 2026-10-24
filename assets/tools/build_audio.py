#!/usr/bin/env python3
"""
Generates NASJ's original sound effects + ambient loop (pure synthesis, no third-party samples,
so there are no licensing concerns). Output: frontend/public/audio/{effects,music}/*.wav

These are SYNTHESISED sounds. They are not recordings and not "AI-generated voice".
Spoken pronunciation/narration files (audio/fr/..., audio/ar/...) must be recorded by voice
talent and dropped into frontend/public/audio following frontend/public/audio/README.md.
"""
import math
import os
import struct
import wave

import numpy as np

SR = 22050
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "frontend", "public", "audio")


def note(freq, dur, vol=0.5, kind="soft", attack=0.01, release=0.12):
    t = np.arange(int(SR * dur)) / SR
    if kind == "soft":      # warm bell-ish: fundamental + gentle overtones
        w = np.sin(2 * math.pi * freq * t) + 0.35 * np.sin(2 * math.pi * freq * 2 * t) + 0.12 * np.sin(2 * math.pi * freq * 3 * t)
        w *= np.exp(-3.2 * t / max(dur, 0.05))
    elif kind == "pad":
        w = np.sin(2 * math.pi * freq * t) + 0.5 * np.sin(2 * math.pi * freq * 1.003 * t) + 0.25 * np.sin(2 * math.pi * freq * 0.5 * t)
    else:
        w = np.sin(2 * math.pi * freq * t)
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release)
    return (w * env * vol).astype(np.float32)


def mix(parts, total=None):
    n = total or max(int(o * SR) + len(s) for o, s in parts)
    out = np.zeros(n, np.float32)
    for off, s in parts:
        i = int(off * SR)
        out[i:i + len(s)] += s[: max(0, n - i)]
    return out


def save(name, data, folder="effects"):
    data = data / max(1e-6, np.max(np.abs(data))) * 0.8
    path = os.path.join(OUT, folder)
    os.makedirs(path, exist_ok=True)
    with wave.open(os.path.join(path, name + ".wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(b"".join(struct.pack("<h", int(x * 32767)) for x in data))


C5, D5, E5, G5, A5, C6, E6, G6 = 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1318.5, 1568.0

# short tap
save("click", mix([(0, note(880, 0.09, 0.5, "soft", 0.004, 0.06))]))
# correct: rising major third, friendly
save("correct", mix([(0, note(C5, 0.22, 0.55)), (0.11, note(E5, 0.22, 0.55)), (0.22, note(G5, 0.4, 0.6))]))
# try again: soft, non-punishing two-note fall (kept gentle for young children)
save("try-again", mix([(0, note(E5, 0.22, 0.4)), (0.16, note(C5, 0.4, 0.4))]))
# reward: sparkling arpeggio
save("reward", mix([(i * 0.09, note(f, 0.5, 0.45)) for i, f in enumerate([C5, E5, G5, C6, E6, G6])] + [(0.55, note(C6, 0.9, 0.35))]))
# thread weave swish
rng = np.random.default_rng(7)
t = np.arange(int(SR * 0.35)) / SR
noise = rng.normal(0, 1, len(t)).astype(np.float32)
k = np.ones(40) / 40
swish = np.convolve(noise, k, "same") * np.sin(math.pi * t / t[-1]) ** 2 * 0.5
save("weave", mix([(0, swish.astype(np.float32)), (0.18, note(A5, 0.25, 0.3))]))
# welcome chime
save("welcome", mix([(0, note(G5, 0.3, 0.45)), (0.18, note(C6, 0.3, 0.45)), (0.36, note(E6, 0.7, 0.5))]))

# ---- ambient loop (C - Am - F - G), ~21s, seamless-ish
bpm = 90
beat = 60 / bpm
chords = [([261.63, 329.63, 392.0], [C5, E5, G5, E5]), ([220.0, 261.63, 329.63], [A5 / 2 * 2, C5, E5, C5]),
          ([174.61, 220.0, 261.63], [440.0, A5, C6, A5]), ([196.0, 246.94, 293.66], [G5, 587.33, 493.88, 587.33])]
parts = []
for ci, (pad, arp) in enumerate(chords * 2):
    start = ci * 4 * beat
    for f in pad:
        parts.append((start, note(f, 4 * beat, 0.10, "pad", 0.6, 1.0)))
    for bi in range(8):
        parts.append((start + bi * beat / 2, note(arp[bi % 4], beat * 1.2, 0.16, "soft", 0.01, 0.2)))
loop = mix(parts, int(8 * 4 * beat * SR))
# gentle echo for warmth
echo = np.zeros_like(loop)
d = int(0.28 * SR)
echo[d:] = loop[:-d] * 0.35
loop = loop + echo
save("ambient", loop * 0.6, "music")
print("audio written to", OUT)
