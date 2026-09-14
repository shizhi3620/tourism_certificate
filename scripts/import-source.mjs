import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { PDFParse } from "pdf-parse";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run import:source -- /path/to/source.pdf [subject] [region]");
  process.exit(1);
}

const sourcePath = resolve(input);
const sourceName = basename(sourcePath);
const sourceId = `${Date.now()}-${sourceName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
const outputDirectory = resolve("content/sources");
await mkdir(outputDirectory, { recursive: true });

const sourceBytes = await readFile(sourcePath);
let text;
if (extname(sourcePath).toLowerCase() === ".pdf") {
  const parser = new PDFParse({ data: sourceBytes });
  ({ text } = await parser.getText());
  await parser.destroy();
} else {
  text = sourceBytes.toString("utf8");
}

const storedSource = join(outputDirectory, sourceId);
const textPath = `${storedSource}.txt`;
const manifestPath = `${storedSource}.json`;
await copyFile(sourcePath, storedSource);
await writeFile(textPath, text, "utf8");
await writeFile(
  manifestPath,
  `${JSON.stringify({
    sourceId,
    originalName: sourceName,
    storedFile: storedSource,
    extractedText: textPath,
    subject: process.argv[3] ?? null,
    region: process.argv[4] ?? "全国",
    status: "extracted",
    importedAt: new Date().toISOString(),
    questionStatus: "not_generated",
  }, null, 2)}\n`,
);
console.log(`Imported ${sourceName}`);
console.log(`Text: ${textPath}`);
console.log(`Manifest: ${manifestPath}`);
