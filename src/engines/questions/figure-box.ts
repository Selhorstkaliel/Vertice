import type { Box } from "./rich-text";

/**
 * Tightens an approximate figure box (0–1000 page coordinates, as returned by
 * the AI) against the rendered page: edges that cut through the drawing grow
 * until they reach blank space, white margins are trimmed, and lines of
 * statement text caught at the top or bottom edge are dropped. Page rules (lines crossing
 * the whole box) are ignored so they cannot drag the box along.
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

const INK = 170;
const MAX_GROW = 120;
const MARGIN_PX = 8;
const MIN_INK_PIXELS = 2;
const TEXT_LINE_MAX_PX = 34;
const MIN_FIGURE_PX = 50;
const BAND_GAP_PX = 2;

export function refineBox(image: RasterImage, box: Box): Box {
  const { width, height, data } = image;
  const toPx = (v: number, size: number) => Math.max(0, Math.min(size - 1, Math.round((v / 1000) * size)));
  let top = toPx(box[0], height);
  let left = toPx(box[1], width);
  let bottom = toPx(box[2], height);
  let right = toPx(box[3], width);
  if (bottom - top < 4 || right - left < 4) return box;

  const ink = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return Math.min(data[i]!, data[i + 1]!, data[i + 2]!) < INK;
  };

  // Rules: columns/rows that are ink along almost the whole current box.
  const ruleColumns = new Set<number>();
  const ruleRows = new Set<number>();
  const findRules = () => {
    ruleColumns.clear();
    ruleRows.clear();
    const h = bottom - top + 1;
    const w = right - left + 1;
    for (let x = Math.max(0, left - 2); x <= Math.min(width - 1, right + 2); x++) {
      let n = 0;
      for (let y = top; y <= bottom; y++) if (ink(x, y)) n++;
      if (h > 20 && n / h > 0.9) ruleColumns.add(x);
    }
    for (let y = Math.max(0, top - 2); y <= Math.min(height - 1, bottom + 2); y++) {
      let n = 0;
      for (let x = left; x <= right; x++) if (ink(x, y)) n++;
      if (w > 20 && n / w > 0.9) ruleRows.add(y);
    }
  };
  const rowInk = (y: number, x0: number, x1: number) => {
    if (ruleRows.has(y)) return false;
    let n = 0;
    for (let x = x0; x <= x1; x++) if (!ruleColumns.has(x) && ink(x, y) && ++n >= MIN_INK_PIXELS) return true;
    return false;
  };
  const colInk = (x: number, y0: number, y1: number) => {
    if (ruleColumns.has(x)) return false;
    let n = 0;
    for (let y = y0; y <= y1; y++) if (!ruleRows.has(y) && ink(x, y) && ++n >= MIN_INK_PIXELS) return true;
    return false;
  };

  findRules();
  const limitY = Math.round((MAX_GROW / 1000) * height);
  const limitX = Math.round((MAX_GROW / 1000) * width);
  const start = { top, left, bottom, right };
  for (let changed = true; changed; ) {
    changed = false;
    if (top > 0 && start.top - top < limitY && rowInk(top, left, right)) {
      top--;
      changed = true;
    }
    if (bottom < height - 1 && bottom - start.bottom < limitY && rowInk(bottom, left, right)) {
      bottom++;
      changed = true;
    }
    if (left > 0 && start.left - left < limitX && colInk(left, top, bottom)) {
      left--;
      changed = true;
    }
    if (right < width - 1 && right - start.right < limitX && colInk(right, top, bottom)) {
      right++;
      changed = true;
    }
  }

  // Trim white margins.
  while (top < bottom && !rowInk(top, left, right)) top++;
  while (bottom > top && !rowInk(bottom, left, right)) bottom--;
  while (left < right && !colInk(left, top, bottom)) left++;
  while (right > left && !colInk(right, top, bottom)) right--;

  // Strip lines of statement text caught at the top or bottom edge. A text line
  // is a short band with many small ink runs (letters); drawings have few, long ones.
  // Scanner speckles between lines would glue a paragraph into one band: a row needs real ink to count here.
  const strongRow = (y: number) => {
    const needed = Math.max(4, Math.round((right - left + 1) * 0.004));
    let n = 0;
    for (let x = left; x <= right; x++) if (!ruleColumns.has(x) && ink(x, y) && ++n >= needed) return true;
    return false;
  };
  const bands: [number, number][] = [];
  let bandStart = -1;
  let blank = 0;
  for (let y = top; y <= bottom; y++) {
    if (strongRow(y)) {
      if (bandStart < 0) bandStart = y;
      else if (blank >= BAND_GAP_PX) {
        bands.push([bandStart, y - blank - 1]);
        bandStart = y;
      }
      blank = 0;
    } else if (bandStart >= 0) blank++;
  }
  if (bandStart >= 0) bands.push([bandStart, bottom - blank]);
  const textLike = ([y0, y1]: [number, number]) => {
    if (y1 - y0 > TEXT_LINE_MAX_PX) return false;
    let runs = 0;
    let inkPixels = 0;
    for (let y = y0; y <= y1; y++) {
      let previous = false;
      for (let x = left; x <= right; x++) {
        const on = !ruleColumns.has(x) && ink(x, y);
        if (on) inkPixels++;
        if (on && !previous) runs++;
        previous = on;
      }
    }
    const rows = y1 - y0 + 1;
    const span = right - left + 1;
    // Letters: roughly one run every 10–25 px along the line, and not a solid block.
    return runs / rows / span > 0.03 && inkPixels / (rows * span) < 0.35;
  };
  const bandsHeight = (b: [number, number][]) => (b.length ? b.at(-1)![1] - b[0]![0] : 0);
  while (bands.length >= 2 && textLike(bands[0]!) && bandsHeight(bands.slice(1)) >= MIN_FIGURE_PX) bands.shift();
  while (bands.length >= 2 && textLike(bands.at(-1)!) && bandsHeight(bands.slice(0, -1)) >= MIN_FIGURE_PX) bands.pop();
  if (bands.length) {
    top = bands[0]![0];
    bottom = bands.at(-1)![1];
    // Horizontal extent of what is left.
    while (left < right && !colInk(left, top, bottom)) left++;
    while (right > left && !colInk(right, top, bottom)) right--;
  }

  if (bottom - top < 10 || right - left < 10) return box;
  const back = (v: number, size: number) => Math.max(0, Math.min(1000, Math.round((v / size) * 1000)));
  return [back(top - MARGIN_PX, height), back(left - MARGIN_PX, width), back(bottom + MARGIN_PX, height), back(right + MARGIN_PX, width)];
}
