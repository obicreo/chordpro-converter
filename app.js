"use strict";

const source = document.getElementById("source");
const output = document.getElementById("output");
const status = document.getElementById("status");

const inputFormat = document.getElementById("inputFormat");
const outputFormat = document.getElementById("outputFormat");
const fontSelect = document.getElementById("font");
const fontSize = document.getElementById("fontSize");
const mapping = document.getElementById("mapping");

const sourceTitle = document.getElementById("sourceTitle");
const outputTitle = document.getElementById("outputTitle");

const canvas = document.createElement("canvas");
const context = canvas.getContext("2d");

let convertTimer = null;

const chordTokenRegex = /^(?:[A-G](?:#|b|♯|♭)?(?:m|maj|min|dim|aug|sus|add|omit|no|M|mi|ø|°|Δ|\+)?(?:\d+)?(?:[#b♯♭]\d+)?(?:\([^\s()]+\))?(?:\/[A-G](?:#|b|♯|♭)?)?|N\.?C\.?|[|:%()\-]+)$/i;

const metadataAliases = new Map([
  ["t", "title"],
  ["title", "title"],
  ["sorttitle", "sorttitle"],
  ["st", "subtitle"],
  ["subtitle", "subtitle"],
  ["artist", "artist"],
  ["sortartist", "sortartist"],
  ["composer", "composer"],
  ["lyricist", "lyricist"],
  ["arranger", "arranger"],
  ["copyright", "copyright"],
  ["album", "album"],
  ["year", "year"],
  ["key", "key"],
  ["capo", "capo"],
  ["tempo", "tempo"],
  ["time", "time"],
  ["duration", "duration"],
  ["tag", "tag"],
  ["comment", "comment"],
  ["comment_italic", "comment_italic"],
  ["comment_box", "comment_box"],
]);

const metadataDisplayNames = new Map([
  ["title", "Title"],
  ["sorttitle", "Sort title"],
  ["subtitle", "Subtitle"],
  ["artist", "Artist"],
  ["sortartist", "Sort artist"],
  ["composer", "Composer"],
  ["lyricist", "Lyricist"],
  ["arranger", "Arranger"],
  ["copyright", "Copyright"],
  ["album", "Album"],
  ["year", "Year"],
  ["key", "Key"],
  ["capo", "Capo"],
  ["tempo", "Bpm"],
  ["time", "Time"],
  ["duration", "Duration"],
  ["tag", "Tag"],
  ["comment", "Comment"],
  ["comment_italic", "Comment italic"],
  ["comment_box", "Comment box"],
]);

const directiveAliases = new Map([
  ["soc", "start_of_chorus"],
  ["eoc", "end_of_chorus"],
  ["sov", "start_of_verse"],
  ["eov", "end_of_verse"],
  ["sob", "start_of_bridge"],
  ["eob", "end_of_bridge"],
  ["sos", "start_of_section"],
  ["eos", "end_of_section"],
  ["sot", "start_of_tab"],
  ["eot", "end_of_tab"],
  ["sog", "start_of_grid"],
  ["eog", "end_of_grid"],
  ["c", "comment"],
  ["ci", "comment_italic"],
  ["cb", "comment_box"],
  ["ns", "new_song"],
  ["np", "new_page"]
]);

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n");
}

function selectedFontStack() {
  const selected = fontSelect.value;

  if (selected === "SFMono-Regular") {
    return '"SFMono-Regular", "Liberation Mono", Menlo, Consolas, monospace';
  }

  if (["Menlo", "Consolas", "Liberation Mono", "Courier New"].includes(selected)) {
    return `"${selected}", monospace`;
  }

  return `"${selected}", Arial, sans-serif`;
}

function applyFontSettings() {
  const stack = selectedFontStack();
  const size = `${Number(fontSize.value) || 16}px`;

  source.style.fontFamily = stack;
  source.style.fontSize = size;
  output.style.fontFamily = stack;
  output.style.fontSize = size;
}

async function applyFontSettingsAndConvert() {
  applyFontSettings();

  const selectedFont = fontSelect.value;
  const selectedSize = Number(fontSize.value) || 16;

  if (document.fonts?.load) {
    try {
      await document.fonts.load(`${selectedSize}px "${selectedFont}"`);
      await document.fonts.ready;
    } catch {
      // Continue with the browser fallback font.
    }
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.clearTimeout(convertTimer);
      convert();
    });
  });
}

