"""Writes the two bundled presets (presets/soft and presets/retro) as 16-bit mono WAV files.

No dependencies: python tools/make-sounds.py. The sounds are synthesized here, so they carry no
third-party licence; edit the SOUNDS table and run it again to change them.
"""
import math
import os
import struct
import wave

RATE = 22050
PEAK = 0.45  # fraction of full scale: loud enough to notice, not enough to startle

SEMITONE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def hz(note):
    """'A4' is 440; a 'b' after the letter lowers it ('Eb4')."""
    letter, rest = note[0], note[1:]
    flat = rest.startswith('b')
    octave = int(rest[1:] if flat else rest)
    n = SEMITONE[letter] - (1 if flat else 0) + 12 * (octave - 4) - 9
    return 440.0 * 2 ** (n / 12)


# Every sound is a list of (note, seconds); None is a rest. The names are the cases of the plugin.
SOUNDS = {
    'done': [('C5', .11), ('E5', .11), ('G5', .11), ('C6', .45)],
    'success': [('C5', .11), ('G5', .42)],
    'question': [('E5', .15), ('B5', .45)],
    'permission': [('A5', .09), (None, .06), ('A5', .09), (None, .0), ('E6', .25)],
    'plan': [('C5', .1), ('E5', .1), ('G5', .1), ('B5', .1), ('E6', .45)],
    'task-done': [('C6', .07), ('E6', .2)],
    'agent-done': [('G5', .3)],
    'tests-pass': [('C5', .07), ('E5', .07), ('G5', .07), ('C6', .07), ('E6', .35)],
    'tests-fail': [('G4', .2), ('Eb4', .55)],
    'error': [('Eb4', .15), ('A3', .6)],
    'limit-5h': [('A5', .12), (None, .1), ('A5', .12), (None, .1), ('A5', .12)],
    'limit-week': [('D5', .2), ('F5', .2), ('D5', .35)],
    'limit': [('G5', .25), ('Eb5', .25), ('C5', .6)],
    'context-full': [('G4', .14), ('C6', .14), ('G4', .4)],
    'start': [('C5', .1), ('G5', .35)],
    'warning': [('F5', .15), (None, .08), ('F5', .35)],
    'attention': [('C6', .1), ('G6', .35)],
}


def soft(f, t, length):
    """A bell: a sine with two quiet overtones that dies away."""
    tone = math.sin(2 * math.pi * f * t) + .28 * math.sin(2 * math.pi * 2 * f * t) + .08 * math.sin(2 * math.pi * 3 * f * t)
    attack = min(1.0, t / .008)
    return tone * attack * math.exp(-t / max(.12, length * .55))


def retro(f, t, length):
    """An 8-bit blip: a square wave, a quick fall, coarse steps."""
    square = 1.0 if math.sin(2 * math.pi * f * t) >= 0 else -1.0
    level = max(0.0, 1 - t / (length * 1.05)) ** .8
    return round(square * level * 15) / 15


PRESETS = {'soft': soft, 'retro': retro}


def render(notes, voice):
    samples = []
    for note, seconds in notes:
        n = int(RATE * seconds)
        if note is None:
            samples += [0.0] * n
            continue
        f = hz(note)
        for i in range(n):
            t = i / RATE
            fade = min(1.0, (n - i) / (RATE * .015))  # no click at the end of a note
            samples.append(voice(f, t, seconds) * fade)
    top = max((abs(s) for s in samples), default=1) or 1
    return [s / top * PEAK for s in samples]


def write(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(s * 32767)) for s in samples))


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'presets')
    for preset, voice in PRESETS.items():
        os.makedirs(os.path.join(root, preset), exist_ok=True)
        for name, notes in SOUNDS.items():
            write(os.path.join(root, preset, name + '.wav'), render(notes, voice))
    print(f'{len(SOUNDS)} sounds in {len(PRESETS)} presets')
