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
function walkFilesSync(filePath) {
    const files = fs_1.default.readdirSync(filePath, { withFileTypes: true });
    const filenames = [];
    for (const file of files) {
        const newFilePath = path_1.default.join(filePath, file.name);
        if (file.isFile())
            filenames.push(newFilePath);
        else if (file.isDirectory())
            filenames.push(...walkFilesSync(newFilePath));
    }
    return filenames;
}
function packWasmFiles(dirname) {
    const targetPathAssetsLength = `${dirname}/`.length;
    const filenames = walkFilesSync(dirname);
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
    return `window.wasmMap = ${assetsText}`;
}
function packAssets(src, dest) {
    const targetPathAssetsLength = `${dest}/`.length;
    const filenames = walkFilesSync(src);
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
    return `window.assetsMap = ${assetsText}`;
}
function updateSystemJsSign(js, importName) {
    return js.replace(`System.register([`, `System.register("chunks:///${importName}",[`);
}
function removeAllComments(html) {
    return html.replace(/<!--[\s\S]*?-->/g, "").replace(/\n\s*\n/g, '\n');
}
function removeAllScriptTags(html) {
    return html.replace(/<script.*?>[\s\S]*?<\/script>/g, "");
}
function packCssFile(html, buildDir) {
    // 1. 内联 <link rel="stylesheet">
    return html.replace(/<link[^>]+href="([^"]+\.css)"[^>]*>/g, (_, cssPath) => {
        const fullPath = path_1.default.join(buildDir, cssPath);
        if (fs_1.default.existsSync(fullPath)) {
            const css = fs_1.default.readFileSync(fullPath, 'utf-8');
            return `<style>\n${css}\n</style>`;
        }
        return '';
    });
}
function insertScriptTag(content, type) {
    return `\n<script${type ? ` type="${type}"` : ""} charset="utf-8">\n${content}\n</script>`;
}
function insertScriptTagFromFile(filename, chunkName, type) {
    let content = fs_1.default.readFileSync(filename, "utf8");
    content = updateSystemJsSign(content, chunkName !== null && chunkName !== void 0 ? chunkName : path_1.default.basename(filename));
    return insertScriptTag(content, type);
}
function insertScriptTagFromDir(dirname) {
    const filenames = walkFilesSync(dirname);
    let html = "";
    for (let filename of filenames)
        html += insertScriptTagFromFile(filename);
    return html;
}
function insertImportMapTag(filename) {
    let content = fs_1.default.readFileSync(filename, { encoding: "utf8" });
    content = content.replace(`./../cocos-js/cc.js`, "chunks:///cc.js");
    return insertScriptTag(content, "systemjs-importmap");
}
function insertSettingsConfigTag(filename, buildDir) {
    let content = fs_1.default.readFileSync(filename, { encoding: "utf8" });
    let cocosSettings = JSON.parse(content);
    if (cocosSettings.splashScreen != null) {
        cocosSettings.splashScreen.totalTime = 0;
        if (cocosSettings.splashScreen.logo != null)
            cocosSettings.splashScreen.logo.base64 = "";
    }
    let html = insertScriptTag(`cocosSettings=${JSON.stringify(cocosSettings)}`);
    for (let script of cocosSettings.scripting.scriptPackages) {
        let chunksFilename = script.replace("../", "");
        html += insertScriptTagFromFile(path_1.default.join(buildDir, chunksFilename), chunksFilename);
    }
    return html;
}
function insertCocosJsDirTag(dirname) {
    const filenames = walkFilesSync(dirname);
    let html = "";
    for (let filename of filenames) {
        if (path_1.default.extname(filename) == ".js")
            html += insertScriptTagFromFile(filename);
    }
    return html;
}
function insertApplicationTag(filename) {
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
function packSingleHtml(buildDir) {
    const wasmText = packWasmFiles(path_1.default.join(buildDir, "cocos-js"));
    let htmlTags = insertScriptTag(wasmText);
    const assetsText = packAssets(path_1.default.join(buildDir, "assets"), buildDir);
    htmlTags += insertScriptTag(assetsText);
    htmlTags += insertScriptTagFromFile(path_1.default.join(buildDir, "src", "polyfills.bundle.js"));
    htmlTags += insertScriptTagFromFile(path_1.default.join(buildDir, "src", "system.bundle.js"));
    htmlTags += insertSettingsConfigTag(path_1.default.join(buildDir, "src", "settings.json"), buildDir);
    htmlTags += insertImportMapTag(path_1.default.join(buildDir, "src", "import-map.json"));
    htmlTags += insertCocosJsDirTag(path_1.default.join(buildDir, "cocos-js"));
    htmlTags += insertScriptTagFromDir(path_1.default.join(path_1.default.dirname(__dirname), "assets"));
    htmlTags += insertApplicationTag(path_1.default.join(buildDir, "application.js"));
    htmlTags += insertScriptTagFromFile(path_1.default.join(buildDir, "index.js"));
    // polyfills脚本在内嵌以后，会导致System不会自动import，需要手动import一下。
    htmlTags += insertScriptTag("System.import(\"cc\", \"chunks:///cc.js\");\nSystem.import(\"chunks:///index.js\");");
    const indexHtmlPath = path_1.default.join(buildDir, 'index.html');
    let html = fs_1.default.readFileSync(indexHtmlPath, 'utf-8');
    html = removeAllScriptTags(html);
    html = removeAllComments(html);
    html = packCssFile(html, buildDir);
    html = html.slice(0, html.lastIndexOf('</body>'));
    html += htmlTags;
    html += `\n</body>\n</html>`;
    fs_1.default.writeFileSync(`${buildDir}/indexMerge.html`, html, "utf8");
}
exports.packSingleHtml = packSingleHtml;
