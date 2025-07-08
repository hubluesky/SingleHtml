import fs from "fs";
import path from "path";
import { ISettings } from "../@types";

const txtSuffixes = ['.txt', '.xml', '.vsh', '.fsh', '.atlas', '.tmx', '.tsx', '.json', '.ExportJson', '.plist', '.fnt', '.rt', '.mtl', '.pmtl', '.prefab', '.log'];
const scriptSuffixes = ['.js', '.effect', 'chunk'];

function copyDirSync(src: string, dest: string, recursive: boolean = true) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const filenames = fs.readdirSync(src);
  for (const filename of filenames) {
    const subSrcFilename = path.join(src, filename);
    const subDestFilename = path.join(dest, filename);
    const stat = fs.statSync(subSrcFilename);
    if (stat.isFile()) {
      fs.copyFileSync(subSrcFilename, subDestFilename);
    } else if (recursive && stat.isDirectory()) {
      copyDirSync(subSrcFilename, subDestFilename, recursive);
    }
  }
}

function readFilesSync(filePath: string): string[] {
  const files = fs.readdirSync(filePath, { withFileTypes: true });
  const filenames: string[] = [];
  for (const file of files) {
    const newFilePath = path.join(filePath, file.name);
    if (file.isFile())
      filenames.push(newFilePath);
    else if (file.isDirectory())
      filenames.push(...readFilesSync(newFilePath));
  }
  return filenames;
}

function packAssets(src: string, dest: string): void {
  const targetPathAssetsLength = `${dest}/`.length;

  const filenames = readFilesSync(src);
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
  fs.writeFileSync(dest + "/assets.js", `window.assetsMap = ${assetsText}`, "utf8");
}

function packWasmFiles(src: string, dest: string): void {
  const targetPathAssetsLength = `${dest}/`.length;
  const filenames = readFilesSync(src);
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
  fs.writeFileSync(dest + "/wasmAssets.js", `window.wasmMap = ${assetsText}`, "utf8");
}

function appendChunkJs(js: string, importName: string): string {
  return js.replace(`System.register([`, `System.register("chunks:///${importName}",[`);
}

function packChunkJs(filename: string, chunkName: string, callback?: (data: string) => string): void {
  let data = fs.readFileSync(filename, { encoding: "utf8" });
  data = appendChunkJs(data, chunkName);
  if (callback) data = callback(data);
  fs.writeFileSync(filename, data, "utf8");
}

function packApplicationJs(filename: string): void {
  packChunkJs(filename, "application.js", (data) => {
    data = data.replace(`src/settings.json`, "");
    data = data.replace(`src/effect.bin`, "");
    data = data.replace(`cc = engine;`, `
    cc = engine;
    System.import("chunks:///downloadHandle.js");
    cc.settings._settings = window.cocosSettings;
    // cc.effectSettings._data = ArrayBuffer;
    `);
    return data;
  });
}

function packSettingsConfig(inputName: string, outputName: string): string[] {
  let data = fs.readFileSync(inputName, { encoding: "utf8" });
  let cocosSettings: ISettings = JSON.parse(data);
  if (cocosSettings.splashScreen != null) {
    cocosSettings.splashScreen.totalTime = 0;
    if (cocosSettings.splashScreen.logo != null)
      cocosSettings.splashScreen.logo.base64 = "";
  }
  fs.writeFileSync(outputName, `cocosSettings=${JSON.stringify(cocosSettings)}`, "utf8");
  fs.rmSync(inputName);
  return cocosSettings.scripting.scriptPackages!;
}

function packCocosJsFile(outPath: string, dirName: string, packScripts: string[]): void {
  const dirents = fs.readdirSync(`${outPath}/${dirName}`, { withFileTypes: true });
  for (const dirent of dirents) {
    const filename = `${dirName}/${dirent.name}`;
    if (dirent.isFile()) {
      const extname = path.extname(filename);
      const filePath = `${outPath}/${filename}`;
      switch (extname) {
        case ".js":
          let data = fs.readFileSync(filePath, { encoding: "utf8" });
          data = appendChunkJs(data, dirent.name);
          fs.writeFileSync(filePath, data, "utf8");
          packScripts.push(filename);
          break;
        case ".wasm":
          const wasmData = fs.readFileSync(filePath);
          const wasmText = Buffer.from(wasmData).toString("base64");
          fs.rmSync(filePath);
          const wasmKey = filename.replace("cocos-js/", ""); // 去掉cocos-js路径
          fs.writeFileSync(filePath + ".js", `if(window.wasmMap==null) window.wasmMap = {}; window.wasmMap["${wasmKey}"]="${wasmText}";`, "utf8");
          packScripts.push(filename + ".js");
          break;
      }
    } else if (dirent.isDirectory()) {
      packCocosJsFile(outPath, filename, packScripts);
    }
  }
}

function packScriptFiles(filename: string, chunks: string): void {
  let data = fs.readFileSync(filename, { encoding: "utf8" });
  data = appendChunkJs(data, chunks);
  fs.writeFileSync(filename, data, "utf8");
}

function packScriptPackages(outPath: string, scriptPackages: string[]): void {
  for (let script of scriptPackages) {
    let chunks = script.replace("../", "");
    packScriptFiles(path.join(outPath, "/temp", script), chunks);
  }
}

function packIndexHtml(filename: string, importmapPath: string, scriptPackages: string[]): void {
  let data = fs.readFileSync(filename, { encoding: "utf8" });
  let importmapData = fs.readFileSync(importmapPath, { encoding: "utf8" });
  // 这两行会导致仓库有可以引入.png
  data = data.replace(`<!--<link rel="apple-touch-icon" href=".png" />-->`, "");
  data = data.replace(`<!--<link rel="apple-touch-icon-precomposed" href=".png" />-->`, "");

  let scripts = "";

  console.log("scriptPackages", scriptPackages)
  for (let script of scriptPackages)
    scripts += `<script src="${script.replace("../", "")}" charset="utf-8"> </script>\n`;

  data = data.replace(`<!-- packages scripts -->`, `${scripts}`);
  const importmapNewData = importmapData.replace(`./../cocos-js/cc.js`, "chunks:///cc.js");
  data = data.replace(`<script type="systemjs-importmap" charset="utf-8"></script>`, `<script type="systemjs-importmap" charset="utf-8">
  ${importmapNewData}
  </script>`);

  fs.writeFileSync(filename, data, "utf8");
}

export function packSingleHtml(outPath: string): void {
  packAssets(path.join(outPath, "assets"), outPath);
  packWasmFiles(path.join(outPath, "cocos-js"), outPath);
  packChunkJs(`${outPath}/index.js`, "index.js");
  packApplicationJs(`${outPath}/application.js`);
  copyDirSync(`${path.dirname(__dirname)}/assets`, `${outPath}`, false);
  const scriptPackages = packSettingsConfig(`${outPath}/src/settings.json`, `${outPath}/src/settings.js`);
  const importmapPath = `${outPath}/src/import-map.json`;
  packScriptPackages(outPath, scriptPackages);
  const cocosJsScripts: string[] = [];
  packCocosJsFile(outPath, "cocos-js", cocosJsScripts);
  packIndexHtml(`${outPath}/index.html`, importmapPath, [...cocosJsScripts, ...scriptPackages]);
  fs.rmSync(importmapPath);
  fs.rmdirSync(`${outPath}/assets`, { recursive: true });
}