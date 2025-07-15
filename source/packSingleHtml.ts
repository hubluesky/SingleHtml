import fs from "fs";
import path from "path";
import { ISettings } from "../@types";
import { compress } from "lzma";
import { encrypt } from "xxtea-node";

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

// function insertScriptTag(content: string, type?: string) {
//   return `\n<script${type ? ` type="${type}"` : ""} charset="utf-8">\n${content}\n</script>`;
// }

function uint8ToUtf16(u8arr: Uint8Array): string {
  let result = '';
  for (let i = 0; i < u8arr.length; i += 2) {
    const code = (u8arr[i] << 8) | (u8arr[i + 1] ?? 0);
    result += String.fromCharCode(code);
  }
  return result;
}

function xxteaEncryptBytes(data: Uint8Array, key: string): Uint8Array {
  const encrypted = encrypt(data, Buffer.from(key));
  return new Uint8Array(encrypted);
}

async function compressAndEncrypt(content: string, key: string = "default-xxtea-key"): Promise<string> {
  return new Promise((resolve, reject) => {
    const inputBytes = Buffer.from(content, 'utf-8');
    compress(inputBytes, 1, (lzmaBytes: Uint8Array, error: Error | null) => {
      if (error) return reject(error);
      const encrypted = xxteaEncryptBytes(lzmaBytes, key);
      const utf16Str = uint8ToUtf16(encrypted);
      resolve(utf16Str);
    });
  });
}

async function insertScriptTag(content: string, key: string = "default-xxtea-key"): Promise<string> {
  const utf16 = await compressAndEncrypt(content, key);
  return `<script type="application/xxtea-lzma-utf16" charset="utf-16" data-decrypt="true">\n${utf16}\n</script>`;
}

function insertScriptTagFromFile(filename: string, chunkName?: string, type?: string): Promise<string> {
  let content = fs.readFileSync(filename, "utf8");
  content = updateSystemJsSign(content, chunkName ?? path.basename(filename));
  return insertScriptTag(content, type);
}

// async function insertScriptTagFromDir(dirname: string): Promise<string> {
//   const filenames = walkFilesSync(dirname);
//   let html = "";
//   for (let filename of filenames)
//     html += await insertScriptTagFromFile(filename);
//   return html;
// }

function insertImportMapTag(filename: string): Promise<string> {
  let content = fs.readFileSync(filename, { encoding: "utf8" });
  content = content.replace(`./../cocos-js/cc.js`, "chunks:///cc.js");
  return insertScriptTag(content, "systemjs-importmap");
}

async function insertSettingsConfigTag(filename: string, buildDir: string): Promise<string> {
  let content = fs.readFileSync(filename, { encoding: "utf8" });
  let cocosSettings: ISettings = JSON.parse(content);
  if (cocosSettings.splashScreen != null) {
    cocosSettings.splashScreen.totalTime = 0;
    if (cocosSettings.splashScreen.logo != null)
      cocosSettings.splashScreen.logo.base64 = "";
  }

  let html = await insertScriptTag(`cocosSettings=${JSON.stringify(cocosSettings)}`);

  for (let script of cocosSettings.scripting.scriptPackages) {
    let chunksFilename = script.replace("../", "");
    html += await insertScriptTagFromFile(path.join(buildDir, chunksFilename), chunksFilename);
  }
  return html;
}

async function insertCocosJsDirTag(dirname: string): Promise<string> {
  const filenames = walkFilesSync(dirname);
  let html = "";
  for (let filename of filenames) {
    if (path.extname(filename) == ".js")
      html += await insertScriptTagFromFile(filename);
  }
  return html;
}

async function insertApplicationTag(filename: string): Promise<string> {
  let content = await insertScriptTagFromFile(filename);
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

export async function packSingleHtml(buildDir: string): Promise<void> {
  const wasmText = packWasmFiles(path.join(buildDir, "cocos-js"));
  let htmlTags = await insertScriptTag(wasmText);
  const assetsText = packAssets(path.join(buildDir, "assets"), buildDir);
  htmlTags += await insertScriptTag(assetsText);

  htmlTags += await insertScriptTagFromFile(path.join(buildDir, "src", "polyfills.bundle.js"));
  htmlTags += await insertScriptTagFromFile(path.join(buildDir, "src", "system.bundle.js"));
  htmlTags += await insertSettingsConfigTag(path.join(buildDir, "src", "settings.json"), buildDir);
  htmlTags += await insertImportMapTag(path.join(buildDir, "src", "import-map.json"));

  htmlTags += await insertCocosJsDirTag(path.join(buildDir, "cocos-js"));

  // htmlTags += await insertScriptTagFromDir(path.join(path.dirname(__dirname), "assets"));
  htmlTags += await insertScriptTagFromFile(path.join(path.dirname(__dirname), "assets", "downloadHandle.js"));

  htmlTags += await insertApplicationTag(path.join(buildDir, "application.js"));
  htmlTags += await insertScriptTagFromFile(path.join(buildDir, "index.js"));

  // polyfills脚本在内嵌以后，会导致System不会自动import，需要手动import一下。
  htmlTags += await insertScriptTag("System.import(\"cc\", \"chunks:///cc.js\");\nSystem.import(\"chunks:///index.js\");");

  let plusHtml = `\n<script>\n${fs.readFileSync(path.join(path.dirname(__dirname), "node_modules", "lzma", "src", "lzma-d-min.js"), 'utf8')}\n</script>`;
  // plusHtml += `\n<script>\n${fs.readFileSync(path.join(path.dirname(__dirname), "node_modules", "xxtea-node", "lib", "xxtea.js"), 'utf8')}\n</script>`;
  plusHtml += `\n<script>\n${fs.readFileSync(path.join(path.dirname(__dirname), "assets", "encoder.js"), 'utf8')}\n</script>`;

  const indexHtmlPath = path.join(buildDir, 'index.html');
  let html = fs.readFileSync(indexHtmlPath, 'utf-8');
  html = removeAllScriptTags(html);
  html = removeAllComments(html);
  html = packCssFile(html, buildDir);
  // replace head
  html = html.replace(/<\/head>/, `${plusHtml}</head>`);
  html = html.slice(0, html.lastIndexOf('</body>'));
  html += htmlTags;
  html += `\n</body>\n</html>`;
  fs.writeFileSync(`${buildDir}/indexMerge.html`, html, "utf8");
}