const QR_VERSION = 6;
const QR_SIZE = QR_VERSION * 4 + 17;
const QR_BORDER = 4;
const QR_DATA_CODEWORDS = 108;
const QR_BLOCK_COUNT = 4;
const QR_BLOCK_DATA_CODEWORDS = 27;
const QR_ECC_CODEWORDS_PER_BLOCK = 16;
const QR_ALIGNMENT_PATTERN_POSITIONS = [6, 34];
const QR_FORMAT_STRINGS_M = [
  0b101010000010010,
  0b101000100100101,
  0b101111001111100,
  0b101101101001011,
  0b100010111111001,
  0b100000011001110,
  0b100111110010111,
  0b100101010100000
];

export function buildQrCodeSvgDataUrl(value: string): string {
  const modules = encodeQrText(value);
  const svg = renderQrSvg(modules);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function encodeQrText(value: string): boolean[][] {
  const text = value.trim();
  if (!text) {
    throw new Error('QR code value is required.');
  }

  const bytes = Array.from(new TextEncoder().encode(text));
  const maxPayloadBytes = Math.floor((QR_DATA_CODEWORDS * 8 - 12) / 8);
  if (bytes.length > maxPayloadBytes) {
    throw new Error('QR code value is too long.');
  }

  const dataCodewords = buildDataCodewords(bytes);
  const interleavedCodewords = interleaveCodewords(dataCodewords);
  const functionModules = createMatrix(false);
  const baseModules = createMatrix(false);

  drawFunctionPatterns(baseModules, functionModules);
  drawCodewords(baseModules, functionModules, interleavedCodewords);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = cloneMatrix(baseModules);

  for (let mask = 0; mask < QR_FORMAT_STRINGS_M.length; mask += 1) {
    const candidateModules = cloneMatrix(baseModules);
    applyMask(candidateModules, functionModules, mask);
    drawFormatBits(candidateModules, mask);

    const penalty = calculatePenalty(candidateModules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = candidateModules;
    }
  }

  if (bestPenalty === Number.POSITIVE_INFINITY) {
    const fallbackModules = cloneMatrix(baseModules);
    drawFormatBits(fallbackModules, bestMask);
    return fallbackModules;
  }

  return bestModules;
}

function buildDataCodewords(bytes: number[]): Uint8Array {
  const bits: number[] = [];

  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const totalBits = QR_DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, totalBits - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = new Uint8Array(QR_DATA_CODEWORDS);
  let codewordIndex = 0;
  for (let bitIndex = 0; bitIndex < bits.length; bitIndex += 8) {
    let value = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      value = (value << 1) | bits[bitIndex + offset];
    }
    codewords[codewordIndex] = value;
    codewordIndex += 1;
  }

  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewordIndex < codewords.length) {
    codewords[codewordIndex] = padBytes[padIndex % 2];
    codewordIndex += 1;
    padIndex += 1;
  }

  return codewords;
}

function interleaveCodewords(dataCodewords: Uint8Array): Uint8Array {
  const generator = buildGeneratorPolynomial(QR_ECC_CODEWORDS_PER_BLOCK);
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];

  for (let blockIndex = 0; blockIndex < QR_BLOCK_COUNT; blockIndex += 1) {
    const start = blockIndex * QR_BLOCK_DATA_CODEWORDS;
    const end = start + QR_BLOCK_DATA_CODEWORDS;
    const dataBlock = dataCodewords.slice(start, end);
    dataBlocks.push(dataBlock);
    eccBlocks.push(computeErrorCorrectionCodewords(dataBlock, generator));
  }

  const interleaved = new Uint8Array(
    QR_DATA_CODEWORDS + QR_BLOCK_COUNT * QR_ECC_CODEWORDS_PER_BLOCK
  );
  let writeIndex = 0;

  for (let column = 0; column < QR_BLOCK_DATA_CODEWORDS; column += 1) {
    for (const dataBlock of dataBlocks) {
      interleaved[writeIndex] = dataBlock[column];
      writeIndex += 1;
    }
  }

  for (let column = 0; column < QR_ECC_CODEWORDS_PER_BLOCK; column += 1) {
    for (const eccBlock of eccBlocks) {
      interleaved[writeIndex] = eccBlock[column];
      writeIndex += 1;
    }
  }

  return interleaved;
}

function buildGeneratorPolynomial(degree: number): Uint8Array {
  let polynomial = new Uint8Array([1]);
  let root = 1;

  for (let degreeIndex = 0; degreeIndex < degree; degreeIndex += 1) {
    const next = new Uint8Array(polynomial.length + 1);
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index];
      next[index + 1] ^= multiplyGf256(polynomial[index], root);
    }
    polynomial = next;
    root = multiplyGf256(root, 0x02);
  }

  return polynomial.slice(1);
}

function computeErrorCorrectionCodewords(
  dataBlock: Uint8Array,
  generator: Uint8Array
): Uint8Array {
  const remainder = new Uint8Array(generator.length);

  for (const byte of dataBlock) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[remainder.length - 1] = 0;

    for (let index = 0; index < generator.length; index += 1) {
      remainder[index] ^= multiplyGf256(generator[index], factor);
    }
  }

  return remainder;
}

