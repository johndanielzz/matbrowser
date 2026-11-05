import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const start = Number(process.argv[3] || 1);
const end = Number(process.argv[4] || 200);
const out = process.argv[5];

const text = readFileSync(file, "utf8").split(/\r?\n/);
const slice = text.slice(start - 1, end).map((l, i) => String(start + i).padStart(4) + " | " + l).join("\n");
if (out) { writeFileSync(out, slice, "utf8"); console.log("wrote " + out + " lines " + start + "-" + end); }
else console.log(slice);
