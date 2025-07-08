"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packSingleHtml = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const txtSuffixes = ['.txt', '.xml', '.vsh', '.fsh', '.atlas', '.tmx', '.tsx', '.json', '.ExportJson', '.plist', '.fnt', '.rt', '.mtl', '.pmtl', '.prefab', '.log'];
const scriptSuffixes = ['.js', '.effect', 'chunk'];
function copyDirSync(src, dest, recursive = true) {
    if (!fs_1.default.existsSync(dest))
        fs_1.default.mkdirSync(dest, { recursive: true });
    const filenames = fs_1.default.readdirSync(src);
    for (const filename of filenames) {
        const subSrcFilename = path_1.default.join(src, filename);
        const subDestFilename = path_1.default.join(dest, filename);
        const stat = fs_1.default.statSync(subSrcFilename);
        if (stat.isFile()) {
            fs_1.default.copyFileSync(subSrcFilename, subDestFilename);
        }
        else if (recursive && stat.isDirectory()) {
            copyDirSync(subSrcFilename, subDestFilename, recursive);
        }
    }
}
function readFilesSync(filePath) {
    const files = fs_1.default.readdirSync(filePath, { withFileTypes: true });
    const filenames = [];
    for (const file of files) {
        const newFilePath = path_1.default.join(filePath, file.name);
        if (file.isFile())
            filenames.push(newFilePath);
        else if (file.isDirectory())
            filenames.push(...readFilesSync(newFilePath));
    }
    return filenames;
}
function packAssets(src, dest) {
    const targetPathAssetsLength = `${dest}/`.length;
    const filenames = readFilesSync(src);
    const assets = {};
    for (const filename of filenames) {
        const key = filename.replace(/\\/g, `/`).slice(targetPathAssetsLength);
        const suffix = path_1.default.extname(filename);
        if (txtSuffixes.indexOf(suffix) != -1 || scriptSuffixes.indexOf(suffix) != -1) {
            assets[key] = fs_1.default.readFileSync(filename, { encoding: "utf8" });
        }
        else {
            const data = fs_1.default.readFileSync(filename);
            assets[key] = Buffer.from(data).toString("base64");
        }
    }
    const assetsText = JSON.stringify(assets);
    fs_1.default.writeFileSync(dest + "/assets.js", `window.assetsMap = ${assetsText}`, "utf8");
}
function packWasmFiles(src, dest) {
    const targetPathAssetsLength = `${dest}/`.length;
    const filenames = readFilesSync(src);
    const assets = {};
    for (const filename of filenames) {
        const key = filename.replace(/\\/g, `/`).slice(targetPathAssetsLength);
        const suffix = path_1.default.extname(filename);
        if (suffix == ".wasm") {
            const data = fs_1.default.readFileSync(filename);
            assets[key] = Buffer.from(data).toString("base64");
        }
    }
    const assetsText = JSON.stringify(assets);
    fs_1.default.writeFileSync(dest + "/wasmAssets.js", `window.wasmMap = ${assetsText}`, "utf8");
}
function appendChunkJs(js, importName) {
    return js.replace(`System.register([`, `System.register("chunks:///${importName}",[`);
}
function packChunkJs(filename, chunkName, callback) {
    let data = fs_1.default.readFileSync(filename, { encoding: "utf8" });
    data = appendChunkJs(data, chunkName);
    if (callback)
        data = callback(data);
    fs_1.default.writeFileSync(filename, data, "utf8");
}
function packApplicationJs(filename) {
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
function packSettingsConfig(inputName, outputName) {
    let data = fs_1.default.readFileSync(inputName, { encoding: "utf8" });
    let cocosSettings = JSON.parse(data);
    if (cocosSettings.splashScreen != null) {
        cocosSettings.splashScreen.totalTime = 0;
        if (cocosSettings.splashScreen.logo != null)
            cocosSettings.splashScreen.logo.base64 = "";
    }
    fs_1.default.writeFileSync(outputName, `cocosSettings=${JSON.stringify(cocosSettings)}`, "utf8");
    fs_1.default.rmSync(inputName);
    return cocosSettings.scripting.scriptPackages;
}
function packCocosJsFile(outPath, dirName, packScripts) {
    const dirents = fs_1.default.readdirSync(`${outPath}/${dirName}`, { withFileTypes: true });
    for (const dirent of dirents) {
        const filename = `${dirName}/${dirent.name}`;
        if (dirent.isFile()) {
            const extname = path_1.default.extname(filename);
            const filePath = `${outPath}/${filename}`;
            switch (extname) {
                case ".js":
                    let data = fs_1.default.readFileSync(filePath, { encoding: "utf8" });
                    data = appendChunkJs(data, dirent.name);
                    fs_1.default.writeFileSync(filePath, data, "utf8");
                    packScripts.push(filename);
                    break;
                case ".wasm":
                    const wasmData = fs_1.default.readFileSync(filePath);
                    const wasmText = Buffer.from(wasmData).toString("base64");
                    fs_1.default.rmSync(filePath);
                    const wasmKey = filename.replace("cocos-js/", ""); // 去掉cocos-js路径
                    fs_1.default.writeFileSync(filePath + ".js", `if(window.wasmMap==null) window.wasmMap = {}; window.wasmMap["${wasmKey}"]="${wasmText}";`, "utf8");
                    packScripts.push(filename + ".js");
                    break;
            }
        }
        else if (dirent.isDirectory()) {
            packCocosJsFile(outPath, filename, packScripts);
        }
    }
}
function packScriptFiles(filename, chunks) {
    let data = fs_1.default.readFileSync(filename, { encoding: "utf8" });
    data = appendChunkJs(data, chunks);
    fs_1.default.writeFileSync(filename, data, "utf8");
}
function packScriptPackages(outPath, scriptPackages) {
    for (let script of scriptPackages) {
        let chunks = script.replace("../", "");
        packScriptFiles(path_1.default.join(outPath, "/temp", script), chunks);
    }
}
function packIndexHtml(filename, importmapPath, scriptPackages) {
    let data = fs_1.default.readFileSync(filename, { encoding: "utf8" });
    let importmapData = fs_1.default.readFileSync(importmapPath, { encoding: "utf8" });
    // 这两行会导致仓库有可以引入.png
    data = data.replace(`<!--<link rel="apple-touch-icon" href=".png" />-->`, "");
    data = data.replace(`<!--<link rel="apple-touch-icon-precomposed" href=".png" />-->`, "");
    let scripts = "";
    console.log("scriptPackages", scriptPackages);
    for (let script of scriptPackages)
        scripts += `<script src="${script.replace("../", "")}" charset="utf-8"> </script>\n`;
    data = data.replace(`<!-- packages scripts -->`, `${scripts}`);
    const importmapNewData = importmapData.replace(`./../cocos-js/cc.js`, "chunks:///cc.js");
    data = data.replace(`<script type="systemjs-importmap" charset="utf-8"></script>`, `<script type="systemjs-importmap" charset="utf-8">
  ${importmapNewData}
  </script>`);
    fs_1.default.writeFileSync(filename, data, "utf8");
}
function packSingleHtml(outPath) {
    packAssets(path_1.default.join(outPath, "assets"), outPath);
    packWasmFiles(path_1.default.join(outPath, "cocos-js"), outPath);
    packChunkJs(`${outPath}/index.js`, "index.js");
    packApplicationJs(`${outPath}/application.js`);
    copyDirSync(`${path_1.default.dirname(__dirname)}/assets`, `${outPath}`, false);
    const scriptPackages = packSettingsConfig(`${outPath}/src/settings.json`, `${outPath}/src/settings.js`);
    const importmapPath = `${outPath}/src/import-map.json`;
    packScriptPackages(outPath, scriptPackages);
    const cocosJsScripts = [];
    packCocosJsFile(outPath, "cocos-js", cocosJsScripts);
    packIndexHtml(`${outPath}/index.html`, importmapPath, [...cocosJsScripts, ...scriptPackages]);
    fs_1.default.rmSync(importmapPath);
    fs_1.default.rmdirSync(`${outPath}/assets`, { recursive: true });
}
exports.packSingleHtml = packSingleHtml;