function multiplyGf256(left: number, right: number): number {
  let value = 0;
  let multiplicand = left;
  let multiplier = right;

  while (multiplier > 0) {
    if ((multiplier & 1) !== 0) {
      value ^= multiplicand;
    }

    multiplicand <<= 1;
    if ((multiplicand & 0x100) !== 0) {
      multiplicand ^= 0x11d;
    }

    multiplier >>>= 1;
  }

  return value;
}

function drawFunctionPatterns(modules: boolean[][], functionModules: boolean[][]): void {
  drawFinderPattern(modules, functionModules, 0, 0);
  drawFinderPattern(modules, functionModules, QR_SIZE - 7, 0);
  drawFinderPattern(modules, functionModules, 0, QR_SIZE - 7);

  for (const centerY of QR_ALIGNMENT_PATTERN_POSITIONS) {
    for (const centerX of QR_ALIGNMENT_PATTERN_POSITIONS) {
      if (functionModules[centerY][centerX]) {
        continue;
      }
      drawAlignmentPattern(modules, functionModules, centerX, centerY);
    }
  }

  for (let coordinate = 8; coordinate < QR_SIZE - 8; coordinate += 1) {
    const isDark = coordinate % 2 === 0;
    setFunctionModule(modules, functionModules, coordinate, 6, isDark);
    setFunctionModule(modules, functionModules, 6, coordinate, isDark);
  }

  setFunctionModule(modules, functionModules, 8, QR_SIZE - 8, true);
  reserveFormatInfoAreas(modules, functionModules);
}

function drawFinderPattern(
  modules: boolean[][],
  functionModules: boolean[][],
  left: number,
  top: number
): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      if (!isWithinMatrix(x, y)) {
        continue;
      }

      const isSeparator = dx === -1 || dx === 7 || dy === -1 || dy === 7;
      const isOuterBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const isInnerBorder = dx === 1 || dx === 5 || dy === 1 || dy === 5;
      const isDark = !isSeparator && (isOuterBorder || !isInnerBorder);
      setFunctionModule(modules, functionModules, x, y, isDark);
    }
  }
}

function drawAlignmentPattern(
  modules: boolean[][],
  functionModules: boolean[][],
  centerX: number,
  centerY: number
): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(
        modules,
        functionModules,
        centerX + dx,
        centerY + dy,
        distance !== 1
      );
    }
  }
}

function reserveFormatInfoAreas(modules: boolean[][], functionModules: boolean[][]): void {
  for (let y = 0; y <= 5; y += 1) {
    setFunctionModule(modules, functionModules, 8, y, false);
  }
  setFunctionModule(modules, functionModules, 8, 7, false);
  setFunctionModule(modules, functionModules, 8, 8, false);
  setFunctionModule(modules, functionModules, 7, 8, false);
  for (let x = 5; x >= 0; x -= 1) {
    setFunctionModule(modules, functionModules, x, 8, false);
  }

  for (let x = QR_SIZE - 1; x >= QR_SIZE - 8; x -= 1) {
    setFunctionModule(modules, functionModules, x, 8, false);
  }
  for (let y = QR_SIZE - 7; y < QR_SIZE; y += 1) {
    setFunctionModule(modules, functionModules, 8, y, false);
  }
}

function drawCodewords(
  modules: boolean[][],
  functionModules: boolean[][],
  interleavedCodewords: Uint8Array
): void {
  let bitIndex = 0;
  const finalBitLength = interleavedCodewords.length * 8;

  for (let right = QR_SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }

    const shouldReadUpward = ((right + 1) & 2) === 0;
    for (let step = 0; step < QR_SIZE; step += 1) {
      const y = shouldReadUpward ? QR_SIZE - 1 - step : step;

      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const x = right - columnOffset;
        if (functionModules[y][x]) {
          continue;
        }

        const isDark =
          bitIndex < finalBitLength
            ? ((interleavedCodewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1
            : false;
        modules[y][x] = isDark;
        bitIndex += 1;
      }
    }
  }
}

function applyMask(modules: boolean[][], functionModules: boolean[][], mask: number): void {
  for (let y = 0; y < QR_SIZE; y += 1) {
    for (let x = 0; x < QR_SIZE; x += 1) {
      if (functionModules[y][x] || !isMaskConditionMet(mask, x, y)) {
        continue;
      }

      modules[y][x] = !modules[y][x];
    }
  }
}

function drawFormatBits(modules: boolean[][], mask: number): void {
  const formatBits = QR_FORMAT_STRINGS_M[mask];
  if (typeof formatBits !== 'number') {
    throw new Error('Unsupported QR mask.');
  }

  for (let bit = 0; bit <= 5; bit += 1) {
    modules[bit][8] = getBit(formatBits, bit);
  }
  modules[7][8] = getBit(formatBits, 6);
  modules[8][8] = getBit(formatBits, 7);
  modules[8][7] = getBit(formatBits, 8);
  for (let bit = 9; bit < 15; bit += 1) {
    modules[8][14 - bit] = getBit(formatBits, bit);
  }

  for (let bit = 0; bit < 8; bit += 1) {
    modules[8][QR_SIZE - 1 - bit] = getBit(formatBits, bit);
  }
  for (let bit = 8; bit < 15; bit += 1) {
    modules[QR_SIZE - 15 + bit][8] = getBit(formatBits, bit);
  }
}

