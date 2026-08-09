// Минимальный ZIP-архиватор в чистом JS, без внешних зависимостей и без
// сети. Используется движком генерации кода (codegen-engine.js), чтобы
// упаковать сгенерированный проект в один .zip-файл для скачивания —
// целиком на устройстве, никаких запросов куда-либо.
//
// Метод сжатия — STORE (0), т.е. без сжатия. Для маленьких текстовых
// проектов (несколько КБ кода) это не имеет практического значения, а
// реализация получается компактной и надёжной без zlib/deflate в браузере.
"use strict";

// Таблица CRC-32 (стандартный полином 0xEDB88320), нужна для контрольных
// сумм записей ZIP.
var CRC_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  var crc = 0xffffffff;
  for (var i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

// MS-DOS дата/время (00:00:00 01.01.2020) — фиксированное значение,
// т.к. точная метка времени для сгенерированного проекта не важна.
var DOS_TIME = 0;
var DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

function u16(v) {
  return [v & 0xff, (v >>> 8) & 0xff];
}
function u32(v) {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

/**
 * Собирает ZIP-архив (без сжатия) из списка файлов.
 * @param {{path: string, content: string}[]} files
 * @returns {Uint8Array}
 */
export function createZip(files) {
  var localChunks = [];
  var centralChunks = [];
  var offset = 0;

  files.forEach(function (file) {
    var nameBytes = strToBytes(file.path);
    var dataBytes = strToBytes(file.content);
    var crc = crc32(dataBytes);
    var size = dataBytes.length;

    var localHeader = []
      .concat(u32(0x04034b50)) // local file header signature
      .concat(u16(20)) // version needed
      .concat(u16(0)) // flags
      .concat(u16(0)) // method: STORE
      .concat(u16(DOS_TIME))
      .concat(u16(DOS_DATE))
      .concat(u32(crc))
      .concat(u32(size)) // compressed size
      .concat(u32(size)) // uncompressed size
      .concat(u16(nameBytes.length))
      .concat(u16(0)); // extra length

    var localEntry = new Uint8Array(localHeader.length + nameBytes.length + dataBytes.length);
    localEntry.set(localHeader, 0);
    localEntry.set(nameBytes, localHeader.length);
    localEntry.set(dataBytes, localHeader.length + nameBytes.length);
    localChunks.push(localEntry);

    var centralHeader = []
      .concat(u32(0x02014b50)) // central directory header signature
      .concat(u16(20)) // version made by
      .concat(u16(20)) // version needed
      .concat(u16(0)) // flags
      .concat(u16(0)) // method
      .concat(u16(DOS_TIME))
      .concat(u16(DOS_DATE))
      .concat(u32(crc))
      .concat(u32(size))
      .concat(u32(size))
      .concat(u16(nameBytes.length))
      .concat(u16(0)) // extra length
      .concat(u16(0)) // comment length
      .concat(u16(0)) // disk number start
      .concat(u16(0)) // internal attrs
      .concat(u32(0)) // external attrs
      .concat(u32(offset)); // relative offset of local header

    var centralEntry = new Uint8Array(centralHeader.length + nameBytes.length);
    centralEntry.set(centralHeader, 0);
    centralEntry.set(nameBytes, centralHeader.length);
    centralChunks.push(centralEntry);

    offset += localEntry.length;
  });

  var centralStart = offset;
  var centralSize = centralChunks.reduce(function (sum, c) { return sum + c.length; }, 0);

  var endRecord = []
    .concat(u32(0x06054b50)) // end of central directory signature
    .concat(u16(0)) // disk number
    .concat(u16(0)) // disk with central dir
    .concat(u16(files.length)) // entries on this disk
    .concat(u16(files.length)) // total entries
    .concat(u32(centralSize))
    .concat(u32(centralStart))
    .concat(u16(0)); // comment length

  var totalSize = offset + centralSize + endRecord.length;
  var out = new Uint8Array(totalSize);
  var pos = 0;
  localChunks.forEach(function (chunk) { out.set(chunk, pos); pos += chunk.length; });
  centralChunks.forEach(function (chunk) { out.set(chunk, pos); pos += chunk.length; });
  out.set(new Uint8Array(endRecord), pos);

  return out;
}

/**
 * Конвертирует Uint8Array в base64-строку без использования сетевых API
 * или больших промежуточных строк за один вызов (безопасно для файлов
 * размером в единицы МБ, что более чем достаточно для сгенерированного
 * исходного кода).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  var CHUNK = 0x8000;
  var chunks = [];
  for (var i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(""));
}
