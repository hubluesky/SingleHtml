(function () {
  const key = window._xxtea_key || "default-xxtea-key";

  function utf16ToBytes(str) {
    const len = str.length;
    const bytes = new Uint8Array(len * 2);
    for (let i = 0; i < len; ++i) {
      const code = str.charCodeAt(i);
      bytes[i * 2] = code >> 8;
      bytes[i * 2 + 1] = code & 0xff;
    }
    return bytes;
  }

  function decrypt(bytes) {
    const encrypted = bytes;
    const decrypted = XXTEA.decrypt(encrypted, XXTEA.toBytes(key));
    return decrypted;
  }

  function decompress(data, callback) {
    LZMA.decompress(data, callback);
  }

  function exec(scriptText) {
    const s = document.createElement("script");
    s.charset = "utf-8";
    s.textContent = scriptText;
    document.body.appendChild(s);
  }

  function processScripts() {
    const nodes = document.querySelectorAll('script[type="application/xxtea-lzma-utf16"][data-decrypt="true"]');
    const scripts = Array.from(nodes);

    function next() {
      if (scripts.length === 0) return;
      const tag = scripts.shift();
      const bytes = utf16ToBytes(tag.textContent);
      const decrypted = decrypt(bytes);
      decompress(decrypted, function (result) {
        exec(result);
        next();
      });
    }

    next();
  }

  processScripts();
})();
