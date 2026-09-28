"""Prototype parser for Guitar Pro 7/8 files (.gp = zip with Content/score.gpif).

Used during design to extract the bass track of the design-time songs.
Reference for the fallback parser in scripts/build-songs.ts (ADR-0004).
The production pipeline uses alphaTab's importer first.

Usage: python3 gpif-parse-prototype.py path/to/score.gp > bass.json
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from fractions import Fraction

DURATIONS = {  # in quarter notes
    "Whole": Fraction(4), "Half": Fraction(2), "Quarter": Fraction(1),
    "Eighth": Fraction(1, 2), "16th": Fraction(1, 4), "32nd": Fraction(1, 8), "64th": Fraction(1, 16),
}


def index(root, tag):
    return {e.get("id"): e for e in root.find(tag)}


def rhythm_duration(rhythm):
    d = DURATIONS[rhythm.findtext("NoteValue")]
    dots = rhythm.find("AugmentationDot")
    if dots is not None:
        add = d
        for _ in range(int(dots.get("count"))):
            add /= 2
            d += add
    tuplet = rhythm.find("PrimaryTuplet")
    if tuplet is not None:
        d = d * int(tuplet.get("den")) / int(tuplet.get("num"))
    return d


def parse(path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("Content/score.gpif"))
    score = root.find("Score")
    bars, voices, beats, notes, rhythms = (index(root, t) for t in ("Bars", "Voices", "Beats", "Notes", "Rhythms"))
    tracks = list(root.find("Tracks"))
    bass = next(i for i, t in enumerate(tracks) if "bass" in (t.findtext("Name") or "").lower())
    tuning = [int(p) for p in next(
        p.findtext("Pitches") for p in tracks[bass].iter("Property") if p.get("name") == "Tuning").split()]
    tempo = [a.findtext("Value") for a in root.find("MasterTrack").iter("Automation") if a.findtext("Type") == "Tempo"]

    out_bars = []
    for number, master in enumerate(root.find("MasterBars"), start=1):
        num, den = map(int, master.findtext("Time").split("/"))
        section = master.find("Section")
        bar = bars[master.findtext("Bars").split()[bass]]
        events, t = [], Fraction(0)
        voice_id = bar.findtext("Voices").split()[0]
        if voice_id != "-1":
            for beat_id in voices[voice_id].findtext("Beats").split():
                beat = beats[beat_id]
                dur = rhythm_duration(rhythms[beat.find("Rhythm").get("ref")])
                note_ids = (beat.findtext("Notes") or "").split()
                if not note_ids:
                    events.append({"beat": float(t), "dur": float(dur), "rest": True})
                for nid in note_ids:
                    n = notes[nid]
                    props = {p.get("name"): p for p in n.iter("Property")}
                    string = int(props["String"].findtext("String"))
                    fret = int(props["Fret"].findtext("Fret"))
                    tie = n.find("Tie")
                    events.append({
                        "beat": float(t), "dur": float(dur), "string": string, "fret": fret,
                        "pitch": tuning[string] + fret,
                        "tieFromPrev": tie is not None and tie.get("destination") == "true",
                    })
                t += dur
        out_bars.append({
            "bar": number, "time": [num, den],
            "section": (section.findtext("Text") or "").strip() if section is not None else None,
            "events": events,
        })

    return {
        "title": (score.findtext("Title") or "").strip(),
        "artist": (score.findtext("Artist") or "").strip(),
        "tuning": tuning,
        "tempo": tempo,
        "bars": out_bars,
    }


if __name__ == "__main__":
    json.dump(parse(sys.argv[1]), sys.stdout, ensure_ascii=False)
