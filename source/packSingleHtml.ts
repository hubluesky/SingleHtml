import fs from "fs";
import path from "path";
import { ISettings } from "../@types";

const txtSuffixes = ['.txt', '.xml', '.vsh', '.fsh', '.atlas', '.tmx', '.tsx', '.json', '.ExportJson', '.plist', '.fnt', '.rt', '.mtl', '.pmtl', '.prefab', '.log'];
const scriptSuffixes = ['.js', '.effect', 'chunk'];

function walkFilesSync(filePath: string): string[] {
  const files = fs.readdirSync(filePath, { withFileTypes: true });
  const filenames: string[] = [];
  for (const file of files) {
    const newFilePath = path.join(filePath, file.name);
    if (file.isFile())
      filenames.push(newFilePath);
    else if (file.isDirectory())
      filenames.push(...walkFilesSync(newFilePath));
  }
  return filenames;
}

function packWasmFiles(dirname: string): string {
  const targetPathAssetsLength = `${dirname}/`.length;
  const filenames = walkFilesSync(dirname);
  const assets: Record<string, string> = {};
  for (const filename of filenames) {
    const key = filename.replace(/\\/g, `/`).slice(targetPathAssetsLength);
    const suffix = path.extname(filename);
    if (suffix == ".wasm") {
      const data = fs.readFileSync(filename);
      assets[key] = Buffer.from(data).toString("base64");
    }
  }

  const assetsText = JSON.stringify(assets);
  return `window.wasmMap = ${assetsText}`;
}

function packAssets(src: string, dest: string): string {
  const targetPathAssetsLength = `${dest}/`.length;

  const filenames = walkFilesSync(src);
  const assets: Record<string, string> = {};
  for (const filename of filenames) {
    const key = filename.replace(/\\/g, `/`).slice(targetPathAssetsLength);
    const suffix = path.extname(filename);
    if (txtSuffixes.indexOf(suffix) != -1 || scriptSuffixes.indexOf(suffix) != -1) {
      assets[key] = fs.readFileSync(filename, { encoding: "utf8" });
    } else {
      const data = fs.readFileSync(filename);
      assets[key] = Buffer.from(data).toString("base64");
    }
  }
  const assetsText = JSON.stringify(assets);
  return `window.assetsMap = ${assetsText}`;
}

function updateSystemJsSign(js: string, importName: string): string {
  return js.replace(`System.register([`, `System.register("chunks:///${importName}",[`);
}


function removeAllComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s*\n/g, '\n');
}

function removeAllScriptTags(html: string): string {
  return html.replace(/<script.*?>[\s\S]*?<\/script>/g, "");
}

function packCssFile(html: string, buildDir: string): string {
  // 1. 内联 <link rel="stylesheet">
  return html.replace(/<link[^>]+href="([^"]+\.css)"[^>]*>/g, (_, cssPath) => {
    const fullPath = path.join(buildDir, cssPath);
    if (fs.existsSync(fullPath)) {
      const css = fs.readFileSync(fullPath, 'utf-8');
      return `<style>\n${css}\n</style>`;
    }
    return '';
  });
}

function insertScriptTag(content: string, type?: string) {
  return `\n<script${type ? ` type="${type}"` : ""} charset="utf-8">\n${content}\n</script>`;
}

function insertScriptTagFromFile(filename: string, chunkName?: string, type?: string) {
  let content = fs.readFileSync(filename, "utf8");
  content = updateSystemJsSign(content, chunkName ?? path.basename(filename));
  return insertScriptTag(content, type);
}

function insertScriptTagFromDir(dirname: string): string {
  const filenames = walkFilesSync(dirname);
  let html = "";
  for (let filename of filenames)
    html += insertScriptTagFromFile(filename);
  return html;
}

function insertImportMapTag(filename: string): string {
  let content = fs.readFileSync(filename, { encoding: "utf8" });
  content = content.replace(`./../cocos-js/cc.js`, "chunks:///cc.js");
  return insertScriptTag(content, "systemjs-importmap");
}

function insertSettingsConfigTag(filename: string, buildDir: string): string {
  let content = fs.readFileSync(filename, { encoding: "utf8" });
  let cocosSettings: ISettings = JSON.parse(content);
  if (cocosSettings.splashScreen != null) {
    cocosSettings.splashScreen.totalTime = 0;
    if (cocosSettings.splashScreen.logo != null)
      cocosSettings.splashScreen.logo.base64 = "";
  }

  let html = insertScriptTag(`cocosSettings=${JSON.stringify(cocosSettings)}`);

  for (let script of cocosSettings.scripting.scriptPackages) {
    let chunksFilename = script.replace("../", "");
    html += insertScriptTagFromFile(path.join(buildDir, chunksFilename), chunksFilename);
  }
  return html;
}

function insertCocosJsDirTag(dirname: string): string {
  const filenames = walkFilesSync(dirname);
  let html = "";
  for (let filename of filenames) {
    if (path.extname(filename) == ".js")
      html += insertScriptTagFromFile(filename);
  }
  return html;
}

function insertApplicationTag(filename: string): string {
  let content = insertScriptTagFromFile(filename);
  content = content.replace(`src/settings.json`, "");
  content = content.replace(`src/effect.bin`, "");
  content = content.replace(`cc = engine;`, `
    cc = engine;
    System.import("chunks:///downloadHandle.js");
    cc.settings._settings = window.cocosSettings;
    // cc.effectSettings._data = ArrayBuffer;
    `);
  return content;
}

export function packSingleHtml(buildDir: string): void {
  const wasmText = packWasmFiles(path.join(buildDir, "cocos-js"));
  let htmlTags = insertScriptTag(wasmText);
  const assetsText = packAssets(path.join(buildDir, "assets"), buildDir);
  htmlTags += insertScriptTag(assetsText);

  htmlTags += insertScriptTagFromFile(path.join(buildDir, "src", "polyfills.bundle.js"));
  htmlTags += insertScriptTagFromFile(path.join(buildDir, "src", "system.bundle.js"));
  htmlTags += insertSettingsConfigTag(path.join(buildDir, "src", "settings.json"), buildDir);
  htmlTags += insertImportMapTag(path.join(buildDir, "src", "import-map.json"));

  htmlTags += insertCocosJsDirTag(path.join(buildDir, "cocos-js"));

  htmlTags += insertScriptTagFromDir(path.join(path.dirname(__dirname), "assets"));
  htmlTags += insertApplicationTag(path.join(buildDir, "application.js"));
  htmlTags += insertScriptTagFromFile(path.join(buildDir, "index.js"));

  // polyfills脚本在内嵌以后，会导致System不会自动import，需要手动import一下。
  htmlTags += insertScriptTag("System.import(\"cc\", \"chunks:///cc.js\");\nSystem.import(\"chunks:///index.js\");");

  const indexHtmlPath = path.join(buildDir, 'index.html');
  let html = fs.readFileSync(indexHtmlPath, 'utf-8');
  html = removeAllScriptTags(html);
  html = removeAllComments(html);
  html = packCssFile(html, buildDir);
  html = html.slice(0, html.lastIndexOf('</body>'));
  html += htmlTags;
  html += `\n</body>\n</html>`;
  fs.writeFileSync(`${buildDir}/indexMerge.html`, html, "utf8");
}