(function () {
    const key = window._xxtea_key || "your-key";

    const BITS_PER_CHAR = 15 // Base32768 is a 15-bit encoding
    const BITS_PER_BYTE = 8

    const pairStrings = [
        'ҠҿԀԟڀڿݠޟ߀ߟကဟႠႿᄀᅟᆀᆟᇠሿበቿዠዿጠጿᎠᏟᐠᙟᚠᛟកសᠠᡟᣀᣟᦀᦟ᧠᧿ᨠᨿᯀᯟᰀᰟᴀᴟ⇠⇿⋀⋟⍀⏟␀␟─❟➀➿⠀⥿⦠⦿⨠⩟⪀⪿⫠⭟ⰀⰟⲀⳟⴀⴟⵀⵟ⺠⻟㇀㇟㐀䶟䷀龿ꀀꑿ꒠꒿ꔀꗿꙀꙟꚠꛟ꜀ꝟꞀꞟꡀꡟ',
        'ƀƟɀʟ'
    ]

    const lookupE = {}
    const lookupD = {}
    pairStrings.forEach((pairString, r) => {
        // Decompression
        const encodeRepertoire = []
        pairString.match(/../gu).forEach(pair => {
            const first = pair.codePointAt(0)
            const last = pair.codePointAt(1)
            for (let codePoint = first; codePoint <= last; codePoint++) {
                encodeRepertoire.push(String.fromCodePoint(codePoint))
            }
        })

        const numZBits = BITS_PER_CHAR - BITS_PER_BYTE * r // 0 -> 15, 1 -> 7
        lookupE[numZBits] = encodeRepertoire
        encodeRepertoire.forEach((chr, z) => {
            lookupD[chr] = [numZBits, z]
        })
    })
    const decode = str => {
        const length = str.length

        // This length is a guess. There's a chance we allocate one more byte here
        // than we actually need. But we can count and slice it off later
        const uint8Array = new Uint8Array(Math.floor(length * BITS_PER_CHAR / BITS_PER_BYTE))
        let numUint8s = 0
        let uint8 = 0
        let numUint8Bits = 0

        for (let i = 0; i < length; i++) {
            const chr = str.charAt(i)

            if (!(chr in lookupD)) {
                throw new Error(`Unrecognised Base32768 character: ${chr}`)
            }

            const [numZBits, z] = lookupD[chr]

            if (numZBits !== BITS_PER_CHAR && i !== length - 1) {
                throw new Error('Secondary character found before end of input at position ' + String(i))
            }

            // Take most significant bit first
            for (let j = numZBits - 1; j >= 0; j--) {
                const bit = (z >> j) & 1

                uint8 = (uint8 << 1) + bit
                numUint8Bits++

                if (numUint8Bits === BITS_PER_BYTE) {
                    uint8Array[numUint8s] = uint8
                    numUint8s++
                    uint8 = 0
                    numUint8Bits = 0
                }
            }
        }

        // Final padding bits! Requires special consideration!
        // Remember how we always pad with 1s?
        // Note: there could be 0 such bits, check still works though
        if (uint8 !== ((1 << numUint8Bits) - 1)) {
            throw new Error('Padding mismatch')
        }

        return new Uint8Array(uint8Array.buffer, 0, numUint8s)
    }

    function toBytes(str) {
        var n = str.length;
        // A single code unit uses at most 3 bytes.
        // Two code units at most 4.
        var bytes = new Uint8Array(n * 3);
        var length = 0;
        for (var i = 0; i < n; i++) {
            var codeUnit = str.charCodeAt(i);
            if (codeUnit < 0x80) {
                bytes[length++] = codeUnit;
            }
            else if (codeUnit < 0x800) {
                bytes[length++] = 0xC0 | (codeUnit >> 6);
                bytes[length++] = 0x80 | (codeUnit & 0x3F);
            }
            else if (codeUnit < 0xD800 || codeUnit > 0xDFFF) {
                bytes[length++] = 0xE0 | (codeUnit >> 12);
                bytes[length++] = 0x80 | ((codeUnit >> 6) & 0x3F);
                bytes[length++] = 0x80 | (codeUnit & 0x3F);
            }
            else {
                if (i + 1 < n) {
                    var nextCodeUnit = str.charCodeAt(i + 1);
                    if (codeUnit < 0xDC00 && 0xDC00 <= nextCodeUnit && nextCodeUnit <= 0xDFFF) {
                        var rune = (((codeUnit & 0x03FF) << 10) | (nextCodeUnit & 0x03FF)) + 0x010000;
                        bytes[length++] = 0xF0 | (rune >> 18);
                        bytes[length++] = 0x80 | ((rune >> 12) & 0x3F);
                        bytes[length++] = 0x80 | ((rune >> 6) & 0x3F);
                        bytes[length++] = 0x80 | (rune & 0x3F);
                        i++;
                        continue;
                    }
                }
                throw new Error('Malformed string');
            }
        }
        return bytes.subarray(0, length);
    }

    var delta = 0x9E3779B9;
    function fixk(k) {
        if (k.length < 16) {
            var key = new Uint8Array(16);
            key.set(k);
            k = key;
        }
        return k;
    }

    function mx(sum, y, z, p, e, k) {
        return ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k[p & 3 ^ e] ^ z));
    }

    function toUint8Array(v, includeLength) {
        var length = v.length;
        var n = length << 2;
        if (includeLength) {
            var m = v[length - 1];
            n -= 4;
            if ((m < n - 3) || (m > n)) {
                return null;
            }
            n = m;
        }
        var bytes = new Uint8Array(n);
        for (var i = 0; i < n; ++i) {
            bytes[i] = v[i >> 2] >> ((i & 3) << 3);
        }
        return bytes;
    }

    function toUint32Array(bytes, includeLength) {
        var length = bytes.length;
        var n = length >> 2;
        if ((length & 3) !== 0) {
            ++n;
        }
        var v;
        if (includeLength) {
            v = new Uint32Array(n + 1);
            v[n] = length;
        }
        else {
            v = new Uint32Array(n);
        }
        for (var i = 0; i < length; ++i) {
            v[i >> 2] |= bytes[i] << ((i & 3) << 3);
        }
        return v;
    }

    function decryptUint32Array(v, k) {
        var length = v.length;
        var n = length - 1;
        var y, z, sum, e, p, q;
        y = v[0];
        q = Math.floor(6 + 52 / length);
        for (sum = q * delta; sum !== 0; sum -= delta) {
            e = sum >>> 2 & 3;
            for (p = n; p > 0; --p) {
                z = v[p - 1];
                y = v[p] -= mx(sum, y, z, p, e, k);
            }
            z = v[n];
            y = v[0] -= mx(sum, y, z, p, e, k);
        }
        return v;
    }

    function XXTEAdecrypt(data, key) {
        if (typeof data === 'string') {
            if (typeof Buffer.from === "function") {
                data = Buffer.from(data, 'base64');
            } else {
                data = new Buffer(data, 'base64');
            }
        }
        if (typeof key === 'string') key = toBytes(key);
        if (data === undefined || data === null || data.length === 0) {
            return data;
        }
        return toUint8Array(decryptUint32Array(toUint32Array(data, false), toUint32Array(fixk(key), false)), true);
    }

    function decrypt(bytes) {
        return XXTEAdecrypt(bytes, toBytes(key));
    }

    function decompress(data, callback) {
        // LZMA.decompress(data, callback);
        callback(LZString.decompressFromUTF16(data));
    }

    function exec(code, type) {
        const script = document.createElement("script");
        script.textContent = code;
        if (type != null)
            script.setAttribute('type', type);
        script.setAttribute("charset", "utf-8");
        document.body.appendChild(script);
    }

    const scripts = document.querySelectorAll('script[type="application/xxtea-lzma-utf16"][data-decrypt="true"]');
    const queue = Array.from(scripts);

    function next() {
        if (queue.length === 0) return;
        const tag = queue.shift();
        const type = tag.getAttribute("srctype");
        // const u8 = decode(tag.textContent);
        tag.remove();
        // const dec = decrypt(u8);
        decompress(tag.textContent, (code, err) => {
            // if (err) console.error("decompress: " + err);
            exec(code, type);
            next();
        });

    }

    next();
})();
