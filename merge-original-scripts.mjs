/**
 * Merge Original JSON Scripts
 *
 * Reads every JSON file in `original-json/`, converts each entry into
 * the canonical text format, and writes a single `merged-original.txt`.
 *
 * Unlike kanja-2/3, joker-3 has no `name` field. The speaker is inline
 * in the message: `speaker「content」` or `speaker（content）`.
 * A known speaker set is used to distinguish speech from narration that
 * happens to contain parenthetical readings (e.g. furigana).
 *
 * Detected speech entries become two lines:
 *
 *   ＃{speaker}
 *   「{content}」  or  （{content}）
 *
 * Everything else becomes a single narration line.
 *
 * File sections are separated by `--------------------` and each section
 * starts with the filename followed by `********************`.
 *
 * Usage:
 *   node merge-original-scripts.mjs
 */

import { glob } from "glob";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

const INPUT_DIR = "original-json";
const OUTPUT_FILE = "merged-original.txt";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const MAX_CHUNK_LINES = 900;
const CHUNKS_DIR = "original-merged-chunks";

// Known speaker names used to detect inline speech patterns.
const KNOWN_SPEAKERS = new Set([
  "大樹",
  "紫衣",
  "永遠",
  "綺羅",
  "杏里",
  "茉莉子",
  "伊丹",
  "？？？",
  "男Ａ",
  "男Ｂ",
  "男Ｃ",
  "男Ｄ",
  "男達",
  "男一同",
  "彩子",
  "ならず者Ａ",
  "ならず者Ｂ",
  "ならず者Ｃ",
  "ならず者Ｄ",
  "ならず者Ｅ",
  "ならず者Ｆ",
  "ならず者Ｇ",
  "ならず者Ｈ",
  "伊丹の手下Ａ",
  "伊丹の手下Ｂ",
  "紫衣＆茉莉子",
  "紫衣＆杏里",
  "大樹＆紫衣",
  "大樹＆綺羅",
  "小さな女の子",
  "女の子",
  "女達",
]);

// Matches speaker「content」 or speaker（content） where speaker is at the start.
const SPEECH_PATTERN = /^(.+?)([「（])([\s\S]*[」）])$/;

/**
 * Try to parse an inline speech line into { speaker, content }.
 * Returns null if the line is narration.
 */
function parseSpeech(line) {
  const match = line.match(SPEECH_PATTERN);
  if (!match) return null;

  const speaker = match[1];
  const content = match[2] + match[3]; // brackets + inner text

  // Only treat as speech if the speaker is in the known set.
  if (!KNOWN_SPEAKERS.has(speaker)) return null;

  // Verify bracket pairing (「→」, （→）).
  const open = content[0];
  const close = content[content.length - 1];
  if (open === "「" && close !== "」") return null;
  if (open === "（" && close !== "）") return null;

  return { speaker, content };
}

async function main() {
  // Step 1: Discover all JSON files in the input directory.
  const files = (await glob(`${INPUT_DIR}/*.json`)).sort();

  if (files.length === 0) {
    console.error(`No JSON files found in ${INPUT_DIR}/`);
    process.exit(1);
  }

  const sections = [];

  for (const filePath of files) {
    // Step 2: Read and parse each JSON file.
    const fileName = path.basename(filePath, ".json");
    const raw = await readFile(filePath, "utf-8");
    const entries = JSON.parse(raw);

    // Step 3: Convert each JSON entry to text lines.
    const lines = [];
    for (const entry of entries) {
      // Strip \r\n sequences from the source message.
      const message = entry.message.replace(/\r\n/g, "");

      // Try to parse inline speech (speaker「content」 or speaker（content）).
      const speech = parseSpeech(message);
      if (speech) {
        lines.push(`＃${speech.speaker}`);
        lines.push(speech.content);
      } else {
        lines.push(message);
      }
    }

    // Step 4: Build the section with a filename header.
    sections.push(`${fileName}\n${HEADER_SEPARATOR}\n${lines.join("\n")}`);
  }

  // Step 5: Prepend each section with a separator and write to disk.
  const output = sections.map((s) => `${SECTION_SEPARATOR}\n${s}`).join("\n");
  await writeFile(OUTPUT_FILE, output + "\n", "utf-8");

  console.log(`${files.length} files merged into ${OUTPUT_FILE}`);

  // Step N: Split sections into line-limited chunks.
  await rm(CHUNKS_DIR, { recursive: true, force: true });
  await mkdir(CHUNKS_DIR, { recursive: true });

  const chunks = [];
  let currentChunk = [];
  let currentLineCount = 0;

  for (const section of sections) {
    const sectionText = `${SECTION_SEPARATOR}\n${section}`;
    const sectionLineCount = sectionText.split("\n").length;

    // If adding this section exceeds the limit and we already have content,
    // flush the current chunk first.
    if (currentLineCount + sectionLineCount > MAX_CHUNK_LINES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLineCount = 0;
    }

    currentChunk.push(sectionText);
    currentLineCount += sectionLineCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkNum = String(i + 1).padStart(3, "0");
    const chunkPath = path.join(CHUNKS_DIR, `part-${chunkNum}.txt`);
    await writeFile(chunkPath, chunks[i].join("\n") + "\n", "utf-8");
  }

  console.log(`${chunks.length} chunks written to ${CHUNKS_DIR}/`);
}

main().catch(console.error);
