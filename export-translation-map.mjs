/**
 * Export Translation Map
 *
 * Reads `merged-original.txt` and `merged-translated.txt`, parses them into
 * matching sections, and builds a JSON mapping of every unique original line
 * to its translated counterpart.
 *
 * Speech source lines (＃ in original, # in translated) and their following
 * content lines are merged into a single entry:
 *
 *   Original:  ＃大樹                      →  key:   "〈大樹〉：朝が早かったせいか……"
 *              「朝が早かったせいか……」       value: "Daiki: \u201CBecause it was early...\u201D"
 *
 * Narration lines are mapped directly:
 *
 *   key:   "寝ぼけ眼で辺りを見渡すと……"
 *   value: "Looking around with sleepy eyes..."
 *
 * Empty lines are skipped. First occurrence wins for duplicates.
 *
 * Output: `translation-map.json`
 *
 * Usage:
 *   node export-translation-map.mjs
 */

import { readFile, writeFile } from "fs/promises";

const ORIGINAL_FILE = "merged-original.txt";
const TRANSLATED_FILE = "merged-translated.txt";
const OUTPUT_FILE = "translation-map.json";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const SPEAKER_MAP = new Map([
  ["大樹", "Daiki"],
  ["紫衣", "Shii"],
  ["永遠", "Towa"],
  ["綺羅", "Kira"],
  ["杏里", "Anri"],
  ["茉莉子", "Mariko"],
  ["伊丹", "Itami"],
  ["？？？", "???"],
  ["男Ａ", "Man A"],
  ["男Ｂ", "Man B"],
  ["男Ｃ", "Man C"],
  ["男Ｄ", "Man D"],
  ["男達", "Men"],
  ["男一同", "All Men"],
  ["彩子", "Saiko"],
  ["ならず者Ａ", "Thug A"],
  ["ならず者Ｂ", "Thug B"],
  ["ならず者Ｃ", "Thug C"],
  ["ならず者Ｄ", "Thug D"],
  ["ならず者Ｅ", "Thug E"],
  ["ならず者Ｆ", "Thug F"],
  ["ならず者Ｇ", "Thug G"],
  ["ならず者Ｈ", "Thug H"],
  ["伊丹の手下Ａ", "Itami's Henchman A"],
  ["伊丹の手下Ｂ", "Itami's Henchman B"],
  ["紫衣＆茉莉子", "Shii & Mariko"],
  ["紫衣＆杏里", "Shii & Anri"],
  ["大樹＆紫衣", "Daiki & Shii"],
  ["大樹＆綺羅", "Daiki & Kira"],
  ["小さな女の子", "Little Girl"],
  ["女の子", "Girl"],
  ["女達", "Women"],
]);

// Bracket pairs that can wrap speech content in the original.
const JP_BRACKET_PAIRS = [
  ["「", "」"],
  ["（", "）"],
];

/**
 * Parse a merged text file into a Map of { fileName → lines[] },
 * preserving empty lines so indices stay aligned between original and
 * translated.
 */
function parseSections(text) {
  // Step 1: Split file into raw blocks by the section separator line.
  // Each section starts with "--------------------\n" (including the first).
  const raw = text.split(`${SECTION_SEPARATOR}\n`);
  const sections = new Map();

  for (const block of raw) {
    // Step 2: Locate the header separator to split filename from body.
    const headerEnd = block.indexOf(`\n${HEADER_SEPARATOR}\n`);
    if (headerEnd === -1) continue;

    const fileName = block.slice(0, headerEnd).trim();
    const body = block.slice(headerEnd + HEADER_SEPARATOR.length + 2);

    // Step 3: Keep all lines (including empty) to preserve index alignment.
    sections.set(fileName, body.split("\n"));
  }

  return sections;
}

/**
 * Strip any of the JP bracket pairs (「」, （）) from a speech content line.
 */
function stripBracketsJP(line) {
  for (const [open, close] of JP_BRACKET_PAIRS) {
    if (line.startsWith(open) && line.endsWith(close)) {
      return line.slice(1, -1);
    }
  }
  return line;
}

/**
 * Strip the \u201C\u201D curly quotes from an English speech content line.
 */
function stripBracketsEN(line) {
  if (line.startsWith("\u201C") && line.endsWith("\u201D")) {
    return line.slice(1, -1);
  }
  return line;
}

async function main() {
  // Step 1: Read both merged files.
  const originalText = await readFile(ORIGINAL_FILE, "utf-8");
  const translatedText = await readFile(TRANSLATED_FILE, "utf-8");

  // Step 2: Parse into section maps keyed by filename.
  const origSections = parseSections(originalText);
  const transSections = parseSections(translatedText);

  const map = new Map();
  let totalPairs = 0;
  let duplicates = 0;
  const unknownSpeakers = new Set();

  // Step 3: Walk through each section, pairing original and translated lines.
  for (const [fileName, origLines] of origSections) {
    // Skip sections without a translated counterpart.
    if (!transSections.has(fileName)) continue;
    const transLines = transSections.get(fileName);

    let i = 0;
    while (i < origLines.length && i < transLines.length) {
      const origLine = origLines[i];
      const transLine = transLines[i];

      // Step 3a: Skip empty lines.
      if (origLine.length === 0) {
        i++;
        continue;
      }

      // Step 3b: Handle speech lines (＃ source + content on next line).
      // Original uses full-width ＃, translated uses half-width #.
      if (origLine.startsWith("＃")) {
        const speakerJP = origLine.slice(1);
        const speakerEN = SPEAKER_MAP.get(speakerJP);

        if (!speakerEN) {
          unknownSpeakers.add(speakerJP);
        }

        // Merge speaker + content into a single map entry.
        if (i + 1 < origLines.length && i + 1 < transLines.length) {
          const contentOrig = origLines[i + 1];
          const contentTrans = transLines[i + 1];

          // Key uses 〈name〉：content format, stripping JP brackets from original.
          const key = `〈${speakerJP}〉：${stripBracketsJP(contentOrig)}`;
          // Value uses EN name: \u201Ccontent\u201D, stripping translated quotes.
          const value = `${speakerEN || speakerJP}: \u201C${stripBracketsEN(contentTrans)}\u201D`;

          if (!map.has(key)) {
            map.set(key, value);
            totalPairs++;
          } else {
            duplicates++;
          }

          i += 2;
        } else {
          i++;
        }
        continue;
      }

      // Step 3c: Handle narration lines — map original directly to translated.
      if (!map.has(origLine)) {
        map.set(origLine, transLine);
        totalPairs++;
      } else {
        duplicates++;
      }

      i++;
    }
  }

  // Step 4: Write the translation map to disk as JSON.
  const obj = Object.fromEntries(map);
  await writeFile(OUTPUT_FILE, JSON.stringify(obj, null, 2), "utf-8");

  // Step 5: Print summary.
  console.log("— Summary —");
  console.log(`  Sections processed: ${origSections.size}`);
  console.log(`  Unique entries:     ${totalPairs}`);
  console.log(`  Duplicates skipped: ${duplicates}`);
  console.log(`  Exported to:        ${OUTPUT_FILE}`);

  if (unknownSpeakers.size > 0) {
    console.log(
      `\n  Unknown speakers: ${[...unknownSpeakers].join(", ")}`,
    );
  }
}

main().catch(console.error);
