System.register("chunks:///downloadHandle.js", [], (function () {
  "use strict";

  // base64
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // Use a lookup table to find the index.
  const lookup = typeof Uint8Array === 'undefined' ? [] : new Uint8Array(256);
  for (var i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  function decode(base64) {
    var bufferLength = base64.length * 0.75,
      len = base64.length,
      i, p = 0,
      encoded1, encoded2, encoded3, encoded4;
    if (base64[base64.length - 1] === '=') {
      bufferLength--;
      if (base64[base64.length - 2] === '=') {
        bufferLength--;
      }
    }
    const arraybuffer = new ArrayBuffer(bufferLength),
      bytes = new Uint8Array(arraybuffer);
    for (i = 0; i < len; i += 4) {
      encoded1 = lookup[base64.charCodeAt(i)];
      encoded2 = lookup[base64.charCodeAt(i + 1)];
      encoded3 = lookup[base64.charCodeAt(i + 2)];
      encoded4 = lookup[base64.charCodeAt(i + 3)];
      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return arraybuffer;
  }

  // delete window.resource;
  //- -------------------------------------------

  // DCO --------------------------------------------
  // function getQueryString(name) {
  //   var reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
  //   var r = window.location.search.substr(1).match(reg);
  //   if (r) return r[2];
  // }

  // function getDcoData(assetsPackage) {
  //   var dcoId = getQueryString("dco_gid");
  //   if (window["HttpAPI"])
  //     window["HttpAPI"].sendPoint("dco&cls=" + dcoId);
  //   var dcoConfig = assetsPackage["dco_config_json"];
  //   if (dcoConfig == null) return null;
  //   return dcoConfig[dcoId] || dcoConfig[Object.keys(dcoConfig)[0]];
  // }

  // function getDcoAsset(assetsPackage, dataKey, dcoData) {
  //   var assetsMap;
  //   if (dcoData == null || (assetsMap = dcoData["res"]) == null) return assetsPackage[dataKey];
  //   var newKey = assetsMap[dataKey] || dataKey;
  //   if (dataKey == "gameConfig_json") {
  //     var paramValue = dcoData["param"];
  //     return assetsPackage[dataKey][paramValue];
  //   }
  //   return assetsPackage[newKey];
  // }

  const textSerializeNames = ["json", "text", "_skeletonJson", "_dragonBonesJson", "_atlasJson"];
  const textSerializeJson = [true, false, true, false, true];

  function getMetaAssetData(url, data, isJson) {
    var metaText = window.metaDatasMap[url];
    if (metaText == null) return data;
    var jsonMetaData = JSON.parse(metaText);
    var dataIndex = jsonMetaData[3][0][1];
    var indexJson;
    var indexData = dataIndex.findIndex((value) => {
      indexJson = textSerializeNames.indexOf(value);
      return indexJson != -1;
    }) + 1;
    jsonMetaData[5][0][indexData] = textSerializeJson[indexJson] ? data : JSON.stringify(data);
    return isJson ? jsonMetaData : JSON.stringify(jsonMetaData);
  }

  //-------------------------------------------------

  function downloadScript(url, options, onComplete) {
    var d = document,
      s = document.createElement('script');
    s.type = "text/javascript";
    s.charset = "utf-8";
    s.setAttribute('type', 'text/javascript');
    s.text = window.assetsMap[url];
    d.body.appendChild(s);
    onComplete(null);
  }

  function downloadJson(url, options, onComplete) {
    var data = window.assetsMap[url];
    // data = getMetaAssetData(url, JSON.parse(data), true);
    onComplete(null, JSON.parse(data));
  };

  function downloadText(url, options, onComplete) {
    var data = window.assetsMap[url];
    onComplete(null, data);
  };

  function downloadArrayBuffer(url, options, onComplete) {
    var data = window.assetsMap[url];
    onComplete(null, decode(data));
  }

  function downloadCCONB(url, options, onComplete) {
    var data = window.assetsMap[url];
    const ccon = cc.internal.decodeCCONBinary(new Uint8Array(decode(data)));
    onComplete(null, ccon);
  }

  function downloadAudio(url, options, onComplete) {
    var data = window.assetsMap[url];
    onComplete(null, decode(data));
  }

  function downloadVideo(url, options, onComplete) {
    var data = window.assetsMap[url];

    const video = document.createElement('video');
    const source = document.createElement('source');
    video.appendChild(source);

    var blob = new Blob([decode(data)], { type: "video/mp4" });
    source.src = URL.createObjectURL(blob);
    onComplete(null, video);
  }

  function createVideoClip(id, data, options, onComplete) {
    const out = new VideoClip();
    out._nativeUrl = id;
    out._nativeAsset = data;
    onComplete(null, out);
  }

  function getFontFamily(fontHandle) {
    const ttfIndex = fontHandle.lastIndexOf('.ttf');
    if (ttfIndex === -1) { return fontHandle; }

    const slashPos = fontHandle.lastIndexOf('/');
    let fontFamilyName;
    if (slashPos === -1) {
      fontFamilyName = `${fontHandle.substring(0, ttfIndex)}_LABEL`;
    } else {
      fontFamilyName = `${fontHandle.substring(slashPos + 1, ttfIndex)}_LABEL`;
    }
    if (fontFamilyName.indexOf(' ') !== -1) {
      fontFamilyName = `"${fontFamilyName}"`;
    }
    return fontFamilyName;
  }

  function downloadFont(url, options, onComplete) {
    let fontFamilyName = getFontFamily(url);
    let data = "url(data:application/x-font-woff;charset=utf-8;base64,PASTE-BASE64-HERE) format(\"woff\")";
    data = data.replace("PASTE-BASE64-HERE", window.assetsMap[url]);

    let fontFace = new FontFace(fontFamilyName, data);
    document.fonts.add(fontFace);

    fontFace.load();
    fontFace.loaded.then(function () {
      onComplete(null, fontFamilyName);
    }, function () {
      cc.warnID(4933, fontFamilyName);
      onComplete(null, fontFamilyName);
    });
  }

  function imageToDataUri(image, width, height, onComplete) {
    // create an off-screen canvas
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    // set its dimension to target size
    canvas.width = width;
    canvas.height = height;
    // draw source image into the off-screen canvas:
    ctx.drawImage(image, 0, 0, width, height);
    // encode image to data-uri with base64 version of compressed image
    image.src = canvas.toDataURL("image/png");

    function loadCallback() {
      image.removeEventListener('load', loadCallback);
      onComplete(null, image);
    }
    image.addEventListener('load', loadCallback);
  }

  // function tranlatePicDesc(key, image, onComplete) {
  //   var desc
  //   if (key != null && window.picDesc != null && (desc = window.picDesc[key]) != null) {
  //     var size = desc.split(",");
  //     var width = parseInt(size[0]);
  //     var height = parseInt(size[1]);
  //     if (image.width != width || image.height != height)
  //       return imageToDataUri(image, width, height, onComplete);
  //   }
  //   onComplete(null, image);
  // }

  function downloadImage(url, options, onComplete) {
    var data = window.assetsMap[url];
    var image = new Image();

    function loadCallback() {
      image.removeEventListener('load', loadCallback);
      image.removeEventListener('error', errorCallback);

      // tranlatePicDesc(window.assetsKeyMap[url], image, onComplete);
      onComplete(null, image);
    }

    function errorCallback() {
      image.removeEventListener('load', loadCallback);
      image.removeEventListener('error', errorCallback);

      onComplete(new Error('Load image (' + url + ') failed'));
    }

    image.addEventListener('load', loadCallback);
    image.addEventListener('error', errorCallback);

    if (data.startsWith("data:image/")) {
      image.src = data;
    } else {
      var ext = url.slice(url.lastIndexOf('.') + 1);
      image.src = `data:image/${ext};base64,${data}`;
    }
  }

  const REGEX = /^(?:\w+:\/\/|\.+\/).+/;
  const downloadBundle = (nameOrUrl, options, onCompvare) => {
    const bundleName = cc.path.basename(nameOrUrl);
    var url = nameOrUrl;
    if (!REGEX.test(url)) {
      if (cc.assetManager.downloader.remoteBundles.indexOf(bundleName) !== -1) {
        url = `${cc.assetManager.downloader.remoteServerAddress}remote/${bundleName}`;
      } else {
        url = `assets/${bundleName}`;
      }
    }
    const version = options.version || cc.assetManager.downloader.bundleVers[bundleName];
    var count = 0;
    const config = `${url}/config.${version ? `${version}.` : ''}json`;
    var out = null;
    var error = null;

    downloadJson(config, options, (err, response) => {
      error = err;
      out = response;
      if (out) {
        out.base = `${url}/`;
      }
      if (++count === 2) {
        onCompvare(error, out);
      }
    });

    const jspath = `${url}/index.${version ? `${version}.` : ''}js`;
    downloadScript(jspath, options, (err) => {
      error = err;
      if (++count === 2) {
        onCompvare(err, out);
      }
    });
  };

  const downloaders = {
    // Images
    '.png': downloadImage,
    '.jpg': downloadImage,
    '.jpeg': downloadImage,
    '.webp': downloadImage,

    // Txt
    '.txt': downloadText,
    '.xml': downloadText,
    '.vsh': downloadText,
    '.fsh': downloadText,
    '.atlas': downloadText,

    '.tmx': downloadText,
    '.tsx': downloadText,

    '.json': downloadJson,
    '.ExportJson': downloadJson,
    '.plist': downloadText,

    '.fnt': downloadText,
    '.ttf': downloadFont,

    // Binary
    '.binary': downloadArrayBuffer,
    '.bin': downloadArrayBuffer,
    '.dbbin': downloadArrayBuffer,
    '.skel': downloadArrayBuffer,

    '.cconb': downloadCCONB,

    // audio
    '.mp3': downloadAudio,
    '.mp4': downloadVideo,

    '.js': downloadScript,

    bundle: downloadBundle,
    default: downloadText,
  };

  // 如果有打datajs
  cc.assetManager.downloader.register(downloaders);

  if (window.wasmMap != null) {
    const OldURL = window.URL;
    window.URL = class { href; constructor(url, base) { this.href = url; } static createObjectURL(object) { return OldURL.createObjectURL(object); } }
    window.fetch = function (url) {
      return Promise.resolve(new class {
        arrayBuffer() {
          const arrayBuffer = new Uint8Array(decode(window.wasmMap[url]));
          return Promise.resolve(arrayBuffer);
        }
      });
    }
  }

  return {
    setters: [function (_m) { }],
    execute: function () { }
  }
}));