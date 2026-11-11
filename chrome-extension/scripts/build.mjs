import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

fs.mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: [
    path.join(rootDir, "src", "background.mjs"),
    path.join(rootDir, "src", "content.mjs"),
    path.join(rootDir, "src", "sidepanel.mjs")
  ],
  outdir: distDir,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome128"],
  sourcemap: false,
  minify: false,
  logLevel: "info"
});

fs.copyFileSync(
  path.join(rootDir, "src", "sidepanel.html"),
  path.join(distDir, "sidepanel.html")
);
fs.copyFileSync(
  path.join(rootDir, "src", "sidepanel.css"),
  path.join(distDir, "sidepanel.css")
);

console.log("Built Chrome MV3 extension bundle in", distDir);
