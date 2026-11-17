#!/usr/bin/env python3
"""Measure video editing and audio rhythm using only Python and FFmpeg.

Tempo and cut/onset alignment are estimates, not a musical beat transcription.
Short-term EBU loudness uses a three-second window (including startup warm-up).
"""
import argparse
import array
import bisect
import json
import math
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import sys

NUMBER = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+|inf)'


def run(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace')[-2000:].strip())
    return result


def finite(value):
    value = float(value)
    return value if math.isfinite(value) else None


def ffmpeg(path, *args):
    return run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), *args])


def rhythm(pcm):
    samples = array.array('h')
    samples.frombytes(pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    hop = round(22050 * 0.023)
    dt = hop / 22050
    energy = [math.sqrt(sum(x*x for x in samples[i:i+hop]) / len(samples[i:i+hop]))
              for i in range(0, len(samples), hop)]
    # Positive RMS changes suppress sustained sounds; adaptive local thresholds
    # retain transients across changing recording levels.
    envelope = [0.0] + [max(0.0, energy[i] - energy[i-1])
                        for i in range(1, len(energy))]
    peaks = []
    for i in range(1, len(envelope)-1):
        local = envelope[max(0, i-22):i+23]
        threshold = max(20.0, statistics.mean(local) + 0.5*statistics.pstdev(local))
        if envelope[i] > threshold and envelope[i] >= envelope[i-1] and envelope[i] > envelope[i+1]:
            if peaks and (i-peaks[-1])*dt < 0.10:
                if envelope[i] > envelope[peaks[-1]]:
                    peaks[-1] = i
            else:
                peaks.append(i)
    scores = []
    for lag in range(math.ceil(60/(180*dt)), math.floor(60/(70*dt))+1):
        if len(envelope) - lag < 2:
            continue
        a, b = envelope[:-lag], envelope[lag:]
        norm = math.sqrt(sum(x*x for x in a)*sum(x*x for x in b))
        score = sum(x*y for x, y in zip(a, b))/norm if norm else 0.0
        scores.append((score, lag))
    score, lag = max(scores, default=(0.0, 1))
    return ([round(i*dt, 4) for i in peaks],
            round(60/(lag*dt)) if score > 0 else None,
            round(max(0.0, min(1.0, score)), 3))


def measure(path):
    probe = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                            '-of', 'json', str(path)]).stdout)
    video = next((s for s in probe['streams'] if s['codec_type'] == 'video'), None)
    if video is None:
        raise ValueError('No video stream')
    duration = finite(probe.get('format', {}).get('duration', video.get('duration', 0)))
    if not duration or duration <= 0:
        raise ValueError('No positive video duration')
    rate = video.get('avg_frame_rate', '0/1').split('/')
    fps = float(rate[0])/float(rate[1]) if len(rate) == 2 and float(rate[1]) else None
    log = ffmpeg(path, '-map', '0:v:0', '-an', '-vf',
                 "select='gt(scene,0.30)',showinfo", '-f', 'null', '-').stderr.decode(errors='replace')
    cuts = sorted(set(float(t) for t in re.findall(r'pts_time:(' + NUMBER + ')', log)))
    cuts = [t for t in cuts if 0 < t < duration]
    boundaries = [0.0] + cuts + [duration]
    lengths = [b-a for a, b in zip(boundaries, boundaries[1:])]
    result = {
        'source': str(path), 'duration_seconds': round(duration, 3),
        'resolution': {'width': video['width'], 'height': video['height']},
        'fps': round(fps, 4) if fps is not None else None,
        'cut_timestamps_seconds': [round(t, 2) for t in cuts],
        'cut_count': len(cuts), 'shot_count': len(lengths),
        'shot_lengths_seconds': [round(t, 2) for t in lengths],
        'shot_length_seconds': {key: round(value, 3) for key, value in {
            'average': statistics.mean(lengths), 'median': statistics.median(lengths),
            'min': min(lengths), 'max': max(lengths)}.items()},
        'cuts_per_10_seconds': round(len(cuts)*10/duration, 3),
        'cuts_in_first_3_seconds': sum(t <= 3 for t in cuts),
        'integrated_lufs': None, 'loudness_range_lu': None, 'true_peak_dbtp': None,
        'short_term_loudness_curve': None, 'silences': None,
        'onset_timestamps_seconds': None, 'bpm': None, 'tempo_confidence': None,
        'cuts_on_beat_ratio': None, 'warnings': [],
    }
    if not any(s['codec_type'] == 'audio' for s in probe['streams']):
        return result
    try:
        log = ffmpeg(path, '-map', '0:a:0', '-vn', '-af',
                     'ebur128=peak=true,silencedetect=noise=-35dB:d=0.25',
                     '-f', 'null', '-').stderr.decode(errors='replace')
        # Last summary is authoritative, not the periodically printed running values.
        summary = log.rsplit('Summary:', 1)[-1]
        for key, pattern in [('integrated_lufs', r'I:\s*(' + NUMBER + r')\s*LUFS'),
                             ('loudness_range_lu', r'LRA:\s*(' + NUMBER + r')\s*LU'),
                             ('true_peak_dbtp', r'Peak:\s*(' + NUMBER + r')\s*dBFS')]:
            match = re.search(pattern, summary)
            if match:
                result[key] = finite(match.group(1))
        curve = []
        next_sample = 0.5
        for t, value in re.findall(r'\bt:\s*(' + NUMBER + r').*?\bS:\s*(' + NUMBER + ')', log):
            t = float(t)
            if t + 0.002 >= next_sample:
                curve.append([round(next_sample, 2), finite(value)])
                next_sample += 0.5
        result['short_term_loudness_curve'] = curve
        silences, start = [], None
        for kind, value in re.findall(r'silence_(start|end):\s*(' + NUMBER + ')', log):
            value = max(0.0, min(duration, float(value)))
            if kind == 'start':
                start = value
            elif start is not None:
                silences.append([round(start, 3), round(value, 3)])
                start = None
        if start is not None:
            silences.append([round(start, 3), round(duration, 3)])
        result['silences'] = silences
    except Exception as exc:
        result['warnings'].append('Loudness/silence analysis failed: ' + str(exc))
    try:
        pcm = ffmpeg(path, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '22050',
                     '-acodec', 'pcm_s16le', '-f', 's16le', '-').stdout
        onsets, bpm, confidence = rhythm(pcm)
        result.update(onset_timestamps_seconds=onsets, bpm=bpm, tempo_confidence=confidence)
        aligned = 0
        for cut in cuts:
            i = bisect.bisect_left(onsets, cut)
            aligned += any(abs(t-cut) <= 0.080 for t in onsets[max(0, i-1):i+1])
        result['cuts_on_beat_ratio'] = round(aligned/len(cuts), 3) if cuts else None
    except Exception as exc:
        result['warnings'].append('Rhythm analysis failed: ' + str(exc))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('videos', nargs='+', type=Path)
    parser.add_argument('--out-dir', type=Path)
    args = parser.parse_args()
    for binary in ('ffmpeg', 'ffprobe'):
        if not shutil.which(binary):
            parser.exit(1, 'Missing required binary: ' + binary + '\n')
    failed = False
    for path in args.videos:
        try:
            result = measure(path)
            out = (args.out_dir or path.parent) / (path.stem + '.measure.json')
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
            loudness = result['integrated_lufs']
            ratio = result['cuts_on_beat_ratio']
            print(f"{path.name}: {result['duration_seconds']:.2f}s | "
                  f"{result['resolution']['width']}x{result['resolution']['height']} @ {result['fps']} fps | "
                  f"{result['cut_count']} cuts, {result['shot_count']} shots, "
                  f"mean {result['shot_length_seconds']['average']:.2f}s, "
                  f"hook {result['cuts_in_first_3_seconds']} cuts | "
                  f"LUFS {loudness if loudness is not None else 'n/a'} | "
                  f"BPM {result['bpm'] if result['bpm'] is not None else 'n/a'} "
                  f"(confidence {result['tempo_confidence']}) | cut/onset {ratio} | {out}")
            for warning in result['warnings']:
                print(f'  Warning: {warning}', file=sys.stderr)
        except Exception as exc:
            failed = True
            print(f'{path}: ERROR: {exc}', file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
