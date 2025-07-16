"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packSingleHtml = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xxtea_node_1 = require("xxtea-node");
const lz_string_1 = require("lz-string");
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
// function insertScriptTag(content: string, type?: string) {
//   return `\n<script${type ? ` type="${type}"` : ""} charset="utf-8">\n${content}\n</script>`;
// }
function xxteaEncryptBytes(data, key) {
    const encrypted = (0, xxtea_node_1.encrypt)(data, Buffer.from(key));
    return new Uint8Array(encrypted);
}
function insertScriptTag(content, type, key = "your-key") {
    return __awaiter(this, void 0, void 0, function* () {
        // const utf8 = Buffer.from(content, 'utf-8');
        // const compressed = await new Promise<Uint8Array>((resolve, reject) => {
        //   compress(utf8, 1, (out: Uint8Array, err: Error | null) => {
        //     if (err) reject(err);
        //     else resolve(out);
        //   });
        // });
        // const encrypted = xxteaEncryptBytes(compressed, key);
        // const utf16 = encode(compressed);
        const utf16 = (0, lz_string_1.compressToUTF16)(content);
        // const textutf8 = decode(utf16);
        // console.log('insertScriptTag compressed:', content, compressed, utf16);
        // const decompressd = await new Promise((resolve, reject) => {
        //   decompress(textutf8, function (out: Uint8Array, err: Error | null) {
        //     if (err) reject(err);
        //     else resolve(out);
        //   })
        // });
        // console.log('insertScriptTag textutf8:', textutf8, decompressd);
        if (type == null)
            return `<script type="application/xxtea-lzma-utf16" data-decrypt="true">${utf16}</script>`;
        return `<script type="application/xxtea-lzma-utf16" data-decrypt="true" srctype="${type}">${utf16}</script>`;
    });
}
function insertScriptTagFromFile(filename, chunkName, type) {
    let content = fs_1.default.readFileSync(filename, "utf8");
    content = updateSystemJsSign(content, chunkName !== null && chunkName !== void 0 ? chunkName : path_1.default.basename(filename));
    return insertScriptTag(content, type);
}
// async function insertScriptTagFromDir(dirname: string): Promise<string> {
//   const filenames = walkFilesSync(dirname);
//   let html = "";
//   for (let filename of filenames)
//     html += await insertScriptTagFromFile(filename);
//   return html;
// }
function insertImportMapTag(filename) {
    let content = fs_1.default.readFileSync(filename, { encoding: "utf8" });
    content = content.replace(`./../cocos-js/cc.js`, "chunks:///cc.js");
    return insertScriptTag(content, "systemjs-importmap");
}
function insertSettingsConfigTag(filename, buildDir) {
    return __awaiter(this, void 0, void 0, function* () {
        let content = fs_1.default.readFileSync(filename, { encoding: "utf8" });
        let cocosSettings = JSON.parse(content);
        if (cocosSettings.splashScreen != null) {
            cocosSettings.splashScreen.totalTime = 0;
            if (cocosSettings.splashScreen.logo != null)
                cocosSettings.splashScreen.logo.base64 = "";
        }
        let html = yield insertScriptTag(`cocosSettings=${JSON.stringify(cocosSettings)}`);
        for (let script of cocosSettings.scripting.scriptPackages) {
            let chunksFilename = script.replace("../", "");
            html += yield insertScriptTagFromFile(path_1.default.join(buildDir, chunksFilename), chunksFilename);
        }
        return html;
    });
}
function insertCocosJsDirTag(dirname) {
    return __awaiter(this, void 0, void 0, function* () {
        const filenames = walkFilesSync(dirname);
        let html = "";
        for (let filename of filenames) {
            if (path_1.default.extname(filename) == ".js")
                html += yield insertScriptTagFromFile(filename);
        }
        return html;
    });
}
function insertApplicationTag(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        let content = fs_1.default.readFileSync(filename, "utf8");
        content = updateSystemJsSign(content, path_1.default.basename(filename));
        content = content.replace(`src/settings.json`, "");
        content = content.replace(`src/effect.bin`, "");
        content = content.replace(`cc = engine;`, `
    cc = engine;
    System.import("chunks:///downloadHandle.js");
    cc.settings._settings = window.cocosSettings;
    // cc.effectSettings._data = ArrayBuffer;
    `);
        return insertScriptTag(content);
    });
}
function packSingleHtml(buildDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const wasmText = packWasmFiles(path_1.default.join(buildDir, "cocos-js"));
        let htmlTags = "";
        htmlTags += yield insertScriptTag(wasmText);
        const assetsText = packAssets(path_1.default.join(buildDir, "assets"), buildDir);
        htmlTags += yield insertScriptTag(assetsText);
        htmlTags += yield insertScriptTagFromFile(path_1.default.join(buildDir, "src", "polyfills.bundle.js"));
        htmlTags += yield insertScriptTagFromFile(path_1.default.join(buildDir, "src", "system.bundle.js"));
        htmlTags += yield insertSettingsConfigTag(path_1.default.join(buildDir, "src", "settings.json"), buildDir);
        htmlTags += yield insertImportMapTag(path_1.default.join(buildDir, "src", "import-map.json"));
        htmlTags += yield insertCocosJsDirTag(path_1.default.join(buildDir, "cocos-js"));
        htmlTags += yield insertScriptTagFromFile(path_1.default.join(path_1.default.dirname(__dirname), "assets", "downloadHandle.js"));
        htmlTags += yield insertApplicationTag(path_1.default.join(buildDir, "application.js"));
        htmlTags += yield insertScriptTagFromFile(path_1.default.join(buildDir, "index.js"));
        // polyfills脚本在内嵌以后，会导致System不会自动import，需要手动import一下。
        htmlTags += yield insertScriptTag("System.import(\"cc\", \"chunks:///cc.js\");\nSystem.import(\"chunks:///index.js\");");
        let plusHtml = `\n<script>${fs_1.default.readFileSync(path_1.default.join(path_1.default.dirname(__dirname), "node_modules", "lz-string", "libs", "lz-string.min.js"), 'utf8')}</script>`;
        // let plusHtml = `\n<script>${fs.readFileSync(path.join(path.dirname(__dirname), "node_modules", "lzma", "src", "lzma-d-min.js"), 'utf8')}</script>`;
        htmlTags += `\n<script>${fs_1.default.readFileSync(path_1.default.join(path_1.default.dirname(__dirname), "assets", "encoder.js"), 'utf8')}</script>`;
        const indexHtmlPath = path_1.default.join(buildDir, 'index.html');
        let html = fs_1.default.readFileSync(indexHtmlPath, 'utf-8');
        html = removeAllScriptTags(html);
        html = removeAllComments(html);
        html = packCssFile(html, buildDir);
        // replace head
        html = html.replace(/<\/head>/, `${plusHtml}</head>`);
        html = html.slice(0, html.lastIndexOf('</body>'));
        html += htmlTags;
        html += `\n</body>\n</html>`;
        fs_1.default.writeFileSync(`${buildDir}/indexMerge.html`, html, "utf8");
    });
}
exports.packSingleHtml = packSingleHtml;