function calculatePenalty(modules: boolean[][]): number {
  let penalty = 0;

  for (let y = 0; y < QR_SIZE; y += 1) {
    penalty += calculateRunPenalty(modules[y]);
  }

  for (let x = 0; x < QR_SIZE; x += 1) {
    const column = new Array<boolean>(QR_SIZE);
    for (let y = 0; y < QR_SIZE; y += 1) {
      column[y] = modules[y][x];
    }
    penalty += calculateRunPenalty(column);
  }

  for (let y = 0; y < QR_SIZE - 1; y += 1) {
    for (let x = 0; x < QR_SIZE - 1; x += 1) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        penalty += 3;
      }
    }
  }

  for (let y = 0; y < QR_SIZE; y += 1) {
    for (let x = 0; x <= QR_SIZE - 11; x += 1) {
      if (matchesFinderPattern(modules[y].slice(x, x + 11))) {
        penalty += 40;
      }
    }
  }

  for (let x = 0; x < QR_SIZE; x += 1) {
    for (let y = 0; y <= QR_SIZE - 11; y += 1) {
      const segment = new Array<boolean>(11);
      for (let offset = 0; offset < 11; offset += 1) {
        segment[offset] = modules[y + offset][x];
      }
      if (matchesFinderPattern(segment)) {
        penalty += 40;
      }
    }
  }

  let darkModuleCount = 0;
  for (const row of modules) {
    for (const module of row) {
      if (module) {
        darkModuleCount += 1;
      }
    }
  }

  const totalModules = QR_SIZE * QR_SIZE;
  const deviation = Math.abs(darkModuleCount * 20 - totalModules * 10);
  penalty += Math.floor(deviation / totalModules) * 10;

  return penalty;
}

function calculateRunPenalty(modules: boolean[]): number {
  let penalty = 0;
  let runColor = modules[0];
  let runLength = 1;

  for (let index = 1; index < modules.length; index += 1) {
    if (modules[index] === runColor) {
      runLength += 1;
      continue;
    }

    if (runLength >= 5) {
      penalty += runLength - 2;
    }
    runColor = modules[index];
    runLength = 1;
  }

  if (runLength >= 5) {
    penalty += runLength - 2;
  }

  return penalty;
}

function matchesFinderPattern(segment: boolean[]): boolean {
  const leadingPattern = [true, false, true, true, true, false, true, false, false, false, false];
  const trailingPattern = [false, false, false, false, true, false, true, true, true, false, true];

  return arraysEqual(segment, leadingPattern) || arraysEqual(segment, trailingPattern);
}

function arraysEqual(left: boolean[], right: boolean[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function renderQrSvg(modules: boolean[][]): string {
  const sizeWithBorder = QR_SIZE + QR_BORDER * 2;
  let path = '';

  for (let y = 0; y < QR_SIZE; y += 1) {
    for (let x = 0; x < QR_SIZE; x += 1) {
      if (!modules[y][x]) {
        continue;
      }

      path += `M${x + QR_BORDER},${y + QR_BORDER}h1v1h-1z`;
    }
  }

  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` viewBox="0 0 ${sizeWithBorder} ${sizeWithBorder}"`,
    ' shape-rendering="crispEdges">',
    `<rect width="${sizeWithBorder}" height="${sizeWithBorder}" fill="#fff"/>`,
    `<path d="${path}" fill="#111827"/>`,
    '</svg>'
  ].join('');
}

function isMaskConditionMet(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new Error('Unsupported QR mask.');
  }
}

function setFunctionModule(
  modules: boolean[][],
  functionModules: boolean[][],
  x: number,
  y: number,
  isDark: boolean
): void {
  if (!isWithinMatrix(x, y)) {
    return;
  }

  modules[y][x] = isDark;
  functionModules[y][x] = true;
}

function isWithinMatrix(x: number, y: number): boolean {
  return x >= 0 && x < QR_SIZE && y >= 0 && y < QR_SIZE;
}

function appendBits(bits: number[], value: number, bitCount: number): void {
  for (let shift = bitCount - 1; shift >= 0; shift -= 1) {
    bits.push((value >>> shift) & 1);
  }
}

function getBit(value: number, bitIndex: number): boolean {
  return ((value >>> bitIndex) & 1) !== 0;
}

function createMatrix(initialValue: boolean): boolean[][] {
  return Array.from({ length: QR_SIZE }, () => Array.from({ length: QR_SIZE }, () => initialValue));
}

function cloneMatrix(matrix: boolean[][]): boolean[][] {
  return matrix.map((row) => [...row]);
}