function getMeasurementFont() {
  const style = getComputedStyle(source);
  return [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
}

function measure(text) {
  context.font = getMeasurementFont();
  return context.measureText(text).width;
}

function scheduleConvert(delay = 60) {
  window.clearTimeout(convertTimer);
  convertTimer = window.setTimeout(convert, delay);
}

function isChordToken(token) {
  return chordTokenRegex.test(token);
}

function isChordLine(line) {
  const tokens = line.trim().split(/\s+/u).filter(Boolean);
  return tokens.length > 0 && tokens.every(isChordToken);
}

function getChordTokens(line) {
  const tokens = [];
  const regex = /\S+/gu;
  let match;

  while ((match = regex.exec(line)) !== null) {
    tokens.push({ text: match[0], start: match.index });
  }

  return tokens;
}

function buildCharacterPositions(line) {
  const characters = Array.from(line);
  const positions = [{ index: 0, x: 0 }];
  let prefix = "";

  for (let index = 0; index < characters.length; index += 1) {
    prefix += characters[index];
    positions.push({ index: index + 1, x: measure(prefix) });
  }

  return positions;
}

function mapXToIndex(x, positions) {
  if (!positions.length) return 0;

  if (mapping.value === "before") {
    let selected = positions[0];
    for (const position of positions) {
      if (position.x > x) break;
      selected = position;
    }
    return selected.index;
  }

  if (mapping.value === "after") {
    const selected = positions.find((position) => position.x >= x) ?? positions.at(-1);
    return selected.index;
  }

  let selected = positions[0];
  let bestDistance = Math.abs(x - selected.x);

  for (const position of positions) {
    const distance = Math.abs(x - position.x);
    if (distance < bestDistance) {
      selected = position;
      bestDistance = distance;
    }
  }

  return selected.index;
}

function textPairToChordPro(chordLine, lyricLine) {
  const tokens = getChordTokens(chordLine);
  const lyricCharacters = Array.from(lyricLine);
  const lyricPositions = buildCharacterPositions(lyricLine);
  const insertions = new Map();

  for (const token of tokens) {
    const tokenX = measure(chordLine.slice(0, token.start));
    const characterIndex = mapXToIndex(tokenX, lyricPositions);

    if (!insertions.has(characterIndex)) insertions.set(characterIndex, []);
    insertions.get(characterIndex).push(token.text);
  }

  let result = "";

  for (let index = 0; index <= lyricCharacters.length; index += 1) {
    const chords = insertions.get(index);
    if (chords) result += chords.map((chord) => `[${chord}]`).join("");
    if (index < lyricCharacters.length) result += lyricCharacters[index];
  }

  return result;
}

function escapeDirectiveValue(value) {
  return value.trim().replace(/\s+/g, " ");
}

function directive(name, value = "") {
  return value ? `{${name}: ${escapeDirectiveValue(value)}}` : `{${name}}`;
}

function parseMetadataHeader(line) {
  const directives = [];
  let remaining = line.trim();

  const titleArtist = remaining.match(/^(.+?)\s+-\s+(.+?)(?:\.\s+|$)/u);
  if (titleArtist) {
    directives.push(directive("title", titleArtist[1]));
    directives.push(directive("artist", titleArtist[2]));
    remaining = remaining.slice(titleArtist[0].length).trim();
  }

  const patterns = [
    { regex: /(?:^|\.\s*)Key\s*:\s*([^\.]+)(?=\.|$)/iu, name: "key" },
    { regex: /(?:^|\.\s*)Capo(?:\s*@|\s*:)?\s*(\d+)(?=\.|$)/iu, name: "capo" },
    { regex: /(?:^|\.\s*)(?:Bpm|Tempo)\s*:\s*(\d+(?:\.\d+)?)(?=\.|$)/iu, name: "tempo" },
    { regex: /(?:^|\.\s*)Time(?:\s+signature)?\s*:\s*([^\.]+)(?=\.|$)/iu, name: "time" },
    { regex: /(?:^|\.\s*)Album\s*:\s*([^\.]+)(?=\.|$)/iu, name: "album" },
    { regex: /(?:^|\.\s*)Year\s*:\s*(\d{4})(?=\.|$)/iu, name: "year" },
    { regex: /(?:^|\.\s*)Duration\s*:\s*([^\.]+)(?=\.|$)/iu, name: "duration" }
  ];

  for (const item of patterns) {
    const match = remaining.match(item.regex);
    if (match) directives.push(directive(item.name, match[1]));
  }

  return directives.length ? directives : null;
}

function parseMetadataLabelLine(line) {
  const match = line.match(/^\s*([A-Za-z][A-Za-z ]+?)\s*:\s*(.+?)\s*$/u);
  if (!match) return null;

  const normalizedLabel = match[1].toLowerCase().replace(/\s+/g, "");
  const aliasLookup = new Map([
    ["title", "title"], ["sorttitle", "sorttitle"], ["subtitle", "subtitle"],
    ["artist", "artist"], ["sortartist", "sortartist"], ["composer", "composer"],
    ["lyricist", "lyricist"], ["arranger", "arranger"], ["copyright", "copyright"],
    ["album", "album"], ["year", "year"], ["key", "key"], ["capo", "capo"],
    ["tempo", "tempo"], ["bpm", "tempo"], ["time", "time"],
    ["timesignature", "time"], ["duration", "duration"], ["tag", "tag"],
    ["comment", "comment"], ["commentitalic", "comment_italic"], ["commentbox", "comment_box"]
  ]);

  const name = aliasLookup.get(normalizedLabel);
  return name ? directive(name, match[2]) : null;
}

function parseSectionHeader(line) {
  const match = line.match(/^\s*\[([^\]]+)\]\s*$/u);
  if (!match) return null;

  const label = match[1].trim();
  if (isChordToken(label)) return null;

  const normalized = label.toLowerCase().replace(/[\s_-]+/g, " ").trim();

  if (/^chorus(?:\s+\d+)?$/u.test(normalized) || /^refrain(?:\s+\d+)?$/u.test(normalized)) {
    return { type: "chorus", label };
  }

  if (/^verse(?:\s+\d+|\s+[a-z])?$/u.test(normalized)) {
    return { type: "verse", label };
  }

  if (/^bridge(?:\s+\d+)?$/u.test(normalized)) {
    return { type: "bridge", label };
  }

  if (/^(intro|outro)(?:\s+\d+)?$/u.test(normalized)) {
    return { type: "bridge", label };
  }

  if (/^(tab|tablature)$/u.test(normalized)) {
    return { type: "tab", label };
  }

  if (/^(grid|chord grid)$/u.test(normalized)) {
    return { type: "grid", label };
  }

  return { type: "section", label };
}

