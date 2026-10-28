"""Checks the bundled presets: every case of sound has a valid, short, not-too-loud .wav in each of them.

Run: python tests/presets.test.py
"""
import glob
import os
import re
import sys
import wave

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
names = re.findall(r"\{ name: '([a-z-]+)', by:", open(os.path.join(ROOT, 'hooks', 'sounds.ts'), encoding='utf-8').read())
failures = []

if len(names) != 16:
    failures.append(f'expected 16 cases in hooks/sounds.ts, found {len(names)}')

presets = sorted(p for p in glob.glob(os.path.join(ROOT, 'presets', '*')) if os.path.isdir(p))
if len(presets) < 2:
    failures.append('there must be at least two bundled presets')

for preset in presets:
    label = os.path.basename(preset)
    files = sorted(os.listdir(preset))
    if files != sorted(n + '.wav' for n in names):
        failures.append(f'{label}: files differ from the cases: {sorted(set(files) ^ {n + ".wav" for n in names})}')
        continue
    for f in files:
        path = os.path.join(preset, f)
        try:
            with wave.open(path) as w:
                seconds = w.getnframes() / w.getframerate()
                data = w.readframes(w.getnframes())
                width, channels = w.getsampwidth(), w.getnchannels()
        except Exception as e:  # not a WAV at all
            failures.append(f'{label}/{f}: not a WAV ({e})')
            continue
        peak = max((abs(int.from_bytes(data[i:i + 2], 'little', signed=True)) for i in range(0, len(data), 2)), default=0) / 32768
        if width != 2 or channels != 1:
            failures.append(f'{label}/{f}: expected 16-bit mono')
        if not 0.05 <= seconds <= 2.0:
            failures.append(f'{label}/{f}: {seconds:.2f}s is not between 0.05 and 2 seconds')
        if not 0.1 <= peak <= 0.6:
            failures.append(f'{label}/{f}: peak {peak:.2f} is not between 0.1 and 0.6')

print(f'{len(presets)} presets, {len(names)} sounds each' if not failures else '\n'.join(failures))
sys.exit(1 if failures else 0)
