# Third-party notices

The browser distributions below are vendored unchanged inside HTML `<script>` partials so the Apps Script HTML-service shell does not depend on an unpinned runtime download. Wrapper tags are project code; the JavaScript between them is the upstream distribution.

## qrcode-generator 2.0.4

- Project: https://github.com/kazuhikoarase/qrcode-generator
- Package: https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz
- Package integrity: `sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==`
- Vendored source: `package/dist/qrcode.js`
- Vendored source SHA-256: `79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c`
- License: MIT; see `docs/licenses/qrcode-generator-2.0.4-LICENSE.txt`
- Copyright: Copyright (c) 2009 Kazuhiko Arase

## html5-qrcode 2.3.8

- Project: https://github.com/mebjas/html5-qrcode
- Package: https://registry.npmjs.org/html5-qrcode/-/html5-qrcode-2.3.8.tgz
- Package integrity: `sha512-jsr4vafJhwoLVEDW3n1KvPnCCXWaQfRng0/EEYk1vNcQGcG/htAdhJX0be8YyqMoSz7+hZvOZSTAepsabiuhiQ==`
- Vendored source: `package/html5-qrcode.min.js`
- Vendored source SHA-256: `660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e`
- License: Apache License 2.0; see `docs/licenses/html5-qrcode-2.3.8-LICENSE.txt`
- Decoder credit: ZXing-js, as recorded by the upstream project

`html5-qrcode` 2.3.8 is intentionally restricted here to local image decoding through `scanFile()`. Apps Script HTML Service restricts permission-sensitive `getUserMedia()` camera access, so this application does not call the live-camera APIs.

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