function sectionStart(section) {
  if (section.type === "chorus" && /^chorus$/iu.test(section.label)) {
    return "{start_of_chorus}";
  }

  return `{start_of_${section.type}: ${section.label}}`;
}

function sectionEnd(type) {
  return `{end_of_${type}}`;
}

function standardTextToChordPro(text) {
  const lines = normalizeText(text).split("\n");
  const result = [];
  const pendingBlankLines = [];

  let openSection = null;
  let metadataParsed = false;

  function closeSection() {
    if (!openSection) return;

    result.push(sectionEnd(openSection));
    openSection = null;
  }

  function flushPendingBlankLines() {
    if (!pendingBlankLines.length) return;

    result.push(...pendingBlankLines);
    pendingBlankLines.length = 0;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    // Do not immediately add blank lines while a section is open.
    // They may belong between the current section's end directive and
    // the next section's start directive.
    if (!trimmed) {
      if (openSection) {
        pendingBlankLines.push("");
      } else {
        result.push("");
      }

      continue;
    }

    const section = parseSectionHeader(line);

    if (section) {
      // Close the previous section before adding the blank lines that
      // separate it from the next section.
      closeSection();
      flushPendingBlankLines();

      result.push(sectionStart(section));
      openSection = section.type;
      continue;
    }

    // A non-section content line means any pending blank lines really
    // belong inside the currently open section.
    flushPendingBlankLines();

    if (!metadataParsed) {
      const headerDirectives = parseMetadataHeader(line);

      if (headerDirectives) {
        result.push(...headerDirectives);
        metadataParsed = true;
        continue;
      }

      metadataParsed = true;
    }

    const metadataLine = parseMetadataLabelLine(line);

    if (metadataLine && !openSection) {
      result.push(metadataLine);
      continue;
    }

    if (trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }

    if (isChordLine(line)) {
      const nextLine = lines[index + 1];

      if (
        nextLine !== undefined &&
        nextLine.trim() &&
        !isChordLine(nextLine) &&
        !parseSectionHeader(nextLine)
      ) {
        result.push(textPairToChordPro(line, nextLine));
        index += 1;
      } else {
        result.push(
          getChordTokens(line)
            .map((token) => `[${token.text}]`)
            .join(" ")
        );
      }

      continue;
    }

    result.push(line.replace(/\s+$/u, ""));
  }

  // Trailing blank lines must also be placed after the closing directive.
  closeSection();
  flushPendingBlankLines();

  return result.join("\n");
}

