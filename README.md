# ChordPro Converter

A lightweight browser-based converter for transforming standard aligned
chord sheets into ChordPro and converting ChordPro back into standard
chord-over-lyrics text.

## Live Demo

https://obicreo.github.io/chordpro-converter/

## Used in MeloRep

This converter powers the free online ChordPro Converter on melorep.com: https://melorep.com/tools/chordpro-converter

MeloRep is a setlist, chords and lyrics app for iPhone, iPad and Android, made by ObiCreo: https://melorep.com

## Features

- Standard text → ChordPro
- ChordPro → standard text
- Live conversion while typing or pasting
- Font-aware chord alignment
- Monospace font selected by default
- Nearest, previous, and next-character mapping modes
- Copy output to the clipboard
- Download `.cho` or `.txt` output
- No framework or build step required
- Runs entirely in the browser


## Supported ChordPro structures

- Metadata: title, sort title, subtitle, artist, sort artist, composer, lyricist, arranger, copyright, album, year, key, capo, tempo, time signature, duration and tags
- Environments: chorus, verse, bridge, generic section, tab, grid, ABC and text block
- Comments and comment variants
- Chord-only lines and inline chords
- Hash-prefixed source comments
- Unknown and custom ChordPro directives are preserved during conversion

Standard text section headings such as `[Verse 1]`, `[Chorus]`, `[Bridge]`, `[Intro]`, `[Outro]`, `[Solo]` and `[Pre-Chorus]` are converted to matching ChordPro environments.

## Project structure

```text
chordpro-converter/
├── index.html
├── styles.css
├── app.js
└── README.md
```

## Run locally

Open `index.html` directly, or run:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## GitHub Pages

1. Push the files to a public GitHub repository.
2. Open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select `main` and `/ (root)`.
5. Save.

## Notes

ChordPro directive lines such as `{title: ...}` are preserved when converting
to standard text.

Because this is a client-side application, all HTML, CSS, and JavaScript sent
to the browser remain visible to visitors.


## Version 2.1

Blank lines between song sections are emitted after the previous section closing directive and before the next section opening directive.