function parseChordProLine(line) {
  const lyricCharacters = [];
  const chordAnchors = [];
  let lyricIndex = 0;
  let cursor = 0;

  while (cursor < line.length) {
    if (line[cursor] === "[") {
      const closeIndex = line.indexOf("]", cursor + 1);
      if (closeIndex !== -1) {
        const chord = line.slice(cursor + 1, closeIndex).trim();
        if (chord) chordAnchors.push({ chord, lyricIndex });
        cursor = closeIndex + 1;
        continue;
      }
    }

    const character = Array.from(line.slice(cursor))[0];
    lyricCharacters.push(character);
    lyricIndex += 1;
    cursor += character.length;
  }

  return { lyricLine: lyricCharacters.join(""), chordAnchors };
}

function renderChordLineForFont(lyricLine, chordAnchors) {
  if (!chordAnchors.length) {
    return "";
  }
  if (!lyricLine.trim()) {
    const cells = [];
    let previousEnd = 0;
    let hasPreviousChord = false;

    for (const anchor of chordAnchors) {
      let column = Math.max(0, anchor.lyricIndex);

      /*
       * previousEnd is the first column after the previous chord.
       * Therefore, at least one additional column is required
       * to create a visible space between adjacent chords.
       */
      if (hasPreviousChord) {
        column = Math.max(column, previousEnd + 1);
      }

      while (cells.length < column) {
        cells.push(" ");
      }

      for (const character of Array.from(anchor.chord)) {
        cells[column] = character;
        column += 1;
      }
      previousEnd = column;
      hasPreviousChord = true;
    }
    return cells.join("").replace(/\s+$/u, "");
  }

  const lyricPositions = buildCharacterPositions(lyricLine);
  let renderedLine = "";
  let previousChordEnd = 0;
  let hasPreviousChord = false;

  for (const anchor of chordAnchors) {
    const safeIndex = Math.min(
      anchor.lyricIndex,
      lyricPositions.length - 1
    );

    const targetX =
      lyricPositions[safeIndex]?.x ??
      measure(lyricLine);

    let currentX = measure(renderedLine);

    while (currentX < targetX) {
      const candidate = `${renderedLine} `;
      const candidateX = measure(candidate);

      if (
        mapping.value === "nearest" &&
        Math.abs(targetX - currentX) <=
          Math.abs(candidateX - targetX)
      ) {
        break;
      }

      if (
        mapping.value === "before" &&
        candidateX > targetX
      ) {
        break;
      }

      renderedLine = candidate;
      currentX = candidateX;

      if (renderedLine.length > 10000) {
        break;
      }
    }

    /*
     * Do not allow two chord names to merge when their calculated
     * positions overlap.
     */
    if (
      hasPreviousChord &&
      measure(renderedLine) <= previousChordEnd
    ) {
      renderedLine += " ";
    }

    renderedLine += anchor.chord;
    previousChordEnd = measure(renderedLine);
    hasPreviousChord = true;
  }

  return renderedLine.replace(/\s+$/u, "");
}

function parseDirective(line) {
  const match = line.match(/^\s*\{\s*([^\s:}]+)(?:\s*:\s*|\s+)?(.*?)\s*\}\s*$/u);
  if (!match) return null;

  let name = match[1].toLowerCase();
  name = directiveAliases.get(name) ?? name;

  let value = match[2].trim();
  const labelMatch = value.match(/(?:^|\s)label\s*=\s*["']([^"']+)["']/iu);
  if (labelMatch) value = labelMatch[1];

  return { name, value, raw: line };
}

function environmentHeader(name, value) {
  const type = name.replace(/^start_of_/, "");
  const defaultNames = {
    chorus: "Chorus",
    verse: "Verse",
    bridge: "Bridge",
    section: "Section",
    tab: "Tab",
    grid: "Grid",
    abc: "ABC",
    textblock: "Text Block"
  };

  return `[${value || defaultNames[type] || type}]`;
}

const chordProMetadataMap = {
  title: "title",
  t: "title",

  subtitle: "subtitle",
  st: "subtitle",

  artist: "artist",
  sortartist: "sort_artist",
  sort_artist: "sort_artist",

  album: "album",
  year: "year",

  composer: "composer",
  lyricist: "lyricist",
  arranger: "arranger",

  copyright: "copyright",

  key: "key",
  capo: "capo",

  tempo: "tempo",
  bpm: "bpm",

  time: "time",
  time_signature: "time",

  duration: "duration",
  tag: "tag",

  comment: "comment",
  comment_italic: "comment_italic",
  comment_box: "comment_box"
};

function parseChordProDirective(line) {
  const match = line
    .trim()
    .match(/^\{\s*([^}:]+?)\s*(?::\s*(.*?))?\s*\}$/u);

  if (!match) {
    return null;
  }

  return {
    name: match[1]
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/gu, "_"),

    value: (match[2] ?? "").trim()
  };
}

function chordProMetadataToStandardText(line) {
  const directive = parseChordProDirective(line);

  if (!directive) {
    return null;
  }

  const outputName =
    chordProMetadataMap[directive.name];

  if (!outputName || !directive.value) {
    return null;
  }

  return `${outputName}: ${directive.value}`;
}

function chordProToStandardText(text) {
  const lines = normalizeText(text).split("\n");
  const body = [];
  const metadataLines = [];
  const preservedDirectives = [];

  for (const line of lines) {
    const parsedDirective = parseDirective(line);

    if (parsedDirective) {
      const canonicalMetadata =
        metadataAliases.get(parsedDirective.name);

      /*
       * Convert ChordPro metadata directives into
       * lowercase standard text fields.
       *
       * Example:
       * {title: Midnight Road}
       * becomes:
       * title: Midnight Road
       */
      if (canonicalMetadata) {
        const outputName =
          chordProMetadataMap[canonicalMetadata] ??
          canonicalMetadata;

        if (parsedDirective.value) {
          metadataLines.push(
            `${outputName}: ${parsedDirective.value}`
          );
        }

        continue;
      }

      /*
       * Convert ChordPro environments into section headers.
       *
       * Example:
       * {start_of_verse: Verse 1}
       * becomes:
       * [Verse 1]
       */
      if (parsedDirective.name.startsWith("start_of_")) {
        body.push(
          environmentHeader(
            parsedDirective.name,
            parsedDirective.value
          )
        );

        continue;
      }

      /*
       * End directives are not needed in standard text.
       */
      if (parsedDirective.name.startsWith("end_of_")) {
        continue;
      }

      /*
       * Convert ChordPro comments into visible section-like text.
       */
      if (
        [
          "comment",
          "comment_italic",
          "comment_box"
        ].includes(parsedDirective.name)
      ) {
        const outputName =
          chordProMetadataMap[parsedDirective.name] ??
          parsedDirective.name;

        if (parsedDirective.value) {
          body.push(`${outputName}: ${parsedDirective.value}`);
        }

        continue;
      }

      /*
       * Handle the short chorus directive.
       */
      if (parsedDirective.name === "chorus") {
        body.push(
          `[${parsedDirective.value || "Chorus"}]`
        );

        continue;
      }

      /*
       * Preserve custom and unsupported ChordPro directives.
       */
      preservedDirectives.push(parsedDirective.raw);
      continue;
    }

    /*
     * Lines without inline chord tags are copied directly.
     */
    if (!line.includes("[") || !line.includes("]")) {
      body.push(line);
      continue;
    }

    const parsed = parseChordProLine(line);

    if (!parsed.chordAnchors.length) {
      body.push(line);
      continue;
    }

    const chordLine = renderChordLineForFont(
      parsed.lyricLine,
      parsed.chordAnchors
    );

    if (chordLine) {
      body.push(chordLine);
    }

    /*
     * Do not add an empty lyric line for chord-only content.
     *
     * Example:
     * [G] [D] [Em] [C]
     *
     * Only produces:
     * G D Em C
     */
    if (parsed.lyricLine.trim()) {
      body.push(parsed.lyricLine);
    }
  }

  const result = [];

  /*
   * Metadata is placed at the beginning,
   * one field per line.
   */
  if (metadataLines.length) {
    result.push(...metadataLines);
  }

  /*
   * Preserve custom directives after metadata.
   */
  if (preservedDirectives.length) {
    if (result.length) {
      result.push("");
    }

    result.push(...preservedDirectives);
  }

  /*
   * Add one blank line between metadata and song content.
   */
  if (result.length && body.length) {
    while (body[0] === "") {
      body.shift();
    }

    result.push("");
  }

  result.push(...body);

  return result.join("\n");
}

function updateInterfaceLabels() {
  sourceTitle.textContent = inputFormat.value === "text" ? "Standard text input" : "ChordPro input";
  outputTitle.textContent = outputFormat.value === "text" ? "Standard text output" : "ChordPro output";
  source.placeholder = inputFormat.value === "text"
    ? "Paste aligned chord and lyric text here..."
    : "Paste ChordPro content here...";
}

function convert() {
  const text = source.value;

  if (!text.trim()) {
    output.value = "";
    setStatus("");
    return;
  }

  if (inputFormat.value === outputFormat.value) {
    output.value = normalizeText(text);
    setStatus("Input and output formats are the same.");
    return;
  }

  try {
    output.value = inputFormat.value === "text"
      ? standardTextToChordPro(text)
      : chordProToStandardText(text);

    setStatus("Output updated.");
  } catch (error) {
    console.error(error);
    output.value = "";
    setStatus("The content could not be converted.", true);
  }
}

function syncOppositeFormat(changedSelect) {
  if (changedSelect === inputFormat) {
    outputFormat.value = inputFormat.value === "text" ? "chordpro" : "text";
  } else {
    inputFormat.value = outputFormat.value === "text" ? "chordpro" : "text";
  }

  updateInterfaceLabels();
  scheduleConvert(0);
}

function swapFormats() {
  const previousInput = inputFormat.value;
  inputFormat.value = outputFormat.value;
  outputFormat.value = previousInput;

  if (output.value) source.value = output.value;

  updateInterfaceLabels();
  scheduleConvert(0);
}

async function copyOutput() {
  if (!output.value) {
    setStatus("There is no output to copy.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(output.value);
    setStatus("Output copied to the clipboard.");
  } catch {
    output.focus();
    output.select();
    setStatus("Output selected. Press Ctrl/Cmd + C to copy it.");
  }
}

function downloadOutput() {
  if (!output.value) {
    setStatus("There is no output to download.", true);
    return;
  }

  const extension = outputFormat.value === "chordpro" ? "cho" : "txt";
  const blob = new Blob([output.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `converted-chords.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  setStatus(`${extension.toUpperCase()} file downloaded.`);
}

function clearAll() {
  window.clearTimeout(convertTimer);
  source.value = "";
  output.value = "";
  setStatus("");
  source.focus();
}

source.addEventListener("input", () => scheduleConvert());
source.addEventListener("paste", () => scheduleConvert(0));

inputFormat.addEventListener("change", () => syncOppositeFormat(inputFormat));
outputFormat.addEventListener("change", () => syncOppositeFormat(outputFormat));
fontSelect.addEventListener("change", applyFontSettingsAndConvert);
fontSize.addEventListener("input", applyFontSettingsAndConvert);
mapping.addEventListener("change", () => scheduleConvert(0));

document.getElementById("swap").addEventListener("click", swapFormats);
document.getElementById("copy").addEventListener("click", copyOutput);
document.getElementById("download").addEventListener("click", downloadOutput);
document.getElementById("clear").addEventListener("click", clearAll);

applyFontSettings();
updateInterfaceLabels();

source.value = `Midnight Road - Alex Carter. Key: G. Capo @ 2. Bpm: 96.
comment: Demo song for ChordPro Converter

[Intro]
G   D   Em   C


[Verse 1]
G                         D
I was walking down a midnight road
Em                           C
With an old guitar and a heavy load
G                              D
Every light was fading out of sight
Em                              C
But I kept on moving through the night


[Chorus]
G             D
Take me home, take me home
Em                              C
To the place where I know I belong
G             D
Carry me on, carry me on
Em                            C
Till the dark turns into dawn


[Verse 2]
G                             D
There were shadows moving by my side
Em                              C
There were questions I could never hide
Am                         Em
Even when the road feels long
C                 D               G
I will keep on singing my own song


[Outro]
G   D   Em   C
G`;

convert();
