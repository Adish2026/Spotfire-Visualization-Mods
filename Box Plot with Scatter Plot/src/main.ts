/*
 * Box Plot with Jittered Points – main.ts 
 * ------------------------------------------------------------

// ------------------------------
// Utility helpers
// ------------------------------

/** Safely escape HTML special characters for attribute/text usage. */
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Obtain a formatted value from a hierarchy node, with fallbacks. */
function safeFormattedValue(node: Spotfire.DataViewHierarchyNode): string {
  try {
    const fn = (node as any).formattedValue;
    if (typeof fn === 'function') return fn.call(node);
    if (typeof fn === 'string') return fn;
    return '';
  } catch {
    return '';
  }
}

/** Query a DOM element and throw descriptively if missing. */
function findElem(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el as HTMLElement;
}

/** Create a div with a class and optional text/element child. */
function createDiv(className: string, content?: string | HTMLElement): HTMLDivElement {
  const elem = document.createElement('div');
  elem.classList.add(className);
  if (typeof content === 'string') elem.appendChild(document.createTextNode(content));
  else if (content) elem.appendChild(content);
  return elem;
}

/** Read a numeric ModProperty value with fallback for non-finite values. */
function propNum(p: Spotfire.ModProperty<number>, fallback: number): number {
  const v = p.value();
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Clamp a number to [min, max]. */
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

/** Convert a hex color to rgba string with specified alpha. */
function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

/** Parse a hex color (#rgb or #rrggbb) to RGB object. */
function hexToRgb(hex: string): { r: number, g: number, b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/** Convert RGB components to #rrggbb hex string. */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Darken a hex color by the given percent (0–100). */
function darkenHex(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - Math.max(0, Math.min(100, percent)) / 100;
  return rgbToHex(Math.round(r * f), Math.round(g * f), Math.round(b * f));
}

// Tracks whether to render vertical group separators (X-grid-like).
let lastShowXGrid = true;

// ------------------------------
// Settings snapshot + serialized write helper (Fix #1 and #2)
// ------------------------------

type SettingsSnapshot = {
  jitterWidth: number;
  showYGrid: boolean;
  showXGrid: boolean;
  pointSize: number;
  pointOpacityPct: number;
  yRangeMode: string;
  yMinManual: string;
  yMaxManual: string;
  yIncludeOrigin: boolean;
  yTickIntervalMode: string;
  yTickInterval: string;
  annotationMode: string;
  annotationTest: string;
  annotationPAdj: string;
  annotationPairs: string;
  annotationAlpha: number;
  annotationStarMode: string;
  annotationFontSizePx: number;
  annotationLineWidthPx: number;
  annotationTopPaddingPct: number;
  annotationAnchorLabel: string;
  annotationAnchorIndex: number;
  summaryStats: string;
};

let latestSettings: SettingsSnapshot = {
  jitterWidth: 20,
  showYGrid: true,
  showXGrid: true,
  pointSize: 4,
  pointOpacityPct: 100,
  yRangeMode: 'auto',
  yMinManual: '',
  yMaxManual: '',
  yIncludeOrigin: true,
  yTickIntervalMode: 'auto',
  yTickInterval: '',
  annotationMode: 'off',
  annotationTest: 'auto',
  annotationPAdj: 'none',
  annotationPairs: '',
  annotationAlpha: 0.05,
  annotationStarMode: 'stars',
  annotationFontSizePx: 6,
  annotationLineWidthPx: 1,
  annotationTopPaddingPct: 3,
  annotationAnchorLabel: '',
  annotationAnchorIndex: 1,
  summaryStats: 'uniqueCount,median,outlierCount'
};

let propWriteQueue: Promise<void> = Promise.resolve();

function setPropSerialized<T extends Spotfire.ModPropertyDataType>(
  p: Spotfire.ModProperty<T>,
  v: T
): Promise<void> {
  propWriteQueue = propWriteQueue
    .then(() => p.set(v))
    .catch(() => {});
  return propWriteQueue;
}

Spotfire.initialize(async (mod) => {
  const context = mod.getRenderContext();

  // Derived defaults and constants.
  const DEFAULT_ROW_HEIGHT_PX = 26;
  const DEFAULT_POINT_SIZE = 4;
  const DEFAULT_POINT_OPACITY = 100;
  const SUMMARY_MAX_HEIGHT_PX = 120;

  // Global button management flag
  let globalSettingsButtonCreated = false;

  // Readable (non-awaited) property handles for Reader.
  const rProps = {
    yAxisMode: mod.property('y-axis-mode'),
    splitBars: mod.property('split-bars'),
    jitterWidth: mod.property('jitterWidth'),
    showYGrid: mod.property('showYGrid'),
    showXGrid: mod.property('showXGrid'),
    labelColWidth: mod.property('labelColWidth'),
    summaryStats: mod.property('summaryStats'),

    pointSize: mod.property('pointSize'),
    pointOpacityPct: mod.property('pointOpacityPct'),
    useHollowDots: mod.property('useHollowDots'),

    yRangeMode: mod.property('yRangeMode'),
    yMinManual: mod.property('yMinManual'),
    yMaxManual: mod.property('yMaxManual'),
    yIncludeOrigin: mod.property('yIncludeOrigin'),
    yTickIntervalMode: mod.property('yTickIntervalMode'),
    yTickInterval: mod.property('yTickInterval'),

    annotationMode: mod.property('annotationMode'),
    annotationTest: mod.property('annotationTest'),
    annotationPAdj: mod.property('annotationPAdj'),
    annotationPairs: mod.property('annotationPairs'),
    annotationAlpha: mod.property('annotationAlpha'),
    annotationStarMode: mod.property('annotationStarMode'),
    annotationFontSizePx: mod.property('annotationFontSizePx'),
    annotationLineWidthPx: mod.property('annotationLineWidthPx'),
    annotationTopPaddingPct: mod.property('annotationTopPaddingPct'),
    annotationAnchorLabel: mod.property('annotationAnchorLabel'),
    annotationAnchorIndex: mod.property('annotationAnchorIndex'),
  };

  // Resolved ModProperty objects — used for defaults and UI persistence.
  const props = {
    showYGrid: await rProps.showYGrid,
    showXGrid: await rProps.showXGrid,
    jitterWidth: await rProps.jitterWidth,
    summaryStats: await rProps.summaryStats as Spotfire.ModProperty<string>,

    boxColor: await mod.property('boxColor'),
    dotBorderColor: await mod.property('dotBorderColor'),
    outlierBorderColor: await mod.property('outlierBorderColor'),
    boxWidth: await mod.property('boxWidth'),
    pointSize: await rProps.pointSize,
    pointOpacityPct: await rProps.pointOpacityPct,
    boxStrokeWidth: await mod.property('boxStrokeWidth'),
    medianColor: await mod.property('medianColor'),
    medianWidth: await mod.property('medianWidth'),
    useHollowDots: await rProps.useHollowDots,
    labelColWidth: await rProps.labelColWidth,

    yRangeMode: await rProps.yRangeMode,
    yMinManual: await rProps.yMinManual,
    yMaxManual: await rProps.yMaxManual,
    yIncludeOrigin: await rProps.yIncludeOrigin,
    yTickIntervalMode: await rProps.yTickIntervalMode,
    yTickInterval: await rProps.yTickInterval,

    yAxisMode: await rProps.yAxisMode,

    annotationMode: await rProps.annotationMode,
    annotationTest: await rProps.annotationTest,
    annotationPAdj: await rProps.annotationPAdj,
    annotationPairs: await rProps.annotationPairs,
    annotationAlpha: await rProps.annotationAlpha,
    annotationStarMode: await rProps.annotationStarMode,
    annotationFontSizePx: await rProps.annotationFontSizePx,
    annotationLineWidthPx: await rProps.annotationLineWidthPx,
    annotationTopPaddingPct: await rProps.annotationTopPaddingPct,
    annotationAnchorLabel: await rProps.annotationAnchorLabel,
    annotationAnchorIndex: await rProps.annotationAnchorIndex,

    countMode: await mod.property('countMode'),
    splitBars: await rProps.splitBars,
    initDoneFlag: await mod.property('initDoneFlag'),
  };

  // Main DOM anchors (single-pane mode).
  const borderDiv = findElem('#border') as HTMLElement;
  const singleCanvasDiv = findElem('#canvas') as HTMLElement;
  const singleYScaleDiv = findElem('#y-scale') as HTMLElement;
  const singleXScaleDiv = findElem('#x-scale') as HTMLElement;

  // Container-scoped default row height (self-contained; no global writes)
  borderDiv.style.setProperty('--row-height', `${DEFAULT_ROW_HEIGHT_PX}px`);

  // First-open defaults: set only if unset; never overwrite user choices later.
  async function ensureDefaults() {
    const setIfUnsetStr = async (p: Spotfire.ModProperty<string>, desired: string) => {
      const val = p.value();
      const s = (typeof val === 'string') ? val.trim() : String(val ?? '').trim();
      if (!s) await p.set(desired);
    };
    const setIfUnsetNum = async (p: Spotfire.ModProperty<number>, desired: number) => {
      const v = p.value();
      const n = (typeof v === 'number') ? v : Number(v);
      if (!Number.isFinite(n)) await p.set(desired);
    };
    const setIfUnsetBool = async (p: Spotfire.ModProperty<boolean>, desired: boolean) => {
      const v = p.value();
      if (typeof v !== 'boolean') await p.set(desired);
    };

    await setIfUnsetNum(props.jitterWidth, 20);
    await setIfUnsetBool(props.showYGrid, true);
    await setIfUnsetBool(props.showXGrid, true);
    await setIfUnsetNum(props.pointSize, 4);
    await setIfUnsetNum(props.pointOpacityPct, 100);
    await setIfUnsetStr(props.yRangeMode as any, 'auto');
    await setIfUnsetBool(props.yIncludeOrigin, true);
    await setIfUnsetStr(props.yTickIntervalMode as any, 'auto');

    await setIfUnsetStr(props.annotationMode as any, 'off');
    await setIfUnsetStr(props.annotationTest as any, 'auto');
    await setIfUnsetStr(props.annotationPAdj as any, 'none');
    await setIfUnsetNum(props.annotationAlpha as any, 0.05);
    await setIfUnsetStr(props.annotationStarMode as any, 'stars');
    await setIfUnsetNum(props.annotationFontSizePx as any, 6);
    await setIfUnsetNum(props.annotationLineWidthPx as any, 1);
    await setIfUnsetNum(props.annotationTopPaddingPct as any, 3);

    const sVal = String(props.summaryStats.value() ?? '').trim();
    if (!sVal) await props.summaryStats.set('uniqueCount,median,outlierCount');

    await setIfUnsetNum(props.medianWidth as any, 2);
    await setIfUnsetNum(props.boxWidth as any, 34);
  }

  if (props.initDoneFlag.value() !== true) {
    await ensureDefaults();
    await props.initDoneFlag.set(true);
  }

  // Validate / normalize point size and opacity.
  const sizeVal = Number(props.pointSize.value());
  const opVal = Number(props.pointOpacityPct.value());
  if (!Number.isFinite(sizeVal)) void props.pointSize.set(DEFAULT_POINT_SIZE);
  if (!Number.isFinite(opVal)) void props.pointOpacityPct.set(DEFAULT_POINT_OPACITY);
  let currentPointSize = Number.isFinite(sizeVal) ? sizeVal : DEFAULT_POINT_SIZE;
  let currentPointOpacityPct = Number.isFinite(opVal) ? opVal : DEFAULT_POINT_OPACITY;

  // Reader subscriptions for data and property changes.
  const reader = mod.createReader(
    mod.visualization.data(),
    rProps.yAxisMode,
    rProps.splitBars,
    rProps.jitterWidth,
    rProps.showYGrid,
    rProps.showXGrid,
    rProps.labelColWidth,
    rProps.summaryStats,
    rProps.pointSize,
    rProps.pointOpacityPct,
    rProps.useHollowDots,
    rProps.yRangeMode,
    rProps.yMinManual,
    rProps.yMaxManual,
    rProps.yIncludeOrigin,
    rProps.yTickIntervalMode,
    rProps.yTickInterval,
    rProps.annotationMode,
    rProps.annotationTest,
    rProps.annotationPAdj,
    rProps.annotationPairs,
    rProps.annotationAlpha,
    rProps.annotationStarMode,
    rProps.annotationFontSizePx,
    rProps.annotationLineWidthPx,
    rProps.annotationTopPaddingPct,
    rProps.annotationAnchorLabel,
    rProps.annotationAnchorIndex,
    mod.visualization.axis('Y'),
    mod.visualization.axis('Details'),
    mod.visualization.axis('Trellis'),
    mod.windowSize()
  );
  reader.subscribe(render);

  // Stable settings popout used by both single-pane and trellis.
  // Hydrates strictly from latestSettings (updated in render) and writes back via serialized sets.
  async function openStatsPopoutStable(e: MouseEvent) {
    if (!context.isEditing) return;
    e.stopPropagation();

    // Panel context under click (for Trellis headers); safe fallbacks
    const path = (e.composedPath && (e.composedPath() as EventTarget[])) || [];
    const clickedPanel = path.find(el => (el as HTMLElement)?.classList?.contains('trellis-panel')) as HTMLElement | null;
    const ctxPanelRoot = (clickedPanel?.querySelector('.panel-root') as HTMLElement | null)
      || (borderDiv.querySelector('.trellis-panel .panel-root') as HTMLElement | null)
      || borderDiv;

    // Remove any existing popout
    const existingGlobal = borderDiv.querySelector('#custom-stats-panel-global') as HTMLElement | null;
    if (existingGlobal) existingGlobal.remove();

    // Create popout
    const panelEl = document.createElement('div');
    panelEl.id = 'custom-stats-panel-global';
    panelEl.style.cssText = [
      'position:absolute;', 'background:#fff;', 'border:1px solid #ccc;', 'border-radius:8px;',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15);', 'padding:12px 14px;',
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;",
      'font-size:13px;', 'z-index:999999;', 'max-width:560px;', 'min-width:320px;', 'max-height:64vh;',
      'overflow:auto;', 'pointer-events:auto;'
    ].join(' ');

    // Position near the gear within borderDiv
    const anchorRect = (e.currentTarget as HTMLElement)?.getBoundingClientRect() || borderDiv.getBoundingClientRect();
    const hostRect = borderDiv.getBoundingClientRect();
    let leftInHost = (anchorRect.right - hostRect.left) + 8;
    let topInHost = Math.max(8, (anchorRect.top - hostRect.top) - 4);
    panelEl.style.left = `${leftInHost}px`;
    panelEl.style.top = `${topInHost}px`;

    // Header + close
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px;';
    const title = document.createElement('strong');
    title.textContent = 'Settings';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'background:#007acc;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;';
    header.appendChild(title);
    header.appendChild(closeBtn);
    panelEl.appendChild(header);

    // Helpers
    const addSection = (heading: string) => {
      const sec = document.createElement('div');
      const h = document.createElement('div');
      h.textContent = heading;
      h.style.cssText = 'font-weight:600;margin:8px 0 6px;';
      sec.appendChild(h);
      return sec;
    };
    const clampPct = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

    // Jitter Width
    const jitterSec = addSection('Jitter Width (px)');
    panelEl.appendChild(jitterSec);
    const jitterGroup = document.createElement('div');
    jitterGroup.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;';
    [
      { text: 'None', value: 0 },
      { text: 'Small', value: 10 },
      { text: 'Medium', value: 20 },
      { text: 'Large', value: 40 }
    ].forEach(opt => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'jitterWidth';
      input.value = String(opt.value);
      const span = document.createElement('span');
      span.textContent = opt.text;
      input.checked = (Number(latestSettings.jitterWidth) === opt.value);
      input.onchange = async () => {
        if (input.checked) {
          latestSettings.jitterWidth = Number(opt.value);
          await setPropSerialized(props.jitterWidth, Number(opt.value));
        }
      };
      label.appendChild(input);
      label.appendChild(span);
      jitterGroup.appendChild(label);
    });
    jitterSec.appendChild(jitterGroup);

    // Grid Lines
    const gridSec = addSection('Grid Lines');
    panelEl.appendChild(gridSec);
    const yLabel = document.createElement('label');
    yLabel.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const yInput = document.createElement('input');
    yInput.type = 'checkbox';
    yInput.checked = !!latestSettings.showYGrid;
    yInput.onchange = async () => {
      latestSettings.showYGrid = !!yInput.checked;
      await setPropSerialized(props.showYGrid, !!yInput.checked);
    };
    yLabel.appendChild(yInput);
    yLabel.appendChild(document.createTextNode('Show Y gridlines (horizontal)'));
    gridSec.appendChild(yLabel);

    const xLabel = document.createElement('label');
    xLabel.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;';
    const xInput = document.createElement('input');
    xInput.type = 'checkbox';
    xInput.checked = !!latestSettings.showXGrid;
    xInput.onchange = async () => {
      latestSettings.showXGrid = !!xInput.checked;
      await setPropSerialized(props.showXGrid, !!xInput.checked);
      lastShowXGrid = !!xInput.checked;
    };
    xLabel.appendChild(xInput);
    xLabel.appendChild(document.createTextNode('Show X group separators (vertical)'));
    gridSec.appendChild(xLabel);

    // Points
    const pointsSec = addSection('Points');
    panelEl.appendChild(pointsSec);
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
    const sizeLabel = document.createElement('span');
    sizeLabel.style.minWidth = '140px';
    sizeLabel.textContent = `Point size: ${Math.round(Number(latestSettings.pointSize))} px`;
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.min = '1';
    sizeInput.max = '12';
    sizeInput.step = '1';
    sizeInput.value = String(Number(latestSettings.pointSize)) || '4';
    sizeInput.oninput = async () => {
      const val = Number(sizeInput.value);
      const px = Math.max(1, Math.min(12, Number.isFinite(val) ? val : 4));
      latestSettings.pointSize = px;
      sizeLabel.textContent = `Point size: ${Math.round(px)} px`;
      await setPropSerialized(props.pointSize, Number(px));
    };
    sizeRow.appendChild(sizeLabel);
    sizeRow.appendChild(sizeInput);
    pointsSec.appendChild(sizeRow);

    const opRow = document.createElement('div');
    opRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const opLabel = document.createElement('span');
    opLabel.style.minWidth = '140px';
    opLabel.textContent = `Point opacity: ${Math.round(Number(latestSettings.pointOpacityPct))}%`;
    const opInput = document.createElement('input');
    opInput.type = 'range';
    opInput.min = '5';
    opInput.max = '100';
    opInput.step = '5';
    opInput.value = String(Number(latestSettings.pointOpacityPct) || 100);
    opInput.oninput = async () => {
      const val = Number(opInput.value);
      const pct = clampPct(Number.isFinite(val) ? val : 100, 5, 100);
      latestSettings.pointOpacityPct = pct;
      opLabel.textContent = `Point opacity: ${Math.round(pct)}%`;
      await setPropSerialized(props.pointOpacityPct, Number(pct));
    };
    opRow.appendChild(opLabel);
    opRow.appendChild(opInput);
    pointsSec.appendChild(opRow);

    // Y Axis: Range & Ticks
    const ySec = addSection('Y Axis: Range & Ticks');
    panelEl.appendChild(ySec);
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:6px;';
    const autoLbl = document.createElement('label');
    autoLbl.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const autoIn = document.createElement('input');
    autoIn.type = 'radio';
    autoIn.name = 'yRangeMode';
    autoIn.checked = String(latestSettings.yRangeMode || 'auto').toLowerCase() !== 'manual';
    autoIn.onchange = async () => {
      if (autoIn.checked) {
        latestSettings.yRangeMode = 'auto';
        await setPropSerialized(props.yRangeMode, 'auto');
      }
    };
    autoLbl.appendChild(autoIn);
    autoLbl.append('Automatic');
    const manLbl = document.createElement('label');
    manLbl.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const manIn = document.createElement('input');
    manIn.type = 'radio';
    manIn.name = 'yRangeMode';
    manIn.checked = String(latestSettings.yRangeMode || 'auto').toLowerCase() === 'manual';
    manIn.onchange = async () => {
      if (manIn.checked) {
        latestSettings.yRangeMode = 'manual';
        await setPropSerialized(props.yRangeMode, 'manual');
      }
    };
    manLbl.appendChild(manIn);
    manLbl.append('Manual');
    modeRow.appendChild(autoLbl);
    modeRow.appendChild(manLbl);
    ySec.appendChild(modeRow);

    const rangeRow = document.createElement('div');
    rangeRow.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:6px;';
    const minInput = document.createElement('input');
    minInput.type = 'number';
    minInput.placeholder = 'Min';
    minInput.value = String(latestSettings.yMinManual ?? '');
    minInput.step = 'any';
    minInput.onchange = async () => {
      latestSettings.yMinManual = String(minInput.value);
      await setPropSerialized(props.yMinManual, String(minInput.value));
      latestSettings.yRangeMode = 'manual';
      await setPropSerialized(props.yRangeMode, 'manual');
    };
    const maxInput = document.createElement('input');
    maxInput.type = 'number';
    maxInput.placeholder = 'Max';
    maxInput.value = String(latestSettings.yMaxManual ?? '');
    maxInput.step = 'any';
    maxInput.onchange = async () => {
      latestSettings.yMaxManual = String(maxInput.value);
      await setPropSerialized(props.yMaxManual, String(maxInput.value));
      latestSettings.yRangeMode = 'manual';
      await setPropSerialized(props.yRangeMode, 'manual');
    };
    rangeRow.appendChild(minInput);
    rangeRow.appendChild(maxInput);
    ySec.appendChild(rangeRow);

    const originLbl = document.createElement('label');
    originLbl.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
    const originIn = document.createElement('input');
    originIn.type = 'checkbox';
    originIn.checked = !!latestSettings.yIncludeOrigin;
    originIn.onchange = async () => {
      latestSettings.yIncludeOrigin = !!originIn.checked;
      await setPropSerialized(props.yIncludeOrigin, !!originIn.checked);
    };
    originLbl.appendChild(originIn);
    originLbl.append('Include origin (0)');
    ySec.appendChild(originLbl);

    const tickModeRow = document.createElement('div');
    tickModeRow.style.cssText = 'display:flex;gap:12px;align-items:center;margin-bottom:6px;';
    const tAutoLbl = document.createElement('label');
    tAutoLbl.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const tAutoIn = document.createElement('input');
    tAutoIn.type = 'radio';
    tAutoIn.name = 'yTickMode';
    tAutoIn.checked = String(latestSettings.yTickIntervalMode || 'auto').toLowerCase() !== 'manual';
    tAutoIn.onchange = async () => {
      if (tAutoIn.checked) {
        latestSettings.yTickIntervalMode = 'auto';
        await setPropSerialized(props.yTickIntervalMode, 'auto');
      }
    };
    tAutoLbl.appendChild(tAutoIn);
    tAutoLbl.append('Auto ticks');
    const tManLbl = document.createElement('label');
    tManLbl.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const tManIn = document.createElement('input');
    tManIn.type = 'radio';
    tManIn.name = 'yTickMode';
    tManIn.checked = String(latestSettings.yTickIntervalMode || 'auto').toLowerCase() === 'manual';
    tManIn.onchange = async () => {
      if (tManIn.checked) {
        latestSettings.yTickIntervalMode = 'manual';
        await setPropSerialized(props.yTickIntervalMode, 'manual');
      }
    };
    tManLbl.appendChild(tManIn);
    tManLbl.append('Manual interval');
    tickModeRow.appendChild(tAutoLbl);
    tickModeRow.appendChild(tManLbl);
    ySec.appendChild(tickModeRow);

    const tickRow = document.createElement('div');
    tickRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
    const tickLabel = document.createElement('span');
    tickLabel.textContent = 'Interval:';
    tickLabel.style.minWidth = '60px';
    const tickInput = document.createElement('input');
    tickInput.type = 'number';
    tickInput.step = 'any';
    tickInput.min = '0';
    tickInput.placeholder = 'e.g., 2';
    tickInput.value = String(latestSettings.yTickInterval ?? '');
    tickInput.onchange = async () => {
      const v = String(tickInput.value).trim();
      latestSettings.yTickInterval = v;
      await setPropSerialized(props.yTickInterval, String(v));
      if (v !== '') {
        latestSettings.yTickIntervalMode = 'manual';
        await setPropSerialized(props.yTickIntervalMode, 'manual');
      }
    };
    tickRow.appendChild(tickLabel);
    tickRow.appendChild(tickInput);
    ySec.appendChild(tickRow);

    // Significance Annotations
    const annoSec = addSection('Significance Annotations');
    panelEl.appendChild(annoSec);
    const modeWrap = document.createElement('div');
    modeWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px;';
    annoSec.appendChild(modeWrap);
    const addMode = (id: string, label: string, help?: string) => {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:flex;align-items:flex-start;gap:8px;';
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'annoMode';
      r.value = id;
      const curr = String(latestSettings.annotationMode || 'off').toLowerCase();
      r.checked = (curr === id) || (id === 'custompairs' && curr === 'manual');
      r.onchange = async () => {
        if (r.checked) {
          latestSettings.annotationMode = String(id);
          await setPropSerialized(props.annotationMode, String(id));
          syncAnnoVisibility();
        }
      };
      const text = document.createElement('div');
      const t = document.createElement('div');
      t.textContent = label;
      t.style.fontWeight = '600';
      text.appendChild(t);
      if (help) {
        const h = document.createElement('div');
        h.textContent = help;
        h.style.cssText = 'font-size:12px;color:#555;margin-top:1px;';
        text.appendChild(h);
      }
      lab.appendChild(r);
      lab.appendChild(text);
      modeWrap.appendChild(lab);
    };
    addMode('off', 'Off', 'Do not draw any significance brackets');
    addMode('adjacent', 'Adjacent pairs', 'Compare 1–2, 2–3, …');
    addMode('custompairs', 'Manual pairs', 'Type pairs like 1-2, 2-3 (comma separated)');
    addMode('anchor', 'Compare to reference', 'Compare all to a chosen group');
    addMode('global', 'Global', 'Overall test across all groups');

    const manualRow = document.createElement('div');
    manualRow.style.cssText = 'display:none; margin:6px 0 8px;';
    const manualLabel = document.createElement('div');
    manualLabel.textContent = 'Pairs (e.g., 1-2, 2-3):';
    manualLabel.style.cssText = 'font-weight:600; margin-bottom:4px;';
    const manualInput = document.createElement('input');
    manualInput.type = 'text';
    manualInput.placeholder = '1-2, 2-3';
    manualInput.value = String(latestSettings.annotationPairs || '');
    manualInput.style.cssText = 'width:100%';
    const manualHelp = document.createElement('div');
    manualHelp.textContent = 'Use group indices as shown in the header. Comma separated. Example: 1-2, 1-3, 2-4';
    manualHelp.style.cssText = 'color:#555;font-size:12px;margin-top:3px;';
    manualInput.onchange = async () => {
      latestSettings.annotationPairs = String(manualInput.value || '');
      await setPropSerialized(props.annotationPairs, String(manualInput.value || ''));
      latestSettings.annotationMode = 'custompairs';
      await setPropSerialized(props.annotationMode, 'custompairs');
      syncAnnoVisibility();
    };
    manualRow.appendChild(manualLabel);
    manualRow.appendChild(manualInput);
    manualRow.appendChild(manualHelp);
    annoSec.appendChild(manualRow);

    const anchorRow = document.createElement('div');
    anchorRow.style.cssText = 'display:none;align-items:center;gap:8px;margin:4px 0 10px;';
    const anchorLbl = document.createElement('span');
    anchorLbl.textContent = 'Reference group:';
    anchorLbl.style.minWidth = '120px';
    const anchorSel = document.createElement('select');
    anchorSel.style.cssText = 'flex:1 1 auto;';
    anchorRow.appendChild(anchorLbl);
    anchorRow.appendChild(anchorSel);
    annoSec.appendChild(anchorRow);

    // Derive current xLabels from the visible panel context
    const theadEl = ctxPanelRoot.querySelector('.summary-table-values thead') as HTMLElement | null;
    const leafRowEl = theadEl?.querySelector('.thead-row-leaf') as HTMLElement | null;
    const singleRowEl = theadEl?.querySelector('.thead-row-single') as HTMLElement | null;
    const ths = leafRowEl
      ? Array.from(leafRowEl.querySelectorAll('th'))
      : (singleRowEl ? Array.from(singleRowEl.querySelectorAll('th')) : []);
    const xLabels = (ths as HTMLElement[]).map(th => (th.textContent || '').trim());

    const hydrateAnchor = () => {
      anchorSel.innerHTML = '';
      const anchorLabelCurr = String(latestSettings.annotationAnchorLabel || '');
      const anchorIndexCurr = Number(latestSettings.annotationAnchorIndex ?? 1) || 1;
      xLabels.forEach((lab, i) => {
        const opt = document.createElement('option');
        opt.value = String(i + 1);
        opt.textContent = lab || `Group ${i + 1}`;
        const isMatch = (anchorLabelCurr && lab === anchorLabelCurr) || (!anchorLabelCurr && (i + 1) === anchorIndexCurr);
        if (isMatch) opt.selected = true;
        anchorSel.appendChild(opt);
      });
    };
    hydrateAnchor();
    anchorSel.onchange = async () => {
      const idx = Math.max(1, Math.min(xLabels.length, parseInt(anchorSel.value, 10) || 1));
      latestSettings.annotationAnchorIndex = Number(idx);
      await setPropSerialized(props.annotationAnchorIndex, Number(idx));
      const label = xLabels[idx - 1] || '';
      latestSettings.annotationAnchorLabel = String(label);
      await setPropSerialized(props.annotationAnchorLabel, String(label));
    };

    function syncAnnoVisibility() {
      const modeCurr = String(latestSettings.annotationMode || 'off').toLowerCase();
      manualRow.style.display = (modeCurr === 'custompairs' || modeCurr === 'manual') ? 'block' : 'none';
      anchorRow.style.display = (modeCurr === 'anchor') ? 'flex' : 'none';
    }
    syncAnnoVisibility();

    const testLbl = document.createElement('div');
    testLbl.textContent = 'P value test';
    testLbl.style.cssText = 'font-weight:600;margin:6px 0 4px;';
    const testSel = document.createElement('select');
    ['auto', 't', 'mannwhitney', 'anova', 'kruskal'].forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      testSel.appendChild(o);
    });
    testSel.value = String(latestSettings.annotationTest || 'auto').toLowerCase();
    testSel.onchange = async () => {
      latestSettings.annotationTest = String(testSel.value);
      await setPropSerialized(props.annotationTest, String(testSel.value));
    };
    annoSec.appendChild(testLbl);
    annoSec.appendChild(testSel);

    const padjLbl = document.createElement('div');
    padjLbl.textContent = 'P-adjust';
    padjLbl.style.cssText = 'font-weight:600;margin:8px 0 4px;';
    const padjSel = document.createElement('select');
    ['none', 'bh'].forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      padjSel.appendChild(o);
    });
    padjSel.value = (String(latestSettings.annotationPAdj || 'none').toLowerCase() === 'none') ? 'none' : 'bh';
    padjSel.onchange = async () => {
      latestSettings.annotationPAdj = String(padjSel.value);
      await setPropSerialized(props.annotationPAdj, String(padjSel.value));
    };
    annoSec.appendChild(padjLbl);
    annoSec.appendChild(padjSel);

    const alphaRow = document.createElement('div');
    alphaRow.style.cssText = 'display:grid;grid-template-columns:160px 1fr;gap:8px;margin:8px 0;align-items:center;';
    const alphaLabel = document.createElement('span');
    alphaLabel.textContent = 'Alpha:';
    const alphaBox = document.createElement('input');
    alphaBox.type = 'number';
    alphaBox.step = '0.001';
    alphaBox.min = '0';
    alphaBox.max = '1';
    alphaBox.value = String(Number(latestSettings.annotationAlpha ?? 0.05) || 0.05);
    alphaBox.onchange = async () => {
      latestSettings.annotationAlpha = Number(alphaBox.value);
      await setPropSerialized(props.annotationAlpha, Number(alphaBox.value));
    };
    alphaRow.appendChild(alphaLabel);
    alphaRow.appendChild(alphaBox);
    annoSec.appendChild(alphaRow);

    const lmRow = document.createElement('div');
    lmRow.style.cssText = 'display:grid;grid-template-columns:160px 1fr;gap:8px;margin:0 0 8px;align-items:center;';
    const lmLbl = document.createElement('span');
    lmLbl.textContent = 'Label mode:';
    const lmSel = document.createElement('select');
    ['stars', 'pvalue', 'both'].forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      lmSel.appendChild(o);
    });
    lmSel.value = String(latestSettings.annotationStarMode || 'stars').toLowerCase();
    lmSel.onchange = async () => {
      latestSettings.annotationStarMode = String(lmSel.value);
      await setPropSerialized(props.annotationStarMode, String(lmSel.value));
    };
    lmRow.appendChild(lmLbl);
    lmRow.appendChild(lmSel);
    annoSec.appendChild(lmRow);

    const styleSec = addSection('Appearance');
    panelEl.appendChild(styleSec);
    const styleGrid = document.createElement('div');
    styleGrid.style.cssText = 'display:grid;grid-template-columns:160px 1fr;gap:8px;align-items:center;';
    const fontLbl = document.createElement('span');
    fontLbl.textContent = 'Font size (px):';
    const fontIn = document.createElement('input');
    fontIn.type = 'number';
    fontIn.min = '6';
    fontIn.max = '20';
    fontIn.value = String(Number(latestSettings.annotationFontSizePx ?? 6) || 6);
    fontIn.onchange = async () => {
      latestSettings.annotationFontSizePx = Number(fontIn.value);
      await setPropSerialized(props.annotationFontSizePx, Number(fontIn.value));
    };
    const lineLbl = document.createElement('span');
    lineLbl.textContent = 'Line thickness (px):';
    const lineIn = document.createElement('input');
    lineIn.type = 'number';
    lineIn.min = '1';
    lineIn.max = '4';
    lineIn.value = String(Number(latestSettings.annotationLineWidthPx ?? 1) || 1);
    lineIn.onchange = async () => {
      latestSettings.annotationLineWidthPx = Number(lineIn.value);
      await setPropSerialized(props.annotationLineWidthPx, Number(lineIn.value));
    };
    const padLbl = document.createElement('span');
    padLbl.textContent = 'Top padding (%):';
    const padIn = document.createElement('input');
    padIn.type = 'number';
    padIn.min = '2';
    padIn.max = '20';
    padIn.value = String(Number(latestSettings.annotationTopPaddingPct ?? 3) || 3);
    padIn.onchange = async () => {
      latestSettings.annotationTopPaddingPct = Number(padIn.value);
      await setPropSerialized(props.annotationTopPaddingPct, Number(padIn.value));
    };
    styleGrid.appendChild(fontLbl);
    styleGrid.appendChild(fontIn);
    styleGrid.appendChild(lineLbl);
    styleGrid.appendChild(lineIn);
    styleGrid.appendChild(padLbl);
    styleGrid.appendChild(padIn);
    styleSec.appendChild(styleGrid);

    // Summary Stats
    const statsSec = addSection('Summary Stats (toggle on/off)');
    panelEl.appendChild(statsSec);
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;';
    statsSec.appendChild(statsGrid);
    const desiredStats = ['uniqueCount', 'median', 'average', 'stdDev', 'stdError', 'ciLower', 'ciUpper', 'min', 'max', 'outlierCount'];
    const canonicalSetLocal = new Set(desiredStats);
    const labelToCanonicalLocal: Record<string, string> = {
      'n': 'uniqueCount', 'count': 'uniqueCount', 'rows': 'uniqueCount', 'average': 'average', 'mean': 'average', 'median': 'median',
      'stddev': 'stdDev', 'std dev': 'stdDev', 'std. dev': 'stdDev', 'std_dev': 'stdDev', 'sd': 'stdDev',
      'stderr': 'stdError', 'std error': 'stdError', 'std. error': 'stdError', 'std_error': 'stdError', 'se': 'stdError',
      'ci lower 95%': 'ciLower', 'ci lower': 'ciLower', 'ci_lower': 'ciLower', 'ci95lower': 'ciLower',
      'ci upper 95%': 'ciUpper', 'ci upper': 'ciUpper', 'ci_upper': 'ciUpper', 'ci95upper': 'ciUpper',
      'min': 'min', 'max': 'max', 'outliers': 'outlierCount', 'outlier count': 'outlierCount', 'outliercount': 'outlierCount', 'outlier_count': 'outlierCount'
    };
    const parseStatsToSetLocal = (raw: string): Set<string> => {
      const out = new Set<string>();
      (raw || '').split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
        if (canonicalSetLocal.has(tok)) out.add(tok);
        else {
          const canon = labelToCanonicalLocal[tok.toLowerCase()];
          if (canon && canonicalSetLocal.has(canon)) out.add(canon);
        }
      });
      return out;
    };
    const orderedFromSetLocal = (set: Set<string>): string[] => desiredStats.filter(k => set.has(k));
    let currentSet = new Set<string>(orderedFromSetLocal(parseStatsToSetLocal(String(latestSettings.summaryStats || ''))));

    const colCountHeader = ctxPanelRoot.querySelectorAll('.summary-table-values thead tr:last-child th').length || 1;
    const colPctLocal = 100 / Math.max(1, colCountHeader);

    const rebuildFromSetAndRefreshTableOnly = async () => {
      const ordered = desiredStats.filter(k => currentSet.has(k));
      const csv = ordered.join(',');
      latestSettings.summaryStats = csv;
      await setPropSerialized(props.summaryStats, csv);

      // Update labels (left column)
      const labelsRowsContainer = ctxPanelRoot.querySelector('.summary-table-labels .labels-rows') as HTMLElement | null;
      if (labelsRowsContainer) {
        labelsRowsContainer.innerHTML = '';
        ordered.forEach(stat => {
          const full = ({ uniqueCount: 'N', median: 'Median', average: 'Average', stdDev: 'Std Dev', stdError: 'Std Error', ciLower: 'CI Lower 95%', ciUpper: 'CI Upper 95%', min: 'Min', max: 'Max', outlierCount: 'Outliers' } as any)[stat] || stat;
          const labelDiv = document.createElement('div');
          labelDiv.className = 'row-label';
          labelDiv.style.height = 'var(--row-height)';
          labelDiv.style.lineHeight = 'var(--row-height)';
          labelDiv.style.whiteSpace = 'nowrap';
          labelDiv.style.overflow = 'hidden';
          labelDiv.style.textOverflow = 'ellipsis';
          labelDiv.style.padding = '0 6px';
          labelDiv.title = full;
          labelDiv.textContent = full;
          labelsRowsContainer.appendChild(labelDiv);
        });
      }

      // Update table body skeleton (values render on next mod render)
      const table = (ctxPanelRoot.querySelector('.summary-table-values table') as HTMLTableElement | null);
      if (table) {
        let html = '<tbody>';
        if (ordered.length) {
          ordered.forEach(() => {
            html += '<tr>';
            for (let i = 0; i < colCountHeader; i++) {
              html += `<td style="width:${colPctLocal}%; min-width:0; height:var(--row-height); padding:3px 4px;"></td>`;
            }
            html += '</tr>';
          });
        }
        html += '</tbody>';
        const old = table.querySelector('tbody');
        if (old) old.outerHTML = html; else table.insertAdjacentHTML('beforeend', html);
      }
    };

    desiredStats.forEach(name => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = currentSet.has(name);
      input.dataset.key = name;
      input.onchange = async () => {
        if (input.checked) currentSet.add(name);
        else currentSet.delete(name);
        await rebuildFromSetAndRefreshTableOnly();
      };
      const span = document.createElement('span');
      const mapLocal: Record<string, string> = {
        uniqueCount: 'N', median: 'Median', average: 'Average', stdDev: 'Std Dev', stdError: 'Std Error', ciLower: 'CI Lower 95%', ciUpper: 'CI Upper 95%', min: 'Min', max: 'Max', outlierCount: 'Outliers'
      };
      span.textContent = mapLocal[name] || name;
      label.appendChild(input);
      label.appendChild(span);
      statsGrid.appendChild(label);
    });

    // Mount and clamp within host
    if (!borderDiv.style.position) borderDiv.style.position = 'relative';
    borderDiv.appendChild(panelEl);
    const panelW = panelEl.offsetWidth;
    const panelH = panelEl.offsetHeight;
    const maxLeftInHost = Math.max(8, borderDiv.clientWidth - panelW - 8);
    const maxTopInHost = Math.max(8, borderDiv.clientHeight - panelH - 8);
    leftInHost = Math.min(Math.max(8, leftInHost), maxLeftInHost);
    topInHost = Math.min(Math.max(8, topInHost), maxTopInHost);
    panelEl.style.left = `${leftInHost}px`;
    panelEl.style.top = `${topInHost}px`;

    // Close on outside click
    const outsideClickHandler = (evt: MouseEvent) => {
      const pth = (evt.composedPath && (evt.composedPath() as EventTarget[])) || [];
      if (!pth.includes(panelEl)) teardown();
    };
    setTimeout(() => document.addEventListener('mousedown', outsideClickHandler, { capture: true } as any), 0);

    const teardown = () => {
      document.removeEventListener('mousedown', outsideClickHandler, { capture: true } as any as any);
      panelEl.remove();
    };
    closeBtn.onclick = teardown;
  }

  // Simple panel type used across single and trellis modes.
  type Panel = { key: string; label: string; root: HTMLElement; header: HTMLElement; canvas: HTMLElement; yScale: HTMLElement; xScale: HTMLElement; };

  /** Construct a single-pane panel binding to existing DOM nodes. */
  function createSinglePanel(): Panel {
    const dummyHeader = document.createElement('div');
    return { key: 'single', label: '', root: borderDiv, header: dummyHeader, canvas: singleCanvasDiv, yScale: singleYScaleDiv, xScale: singleXScaleDiv };
  }

  /** Ensure trellis grid container exists, creating if needed. */
  function ensureTrellisGrid(): HTMLElement {
    let grid = document.getElementById('trellis-grid') as HTMLElement | null;
    if (!grid) {
      grid = document.createElement('div');
      grid.id = 'trellis-grid';
      borderDiv.appendChild(grid);
    }
    return grid;
  }

  /** Remove trellis grid container if present. */
  function clearTrellisGrid() {
    const grid = document.getElementById('trellis-grid');
    if (grid) grid.remove();
  }

  /** Normalize and display a trellis panel title. */
  function safePanelLabel(label: string): string {
    const t = (label || '').trim();
    return t === '' ? '(Empty)' : t;
  }

  /** Create a trellis panel including header and internal areas. */
  function createTrellisPanel(grid: HTMLElement, key: string, label: string): Panel {
    const panel = document.createElement('div');
    panel.className = 'trellis-panel';

    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = safePanelLabel(label);
    header.appendChild(title);
    panel.appendChild(header);

    const root = document.createElement('div');
    root.className = 'panel-root';

    const canvas = document.createElement('div');
    canvas.className = 'panel-canvas';

    const xScale = document.createElement('div');
    xScale.className = 'panel-x-scale';

    const yScale = document.createElement('div');
    yScale.className = 'panel-y-scale';

    root.appendChild(canvas);
    root.appendChild(xScale);
    root.appendChild(yScale);

    panel.appendChild(root);
    grid.appendChild(panel);

    return { key, label: safePanelLabel(label), root, header, canvas, yScale, xScale };
  }

  // ------------------------------
  // Rendering pipeline entry
  // ------------------------------

  async function render(
    dataView: Spotfire.DataView,
    yAxisMode: Spotfire.ModProperty<string>,
    splitBars: Spotfire.ModProperty<boolean>,
    jitterWidthProp: Spotfire.ModProperty<number>,
    showYGridProp: Spotfire.ModProperty<boolean>,
    showXGridProp: Spotfire.ModProperty<boolean>,
    labelColWidthProp: Spotfire.ModProperty<number>,
    summaryStatsPropInRender: Spotfire.ModProperty<string>,
    pointSizeProp: Spotfire.ModProperty<number>,
    pointOpacityPctProp: Spotfire.ModProperty<number>,
    useHollowDotsProp: Spotfire.ModProperty<boolean>,
    yRangeModeProp: Spotfire.ModProperty<string>,
    yMinManualProp: Spotfire.ModProperty<string>,
    yMaxManualProp: Spotfire.ModProperty<string>,
    yIncludeOriginProp: Spotfire.ModProperty<boolean>,
    yTickIntervalModeProp: Spotfire.ModProperty<string>,
    yTickIntervalProp: Spotfire.ModProperty<string>,
    annotationModeProp: Spotfire.ModProperty<string>,
    annotationTestProp: Spotfire.ModProperty<string>,
    annotationPAdjProp: Spotfire.ModProperty<string>,
    annotationPairsProp: Spotfire.ModProperty<string>,
    annotationAlphaProp: Spotfire.ModProperty<number>,
    annotationStarModeProp: Spotfire.ModProperty<string>,
    annotationFontSizePxProp: Spotfire.ModProperty<number>,
    annotationLineWidthPxProp: Spotfire.ModProperty<number>,
    annotationTopPaddingPctProp: Spotfire.ModProperty<number>,
    annotationAnchorLabelProp: Spotfire.ModProperty<string>,
    annotationAnchorIndexProp: Spotfire.ModProperty<number>,
    yAxis: Spotfire.Axis,
    detailsAxis: Spotfire.Axis,
    trellisAxis: Spotfire.Axis
  ) {
    // Error handling and early returns.
    const errors = await dataView.getErrors();
    if (errors.length > 0) {
      mod.controls.errorOverlay.show(errors, 'dataView');
      return;
    }
    mod.controls.errorOverlay.hide('dataView');

    // LIVE snapshot for settings (Fix #1): hydrate latestSettings from reader snapshot
    latestSettings = {
      jitterWidth: Number(jitterWidthProp.value() ?? 20) || 0,
      showYGrid: !!showYGridProp.value(),
      showXGrid: !!showXGridProp.value(),
      pointSize: Number(pointSizeProp.value() ?? 4) || 4,
      pointOpacityPct: Number(pointOpacityPctProp.value() ?? 100) || 100,
      yRangeMode: String(yRangeModeProp.value() || 'auto'),
      yMinManual: String(yMinManualProp.value() ?? ''),
      yMaxManual: String(yMaxManualProp.value() ?? ''),
      yIncludeOrigin: !!yIncludeOriginProp.value(),
      yTickIntervalMode: String(yTickIntervalModeProp.value() || 'auto'),
      yTickInterval: String(yTickIntervalProp.value() ?? ''),
      annotationMode: String(annotationModeProp.value() || 'off'),
      annotationTest: String(annotationTestProp.value() || 'auto'),
      annotationPAdj: String(annotationPAdjProp.value() || 'none'),
      annotationPairs: String(annotationPairsProp.value() || ''),
      annotationAlpha: Number(annotationAlphaProp.value() ?? 0.05) || 0.05,
      annotationStarMode: String(annotationStarModeProp.value() || 'stars'),
      annotationFontSizePx: Number(annotationFontSizePxProp.value() ?? 6) || 6,
      annotationLineWidthPx: Number(annotationLineWidthPxProp.value() ?? 1) || 1,
      annotationTopPaddingPct: Number(annotationTopPaddingPctProp.value() ?? 3) || 3,
      annotationAnchorLabel: String(annotationAnchorLabelProp.value() || ''),
      annotationAnchorIndex: Number(annotationAnchorIndexProp.value() ?? 1) || 1,
      summaryStats: String(summaryStatsPropInRender.value() || 'uniqueCount,median,outlierCount')
    };

    // Label column width setting (clamped to a sensible range) – container-scoped.
    const propLabelW = clamp(Number(labelColWidthProp.value() ?? 96), 60, 200);
    borderDiv.style.setProperty('--label-col-width', `${propLabelW}px`);

    // Require an X hierarchy and root to proceed.
    const xHierarchy = await dataView.hierarchy('X');
    if (!xHierarchy) return;
    const xRoot = await xHierarchy.root();
    if (!xRoot) return;

    // Y axis must be present.
    const dataViewYAxis = await dataView.continuousAxis('Y');
    if (!dataViewYAxis) {
      mod.controls.errorOverlay.show('No data on y axis.', 'y');
      return;
    }

    // Empty-state check.
    const leaves = xRoot.leaves();
    let totalRows = 0;
    for (const leaf of leaves) totalRows += leaf.rows().length;
    if (totalRows === 0) {
      clearPanelCanvas({ canvas: singleCanvasDiv } as any);
      singleYScaleDiv.innerHTML = '';
      singleXScaleDiv.innerHTML = '';
      borderDiv.querySelectorAll('.summary-table-wrapper').forEach(w => w.remove());
      clearTrellisGrid();
      borderDiv.classList.remove('trellis-mode');
      const emptyErrors = await dataView.getErrors();
      if (emptyErrors && emptyErrors.length) mod.controls.errorOverlay.show(emptyErrors, 'empty-state');
      else mod.controls.errorOverlay.show('Mark items to view details here.', 'empty-state');
      mod.controls.errorOverlay.hide('y');
      context.signalRenderComplete();
      return;
    } else {
      mod.controls.errorOverlay.hide('empty-state');
    }

    // Normalize point size and opacity for this render pass.
    const szRaw = pointSizeProp.value();
    const sz = typeof szRaw === 'number' ? szRaw : parseInt(String(szRaw ?? 4), 10);
    currentPointSize = Number.isFinite(sz) ? sz : 4;

    const opRaw = pointOpacityPctProp.value();
    const op = typeof opRaw === 'number' ? opRaw : parseInt(String(opRaw ?? 100), 10);
    currentPointOpacityPct = Number.isFinite(op) ? op : 100;

    // Trellis presence and grouping.
    const trellisAssigned = !!(trellisAxis && (trellisAxis.expression || '').trim());
    const trellisValues = trellisAssigned ? collectTrellisGroups(leaves) : [];
    const useTrellis = trellisAssigned && trellisValues.length > 0;

    // Manage global settings button based on mode
    const existingGlobal = borderDiv.querySelector('.settings-button-global') as HTMLElement | null;
    if (!useTrellis) {
      if (existingGlobal) existingGlobal.remove();
      globalSettingsButtonCreated = false;
    } else {
      globalSettingsButtonCreated = !!existingGlobal;
    }

    // X-grid separators toggle.
    lastShowXGrid = !!showXGridProp.value();
    mod.controls.errorOverlay.hide('y');
    mod.controls.tooltip.hide();

    // Y-axis manual range and tick parsing.
    const parseNum = (v: any): number => { const n = typeof v === 'number' ? v : parseFloat(String(v).trim()); return Number.isFinite(n) ? n : NaN; };
    const manualRange = (String(yRangeModeProp.value() || 'auto').toLowerCase() === 'manual');
    const manualMinVal = parseNum(yMinManualProp.value());
    const manualMaxVal = parseNum(yMaxManualProp.value());
    const includeOrigin = !!yIncludeOriginProp.value();
    const manualTicks = (String(yTickIntervalModeProp.value() || 'auto').toLowerCase() === 'manual');
    const tickStepVal = parseNum(yTickIntervalProp.value());
    const tickStep = manualTicks && Number.isFinite(tickStepVal) && tickStepVal > 0 ? tickStepVal : NaN;

    // Normalize annotation configuration.
    const modeRaw = String(annotationModeProp.value() || 'off').toLowerCase();
    const modeNorm = (modeRaw === 'global+pairs') ? 'allpairs' : modeRaw;
    const padjRaw = String(annotationPAdjProp.value() || 'none').toLowerCase();
    const padjClamped = (padjRaw === 'none') ? 'none' : 'bh';
    const annoCfg: AnnoConfig = {
      mode: modeNorm,
      test: String(annotationTestProp.value() || 'auto').toLowerCase(),
      padj: padjClamped,
      pairsCsv: String(annotationPairsProp.value() || ''),
      alpha: Number(annotationAlphaProp.value() ?? 0.05) || 0.05,
      starMode: String(annotationStarModeProp.value() || 'stars').toLowerCase(),
      fontPx: clamp(Number(annotationFontSizePxProp.value() ?? 6), 6, 20),
      linePx: clamp(Number(annotationLineWidthPxProp.value() ?? 1), 1, 4),
      topPadPct: clamp(Number(annotationTopPaddingPctProp.value() ?? 3), 2, 20),
      anchorLabel: String(annotationAnchorLabelProp.value() || ''),
      anchorIndex: Number(annotationAnchorIndexProp.value() ?? 1) || 1
    };

    if (!useTrellis) {
      // Single-pane
      borderDiv.classList.remove('trellis-mode');
      clearTrellisGrid();
      borderDiv.querySelectorAll('.summary-table-wrapper').forEach(el => el.remove());

      const single = createSinglePanel();

      renderUnifiedTable(
        single,
        xRoot,
        {
          jitterWidth: jitterWidthProp,
          showYGrid: showYGridProp,
          showXGrid: showXGridProp,
          pointSize: pointSizeProp,
          pointOpacityPct: pointOpacityPctProp,
          yRangeMode: yRangeModeProp,
          yMinManual: yMinManualProp,
          yMaxManual: yMaxManualProp,
          yIncludeOrigin: yIncludeOriginProp,
          yTickIntervalMode: yTickIntervalModeProp,
          yTickInterval: yTickIntervalProp,
          annotationMode: annotationModeProp,
          annotationTest: annotationTestProp,
          annotationPAdj: annotationPAdjProp,
          annotationPairs: annotationPairsProp,
          annotationAlpha: annotationAlphaProp,
          annotationStarMode: annotationStarModeProp,
          annotationFontSizePx: annotationFontSizePxProp,
          annotationLineWidthPx: annotationLineWidthPxProp,
          annotationTopPaddingPct: annotationTopPaddingPctProp,
          annotationAnchorLabel: annotationAnchorLabelProp,
          annotationAnchorIndex: annotationAnchorIndexProp,
          summaryStats: summaryStatsPropInRender
        },
        splitBars,
        jitterWidthProp,
        showYGridProp,
        showXGridProp
      );

      await nextLayoutTick();
      const { min: dataMin, max: dataMax } = calculateMinMaxYValueFiltered(leaves, null);
      const rawMin = (yAxisMode.value() === 'percentage') ? 0 : dataMin;
      const rawMax = (yAxisMode.value() === 'percentage') ? 100 : dataMax;

      let minYValue: number;
      let maxYValue: number;
      if (manualRange) {
        const baseMin = Number.isFinite(manualMinVal) ? manualMinVal : rawMin;
        const baseMax = Number.isFinite(manualMaxVal) ? manualMaxVal : rawMax;
        let lo = Math.min(baseMin, baseMax), hi = Math.max(baseMin, baseMax);
        if (includeOrigin) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        if (lo === hi) hi = lo + 1;
        minYValue = lo;
        maxYValue = hi;
      } else {
        const canvasH = single.canvas.offsetHeight || single.root.getBoundingClientRect().height;
        const padded = computePaddedDomain(rawMin, rawMax, canvasH, pointSizeProp, props.medianWidth);
        if (includeOrigin) { padded.min = Math.min(padded.min, 0); padded.max = Math.max(padded.max, 0); }
        minYValue = padded.min; maxYValue = padded.max;
        const reservePx = estimateAnnotationHeadroomPx(single, xRoot, annoCfg, null);
        if (reservePx > 0 && reservePx < canvasH - 1) {
          const R = maxYValue - minYValue;
          const extraData = Math.min((R * reservePx) / Math.max(1, canvasH - reservePx), R * 0.35);
          if (Number.isFinite(extraData) && extraData > 0) maxYValue += extraData;
        }
      }

      clearPanelCanvas(single);
      renderBoxes(single, dataView, xRoot, minYValue, maxYValue, jitterWidthProp, splitBars, pointSizeProp, pointOpacityPctProp, useHollowDotsProp, null);
      renderYScale(single, minYValue, maxYValue, yAxis, yAxisMode, showYGridProp, leaves, dataViewYAxis, Number.isFinite(tickStep) ? tickStep : undefined, includeOrigin);
      renderAnnotations(single, xRoot, null, annoCfg);
      ensureLayoutThen(() => { syncCanvasColumnsToHeaderForPanel(single); updateCanvasGroupSeparatorsForPanel(single); });
      context.signalRenderComplete();
      return;
    }

    // Trellis path
    borderDiv.classList.add('trellis-mode');
    clearPanelCanvas({ canvas: singleCanvasDiv } as any);
    singleYScaleDiv.innerHTML = '';
    singleXScaleDiv.innerHTML = '';
    borderDiv.querySelectorAll('.summary-table-wrapper').forEach(el => el.remove());

    const grid = ensureTrellisGrid();
    grid.innerHTML = '';

    for (const group of trellisValues) {
      const panel = createTrellisPanel(grid, group.key, group.label);

      renderUnifiedTable(
        panel,
        xRoot,
        {
          jitterWidth: jitterWidthProp,
          showYGrid: showYGridProp,
          showXGrid: showXGridProp,
          pointSize: pointSizeProp,
          pointOpacityPct: pointOpacityPctProp,
          yRangeMode: yRangeModeProp,
          yMinManual: yMinManualProp,
          yMaxManual: yMaxManualProp,
          yIncludeOrigin: yIncludeOriginProp,
          yTickIntervalMode: yTickIntervalModeProp,
          yTickInterval: yTickIntervalProp,
          annotationMode: annotationModeProp,
          annotationTest: annotationTestProp,
          annotationPAdj: annotationPAdjProp,
          annotationPairs: annotationPairsProp,
          annotationAlpha: annotationAlphaProp,
          annotationStarMode: annotationStarModeProp,
          annotationFontSizePx: annotationFontSizePxProp,
          annotationLineWidthPx: annotationLineWidthPxProp,
          annotationTopPaddingPct: annotationTopPaddingPctProp,
          annotationAnchorLabel: annotationAnchorLabelProp,
          annotationAnchorIndex: annotationAnchorIndexProp,
          summaryStats: summaryStatsPropInRender
        },
        splitBars,
        jitterWidthProp,
        showYGridProp,
        showXGridProp,
        (row) => trellisKey(row) === group.key
      );

      await nextLayoutTick();

      const { min: dataMin, max: dataMax } = calculateMinMaxYValueFiltered(leaves, (row) => trellisKey(row) === group.key);
      const rawMin = (yAxisMode.value() === 'percentage') ? 0 : dataMin;
      const rawMax = (yAxisMode.value() === 'percentage') ? 100 : dataMax;

      let minYValue: number;
      let maxYValue: number;
      if (manualRange) {
        const baseMin = Number.isFinite(manualMinVal) ? manualMinVal : rawMin;
        const baseMax = Number.isFinite(manualMaxVal) ? manualMaxVal : rawMax;
        let lo = Math.min(baseMin, baseMax), hi = Math.max(baseMin, baseMax);
        if (includeOrigin) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        if (lo === hi) hi = lo + 1;
        minYValue = lo;
        maxYValue = hi;
      } else {
        const canvasH = panel.canvas.offsetHeight || panel.root.getBoundingClientRect().height;
        const padded = computePaddedDomain(rawMin, rawMax, canvasH, pointSizeProp, props.medianWidth);
        if (includeOrigin) { padded.min = Math.min(padded.min, 0); padded.max = Math.max(padded.max, 0); }
        minYValue = padded.min; maxYValue = padded.max;
        const reservePx = estimateAnnotationHeadroomPx(panel, xRoot, annoCfg, (row) => trellisKey(row) === group.key);
        if (reservePx > 0 && reservePx < canvasH - 1) {
          const R = maxYValue - minYValue;
          const extraData = Math.min((R * reservePx) / Math.max(1, canvasH - reservePx), R * 0.35);
          if (Number.isFinite(extraData) && extraData > 0) maxYValue += extraData;
        }
      }

      clearPanelCanvas(panel);
      renderBoxes(panel, dataView, xRoot, minYValue, maxYValue, jitterWidthProp, splitBars, pointSizeProp, pointOpacityPctProp, useHollowDotsProp, (row) => trellisKey(row) === group.key);
      renderYScale(panel, minYValue, maxYValue, yAxis, yAxisMode, showYGridProp, leaves, dataViewYAxis, Number.isFinite(tickStep) ? tickStep : undefined, includeOrigin);
      renderAnnotations(panel, xRoot, (row) => trellisKey(row) === group.key, annoCfg);
      ensureLayoutThen(() => { syncCanvasColumnsToHeaderForPanel(panel); updateCanvasGroupSeparatorsForPanel(panel); });
    }

    context.signalRenderComplete();
  }

  // ------------------------------
  // Layout helpers
  // ------------------------------

  function clearPanelCanvas(panel: { canvas: HTMLElement }) {
    if (!panel || !panel.canvas) return;
    panel.canvas.innerHTML = '';
    panel.canvas.querySelectorAll('.grid-line').forEach(line => line.remove());
    panel.canvas.querySelectorAll('.primary-sync-separator').forEach(el => el.remove());
  }

  function ensureLayoutThen(fn: () => void) { requestAnimationFrame(() => setTimeout(fn, 0)); }

  function nextLayoutTick(): Promise<void> { return new Promise(resolve => { requestAnimationFrame(() => setTimeout(resolve, 0)); }); }

  // ------------------------------
  // Data helpers (subject/trellis keys and grouping)
  // ------------------------------

  function subjectKey(row: Spotfire.DataViewRow): string {
    try {
      const d = row.categorical('Details');
      if (!d) return '';
      const valFn = (d as any).value;
      const fmtFn = (d as any).formattedValue;
      const v: any = typeof valFn === 'function' ? valFn.call(d) : undefined;
      if (Array.isArray(v)) {
        return JSON.stringify(v.map((item: any) => {
          if (!item) return '';
          if (typeof item.key !== 'undefined') return String(item.key);
          if (typeof item.value !== 'undefined') return String(item.value);
          if (typeof item.formattedValue === 'function') return String(item.formattedValue());
          return String(item);
        }));
      }
      if (typeof v !== 'undefined' && v !== null) return String(v);
      if (typeof fmtFn === 'function') return String(fmtFn.call(d));
    } catch {}
    return '';
  }

  function trellisKey(row: Spotfire.DataViewRow): string {
    try {
      const c = row.categorical('Trellis');
      if (!c) return '';
      const valFn = (c as any).value;
      const v: any = typeof valFn === 'function' ? valFn.call(c) : undefined;
      if (Array.isArray(v) && v.length) {
        const item = v[0];
        if (item && typeof item.key !== 'undefined') return String(item.key);
        if (item && typeof item.value !== 'undefined') return String(item.value);
      } else if (typeof v !== 'undefined' && v !== null) {
        return String(v);
      }
      const fmtFn = (c as any).formattedValue;
      if (typeof fmtFn === 'function') return String(fmtFn.call(c));
    } catch {}
    return '';
  }

  function trellisLabel(row: Spotfire.DataViewRow): string {
    try {
      const c = row.categorical('Trellis');
      if (!c) return '';
      const fmtFn = (c as any).formattedValue;
      if (typeof fmtFn === 'function') return String(fmtFn.call(c));
    } catch {}
    return trellisKey(row) || '';
  }

  function collectTrellisGroups(xLeaves: Spotfire.DataViewHierarchyNode[]): { key: string, label: string }[] {
    const map = new Map<string, string>();
    xLeaves.forEach(leaf => {
      leaf.rows().forEach(row => {
        const k = trellisKey(row);
        if (!k) return;
        if (!map.has(k)) map.set(k, trellisLabel(row) || k);
      });
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }

  function hasDetails(rows: Spotfire.DataViewRow[]): boolean {
    for (const r of rows) { if (subjectKey(r)) return true; }
    return false;
  }

  function uniqueSubjectCount(rows: Spotfire.DataViewRow[]): number {
    const s = new Set<string>();
    rows.forEach(r => { const k = subjectKey(r); if (k) s.add(k); });
    return s.size;
  }

  function getYValues(rows: Spotfire.DataViewRow[], dedupByDetails: boolean): number[] {
    if (!dedupByDetails) return rows.map(r => r.continuous('Y').value()).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const m = new Map<string, number>();
    for (const r of rows) {
      const y = r.continuous('Y').value();
      if (typeof y !== 'number' || !Number.isFinite(y)) continue;
      const k = subjectKey(r);
      if (!k) continue;
      if (!m.has(k)) m.set(k, y);
    }
    return Array.from(m.values());
  }

  // ------------------------------
  // Statistics and domain utilities
  // ------------------------------

  function statsFromValues(values: number[]) {
    const arr = values.slice().sort((a, b) => a - b);
    if (!arr.length) return { min: NaN, q1: NaN, median: NaN, q3: NaN, max: NaN, count: 0 };
    const q = (p: number) => {
      const idx = (arr.length - 1) * p;
      const lo = Math.floor(idx);
      const w = idx - lo;
      if (lo + 1 >= arr.length) return arr[lo];
      return arr[lo] * (1 - w) + arr[lo + 1] * w;
    };
    return { min: arr[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: arr[arr.length - 1], count: arr.length };
  }
  const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const stdDev = (v: number[]) => { if (v.length <= 1) return 0; const a = avg(v); return Math.sqrt(v.map(x => (x - a) ** 2).reduce((s, x) => s + x, 0) / (v.length - 1)); };
  const stdErr = (v: number[]) => (v.length > 1 ? stdDev(v) / Math.sqrt(v.length) : 0);
  const ci95 = (v: number[]) => { const a = avg(v), se = stdErr(v), t = 1.96; return { lower: a - t * se, upper: a + t * se }; };
  function outlierCount(values: number[]): number { const s = statsFromValues(values); const iqr = s.q3 - s.q1; const lo = s.q1 - 1.5 * iqr; const hi = s.q3 + 1.5 * iqr; return values.filter(x => x < lo || x > hi).length; }

  function calculateMinMaxYValueFiltered(xLeaves: Spotfire.DataViewHierarchyNode[], filter: ((row: Spotfire.DataViewRow) => boolean) | null) {
    let minValue = Infinity;
    let maxValue = -Infinity;
    const wantUnique = (props.countMode.value() === 'uniqueDetails');
    xLeaves.forEach((leaf) => {
      const rowsAll = leaf.rows();
      const rows = filter ? rowsAll.filter(r => filter(r)) : rowsAll;
      if (!rows.length) return;
      const dedupFlag = wantUnique && hasDetails(rows);
      const yVals = dedupFlag ? getYValues(rows, true) : rows.map(r => r.continuous('Y').value()).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      for (const y of yVals) { if (y < minValue) minValue = y; if (y > maxValue) maxValue = y; }
    });
    if (!Number.isFinite(minValue)) minValue = 0;
    if (!Number.isFinite(maxValue)) maxValue = 0;
    if (minValue === maxValue) maxValue = minValue + 1;
    return { min: minValue, max: maxValue };
  }

  function computePaddedDomain(min: number, max: number, pixelHeight: number, pointSizeProp: Spotfire.ModProperty<number>, medianWidthProp: Spotfire.ModProperty<number>): { min: number; max: number } {
    const range = Math.max(1e-9, max - min);
    const basePct = 0.04;
    const psRaw = pointSizeProp.value();
    const ps = typeof psRaw === 'number' ? psRaw : parseInt(String(psRaw ?? 4), 10);
    const mwRaw = medianWidthProp.value();
    const mw = typeof mwRaw === 'number' ? mwRaw : parseInt(String(mwRaw ?? 2), 10);
    const maxMarkPx = Math.max(6, Math.round(Math.max(ps, mw) * 1.4) + 2);
    const padDataFromPx = range * (maxMarkPx / Math.max(1, pixelHeight));
    const padData = Math.max(range * basePct, padDataFromPx);
    return { min: min - padData, max: max + padData };
  }

  function pAdjustBHKeepNA(pRaw: number[]): number[] {
    const out = new Array(pRaw.length).fill(NaN);
    const finite = pRaw.map((p, i) => ({ p, i })).filter(o => Number.isFinite(o.p));
    const m = finite.length;
    if (m === 0) return out;
    finite.sort((a, b) => a.p - b.p);
    const adjAsc = new Array(m);
    for (let r = m - 1; r >= 0; r--) {
      const p = finite[r].p;
      const q = Math.min(1, (m / (r + 1)) * p);
      adjAsc[r] = (r < m - 1) ? Math.min(q, adjAsc[r + 1]) : q;
    }
    for (let r = 0; r < m; r++) out[finite[r].i] = adjAsc[r];
    return out;
  }

  function getStatsHeight(panel: Panel): number {
    const wrapper = panel.root.querySelector('.summary-table-wrapper') as HTMLElement | null;
    return wrapper ? wrapper.offsetHeight : 0;
  }

  // ------------------------------
  // Annotation headroom estimation
  // ------------------------------

  function estimateAnnotationHeadroomPx(
    panel: Panel,
    xRoot: Spotfire.DataViewHierarchyNode,
    cfg: AnnoConfig,
    rowFilter: ((row: Spotfire.DataViewRow) => boolean) | null
  ): number {
    if (!cfg || cfg.mode === 'off') return 0;

    const leafNodes: Spotfire.DataViewHierarchyNode[] = [];
    (function walk(n: Spotfire.DataViewHierarchyNode) {
      const ch = n.children || [];
      if (ch.length) ch.forEach(walk);
      else leafNodes.push(n);
    })(xRoot);
    const n = leafNodes.length; if (n < 2) return 0;

    const pairs: [number, number][] = [];
    const mode = String(cfg.mode || 'off').toLowerCase();
    if (mode === 'adjacent') { for (let i = 0; i < n - 1; i++) pairs.push([i, i + 1]); }
    else if (mode === 'anchor') { const idx = Math.max(1, Math.min(n, Number(cfg.anchorIndex || 1))) - 1; for (let j = 0; j < n; j++) if (j !== idx) pairs.push([Math.min(idx, j), Math.max(idx, j)]); }
    else if (mode === 'custompairs' || mode === 'manual') {
      try {
        const valuesDiv = panel.root.querySelector('.summary-table-values') as HTMLElement | null;
        const ths = valuesDiv?.querySelectorAll('thead .header-leaf, thead .header-single');
        const labels: string[] = ths ? Array.from(ths).map((th: any) => String(th.textContent || '').trim()) : [];
        const map: Record<string, number> = {}; labels.forEach((lab, i) => { if (lab) map[lab] = i; });
        (cfg.pairsCsv || '').split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
          const tilde = tok.includes('~');
          const dash = tok.includes('-');
          if (tilde) {
            const parts = tok.split('~').map(s => s.trim());
            if (parts.length === 2 && parts[0] in map && parts[1] in map) {
              const i = map[parts[0]], j = map[parts[1]]; if (i !== j) pairs.push([Math.min(i, j), Math.max(i, j)]);
            }
          } else if (dash) {
            const parts = tok.split('-').map(s => s.trim());
            const i = Math.max(1, parseInt(parts[0], 10) || 0) - 1;
            const j = Math.max(1, parseInt(parts[1], 10) || 0) - 1;
            if (Number.isInteger(i) && Number.isInteger(j) && i >= 0 && j >= 0 && i < n && j < n && i !== j) pairs.push([Math.min(i, j), Math.max(i, j)]);
          }
        });
      } catch {}
    }
    if (!pairs.length && mode !== 'global') return 0;

    pairs.sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]) || (a[0] - b[0]));
    const levels: [number, number][][] = [];
    const overlaps = (p1: [number, number], p2: [number, number]) => !(p1[1] <= p2[0] || p2[1] <= p1[0]);
    for (const p of pairs) {
      let placed = false;
      for (const L of levels) { if (!L.some(q => overlaps(q, p))) { L.push(p); placed = true; break; } }
      if (!placed) levels.push([p]);
    }
    const totalLevels = levels.length + (mode === 'global' ? 1 : 0);
    if (totalLevels <= 0) return 0;

    const H = panel.canvas.offsetHeight || panel.root.getBoundingClientRect().height || 200;
    const fontPx = Math.max(6, Math.min(20, Number(cfg.fontPx || 6)));
    const tickH = Math.max(8, Math.round(fontPx * 0.9));
    const levelGap = Math.max(16, fontPx + 10);
    const labelGap = 6;
    const baseTop = Math.max(0, Math.round((Number(cfg.topPadPct || 3) / 100) * H));
    const needed = baseTop + (totalLevels - 1) * levelGap + tickH + fontPx + labelGap;
    return Math.max(0, Math.min(needed, Math.round(0.5 * H)));
  }

  // ------------------------------
  // Y-axis scale rendering
  // ------------------------------

  function renderYScale(
    panel: Panel,
    minYValue: number,
    maxYValue: number,
    yAxis: Spotfire.Axis,
    yAxisMode: Spotfire.ModProperty<string>,
    showYGrid: Spotfire.ModProperty<boolean>,
    xLeaves: Spotfire.DataViewHierarchyNode[],
    dataViewYAxis: Spotfire.DataViewContinuousAxis,
    manualStep?: number,
    includeOrigin?: boolean
  ) {
    const yScaleDiv = panel.yScale;
    const canvasDiv = panel.canvas;
    const tableHeight = getStatsHeight(panel);
    yScaleDiv.style.width = 'var(--label-col-width)';
    yScaleDiv.style.top = '0px';
    yScaleDiv.style.bottom = `${tableHeight}px`;
    yScaleDiv.style.height = `calc(100% - ${tableHeight}px)`;
    yScaleDiv.innerHTML = '';
    const canvasHeight = canvasDiv.offsetHeight;

    const ticks: number[] = (Number.isFinite(manualStep!) && manualStep! > 0)
      ? getManualTicks(minYValue, maxYValue, manualStep!, !!includeOrigin)
      : getNiceTicks(minYValue, maxYValue, canvasHeight);

    canvasDiv.querySelectorAll('.grid-line').forEach(line => line.remove());
    ticks.forEach((tickValue: number) => {
      const percent = 100 * (tickValue - minYValue) / (maxYValue - minYValue || 1);
      const label = createDiv('scale-label', formatTick(tickValue));
      label.style.color = context.styling.scales.font.color;
      label.style.fontSize = context.styling.scales.font.fontSize + 'px';
      label.style.fontFamily = context.styling.scales.font.fontFamily;
      label.style.bottom = percent + '%';
      yScaleDiv.appendChild(label);

      if (showYGrid.value()) {
        const gridLine = document.createElement('div');
        gridLine.className = 'grid-line';
        gridLine.style.position = 'absolute';
        gridLine.style.left = '0';
        gridLine.style.right = '0';
        gridLine.style.height = '1px';
        gridLine.style.bottom = `${percent}%`;
        gridLine.style.borderTop = '1px dashed rgba(200,200,200,0.6)';
        gridLine.style.backgroundColor = 'transparent';
        gridLine.style.zIndex = '0';
        gridLine.style.pointerEvents = 'none';
        canvasDiv.appendChild(gridLine);
      }
    });

    yScaleDiv.onmouseenter = () => mod.controls.tooltip.show(yAxis.name + ': ' + yAxis.expression);
    yScaleDiv.onmouseleave = () => mod.controls.tooltip.hide();
    yScaleDiv.oncontextmenu = function (e: MouseEvent) {
      e.preventDefault(); e.stopPropagation();
      mod.controls.contextMenu.show(e.clientX, e.clientY, [
        { text: 'Percentage', checked: yAxisMode.value() === 'percentage', enabled: yAxisMode.value() !== 'percentage' },
        { text: 'Numeric', checked: yAxisMode.value() === 'numeric', enabled: yAxisMode.value() !== 'numeric' }
      ]).then(clickedItem => {
        if (clickedItem.text === 'Percentage') props.yAxisMode.set('percentage');
        else if (clickedItem.text === 'Numeric') props.yAxisMode.set('numeric');
      });
    };

    function getNiceTicks(domainMin: number, domainMax: number, pixelHeight: number): number[] {
      const targetTickCount = Math.max(3, Math.min(12, Math.round(pixelHeight / 50)));
      const step = niceStep(domainMin, domainMax, targetTickCount);
      const tickMin = Math.ceil(domainMin / step) * step;
      const tickMax = Math.floor(domainMax / step) * step;
      const out: number[] = [];
      for (let t = tickMin; t <= tickMax + 1e-9; t += step) out.push(Number(t.toPrecision(12)));
      if (domainMin <= 0 && 0 <= domainMax && !out.includes(0)) out.push(0);
      out.sort((a, b) => a - b);
      return out;
    }
    function niceStep(min: number, max: number, targetCount: number): number {
      const raw = (max - min) / Math.max(1, targetCount);
      const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-12))));
      const possible = [1, 2, 2.5, 5, 10];
      return possible.map(d => d * mag).find(st => raw <= st) || 10 * mag;
    }
    function getManualTicks(min: number, max: number, step: number, includeZero: boolean): number[] {
      if (!(step > 0)) return getNiceTicks(min, max, canvasHeight);
      if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
      const start = Math.ceil(min / step) * step;
      const out: number[] = [];
      for (let t = start; t <= max + 1e-9; t += step) out.push(Number(t.toPrecision(12)));
      if (includeZero && min <= 0 && 0 <= max && !out.includes(0)) { out.push(0); out.sort((a, b) => a - b); }
      return out;
    }
    function formatTick(v: number): string {
      const abs = Math.abs(v);
      const dec = abs < 1 ? 2 : (abs < 10 ? 2 : 1);
      return String(Number(v.toFixed(dec)));
    }
  }

  // ------------------------------
  // Summary table rendering and settings button
  // ------------------------------

  function renderUnifiedTable(
    panel: Panel,
    xHierarchyRoot: Spotfire.DataViewHierarchyNode,
    ui: {
      jitterWidth: Spotfire.ModProperty<number>;
      showYGrid: Spotfire.ModProperty<boolean>;
      showXGrid: Spotfire.ModProperty<boolean>;
      pointSize: Spotfire.ModProperty<number>;
      pointOpacityPct: Spotfire.ModProperty<number>;
      yRangeMode: Spotfire.ModProperty<string>;
      yMinManual: Spotfire.ModProperty<string>;
      yMaxManual: Spotfire.ModProperty<string>;
      yIncludeOrigin: Spotfire.ModProperty<boolean>;
      yTickIntervalMode: Spotfire.ModProperty<string>;
      yTickInterval: Spotfire.ModProperty<string>;
      annotationMode: Spotfire.ModProperty<string>;
      annotationTest: Spotfire.ModProperty<string>;
      annotationPAdj: Spotfire.ModProperty<string>;
      annotationPairs: Spotfire.ModProperty<string>;
      annotationAlpha: Spotfire.ModProperty<number>;
      annotationStarMode: Spotfire.ModProperty<string>;
      annotationFontSizePx: Spotfire.ModProperty<number>;
      annotationLineWidthPx: Spotfire.ModProperty<number>;
      annotationTopPaddingPct: Spotfire.ModProperty<number>;
      annotationAnchorLabel: Spotfire.ModProperty<string>;
      annotationAnchorIndex: Spotfire.ModProperty<number>;
      summaryStats: Spotfire.ModProperty<string>;
    },
    splitBars: Spotfire.ModProperty<boolean>,
    jitterWidthProp: Spotfire.ModProperty<number>,
    showYGridProp: Spotfire.ModProperty<boolean>,
    showXGridProp: Spotfire.ModProperty<boolean>,
    rowFilter?: ((row: Spotfire.DataViewRow) => boolean) | null
  ) {
    panel.root.querySelectorAll('.summary-table-wrapper').forEach(el => el.remove());
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-table-wrapper';
    panel.root.appendChild(wrapper);

    function getLeafColumns(node: Spotfire.DataViewHierarchyNode, ancestry: string[] = []) {
      const label = safeFormattedValue(node);
      const next = label && label.trim() !== '' ? [...ancestry, label] : ancestry;
      const children = node.children || [];
      if (!children.length) return [{ ancestry: next, leafNode: node }];
      let res: { ancestry: string[], leafNode: Spotfire.DataViewHierarchyNode }[] = [];
      children.forEach(child => { res = res.concat(getLeafColumns(child, next)); });
      return res;
    }

    const columns = getLeafColumns(xHierarchyRoot).map(c => ({ leafNode: c.leafNode, ancestry: c.ancestry.filter(lbl => typeof lbl === 'string' && lbl.trim() !== '') }));
    const twoHeaderRows = columns.some(c => c.ancestry.length >= 2);
    const topLabels: string[] = columns.map(c => c.ancestry[0] || '');
    const leafLabels: string[] = columns.map(c => twoHeaderRows ? (c.ancestry[c.ancestry.length - 1] || '') : '');
    const columnCount = Math.max(1, columns.length);
    const colPct = 100 / columnCount;

    const desiredOrder = ['uniqueCount', 'median', 'average', 'stdDev', 'stdError', 'ciLower', 'ciUpper', 'min', 'max', 'outlierCount'];
    const canonicalSet = new Set(desiredOrder);
    const labelToCanonical: Record<string, string> = {
      'n': 'uniqueCount', 'count': 'uniqueCount', 'rows': 'uniqueCount',
      'average': 'average', 'mean': 'average',
      'median': 'median',
      'stddev': 'stdDev', 'std dev': 'stdDev', 'std. dev': 'stdDev', 'std_dev': 'stdDev', 'sd': 'stdDev',
      'stderr': 'stdError', 'std error': 'stdError', 'std. error': 'stdError', 'std_error': 'stdError', 'se': 'stdError',
      'ci lower 95%': 'ciLower', 'ci lower': 'ciLower', 'ci_lower': 'ciLower', 'ci95lower': 'ciLower',
      'ci upper 95%': 'ciUpper', 'ci upper': 'ciUpper', 'ci_upper': 'ciUpper', 'ci95upper': 'ciUpper',
      'min': 'min', 'max': 'max',
      'outliers': 'outlierCount', 'outlier count': 'outlierCount', 'outliercount': 'outlierCount', 'outlier_count': 'outlierCount'
    };

    function parseStatsToSet(raw: string): Set<string> {
      const out = new Set<string>();
      (raw || '').split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
        if (canonicalSet.has(tok)) out.add(tok);
        else {
          const canon = labelToCanonical[tok.toLowerCase()];
          if (canon && canonicalSet.has(canon)) out.add(canon);
        }
      });
      return out;
    }
    function orderedFromSet(set: Set<string>): string[] { return desiredOrder.filter(k => set.has(k)); }

    const statsListStr = String(ui.summaryStats.value() ?? '');
    const statsList = orderedFromSet(parseStatsToSet(statsListStr));
    const statLabelMap: Record<string, string> = {
      uniqueCount: 'N', median: 'Median', min: 'Min', max: 'Max', outlierCount: 'Outliers', average: 'Average', stdDev: 'Std Dev', stdError: 'Std Error', ciLower: 'CI Lower 95%', ciUpper: 'CI Upper 95%'
    };

    function getSplitClasses(index: number): string[] {
      const classes: string[] = [];
      if (index === 0 || topLabels[index] !== topLabels[index - 1]) classes.push('main-split-left');
      if (index === columns.length - 1 || topLabels[index] !== topLabels[index + 1]) classes.push('main-split-right');
      return classes;
    }

    type ColumnMetrics = { yVals: number[]; countRows: number; uniqueSubjects: number; stats: { min: number; q1: number; median: number; q3: number; max: number; count: number }; ci: { lower: number; upper: number }; outliers: number };
    const useUnique = (props.countMode.value() === 'uniqueDetails');
    const colMetrics: ColumnMetrics[] = columns.map(col => {
      const rowsAll = col.leafNode.rows();
      const rows = rowFilter ? rowsAll.filter(r => rowFilter!(r)) : rowsAll;
      const dedup = useUnique && hasDetails(rows);
      const yVals = getYValues(rows, dedup);
      const s = statsFromValues(yVals);
      const ci = ci95(yVals);
      const out = outlierCount(yVals);
      const uniqueSubjects = s.count;
      return { yVals, countRows: rows.length, uniqueSubjects, stats: s, ci, outliers: out };
    });

    function statValueFor(stat: string, m: ColumnMetrics): string {
      switch (stat) {
        case 'uniqueCount': return String(m.uniqueSubjects);
        case 'median': return Number.isFinite(m.stats.median) ? m.stats.median.toFixed(2) : '';
        case 'min': return Number.isFinite(m.stats.min) ? m.stats.min.toFixed(2) : '';
        case 'max': return Number.isFinite(m.stats.max) ? m.stats.max.toFixed(2) : '';
        case 'outlierCount': return String(m.outliers);
        case 'average': return m.yVals.length ? avg(m.yVals).toFixed(2) : '';
        case 'stdDev': return m.yVals.length > 1 ? stdDev(m.yVals).toFixed(2) : '';
        case 'stdError': return m.yVals.length > 1 ? stdErr(m.yVals).toFixed(2) : '';
        case 'ciLower': return Number.isFinite(m.ci?.lower) ? m.ci.lower.toFixed(2) : '';
        case 'ciUpper': return Number.isFinite(m.ci?.upper) ? m.ci.upper.toFixed(2) : '';
        default: return '';
      }
    }

    const visibleStats = statsList.slice();

    const labelsDiv = document.createElement('div');
    labelsDiv.className = 'summary-table-labels';
    labelsDiv.style.height = '100%';
    labelsDiv.style.display = 'block';
    labelsDiv.style.width = 'var(--label-col-width)';
    labelsDiv.style.overflow = 'hidden';
    labelsDiv.style.position = 'relative';

    const labelsHeader = document.createElement('div');
    labelsHeader.className = 'labels-header';
    labelsHeader.style.position = 'relative';
    labelsHeader.style.zIndex = '3';
    labelsDiv.appendChild(labelsHeader);

    const labelsRowsContainer = document.createElement('div');
    labelsRowsContainer.className = 'labels-rows';
    labelsRowsContainer.style.position = 'absolute';
    labelsRowsContainer.style.left = '0';
    labelsRowsContainer.style.right = '0';
    labelsRowsContainer.style.zIndex = '2';

    const labelBorderColor = 'rgba(160,160,160,0.6)';
    function renderLabels(stats: string[]) {
      labelsRowsContainer.innerHTML = '';
      stats.forEach(stat => {
        const full = statLabelMap[stat] || stat;
        const labelDiv = document.createElement('div');
        labelDiv.className = 'row-label';
        labelDiv.style.height = 'var(--row-height)';
        labelDiv.style.lineHeight = 'var(--row-height)';
        labelDiv.style.whiteSpace = 'nowrap';
        labelDiv.style.overflow = 'hidden';
        labelDiv.style.textOverflow = 'ellipsis';
        labelDiv.style.padding = '0 6px';
        labelDiv.title = full;
        labelDiv.textContent = full;
        labelsRowsContainer.appendChild(labelDiv);
      });
    }
    renderLabels(visibleStats);
    labelsDiv.appendChild(labelsRowsContainer);
    wrapper.appendChild(labelsDiv);

    const valuesDiv = document.createElement('div');
    valuesDiv.className = 'summary-table-values';
    valuesDiv.style.height = '100%';
    valuesDiv.style.overflowY = 'auto';
    valuesDiv.style.overflowX = 'hidden';
    valuesDiv.style.flex = '1 1 auto';

    function buildThead(): string {
      let html = '<thead>';
      if (twoHeaderRows) {
        html += '<tr class="thead-row-top">';
        let c = 0;
        while (c < columns.length) {
          const label = topLabels[c] || '';
          let run = 1;
          while (c + run < columns.length && (topLabels[c + run] || '') === label) run++;
          const startCls = getSplitClasses(c).includes('main-split-left') ? ' main-split-left' : '';
          const endIdx = c + run - 1;
          const endCls = getSplitClasses(endIdx).includes('main-split-right') ? ' main-split-right' : '';
          html += `<th class="header-top${startCls}${endCls}" title="${escapeHtml(label)}" colspan="${run}" style="text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:2px 6px;">${escapeHtml(label)}</th>`;
          c += run;
        }
        html += '</tr><tr class="thead-row-leaf">';
        for (let i = 0; i < columns.length; i++) {
          const cls = getSplitClasses(i).join(' ');
          const leafTitle = leafLabels[i] || '';
          html += `<th class="header-leaf ${cls}" title="${escapeHtml(leafTitle)}" style="width:${colPct}%; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:2px 6px;">${escapeHtml(leafTitle)}</th>`;
        }
        html += '</tr>';
      } else {
        html += '<tr class="thead-row-single">';
        for (let i = 0; i < columns.length; i++) {
          const cls = getSplitClasses(i).join(' ');
          const topTitle = topLabels[i] || '';
          html += `<th class="header-single ${cls}" title="${escapeHtml(topTitle)}" style="width:${colPct}%; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:2px 6px;">${escapeHtml(topTitle)}</th>`;
        }
        html += '</tr>';
      }
      html += '</thead>';
      return html;
    }

    function buildTbody(stats: string[]): string {
      let html = '<tbody>';
      if (!stats.length) { html += '</tbody>'; return html; }
      stats.forEach(stat => {
        html += '<tr>';
        for (let i = 0; i < columns.length; i++) {
          const m = colMetrics[i];
          const val = statValueFor(stat, m);
          const cls = getSplitClasses(i).join(' ');
          html += `<td class="${cls}" title="${val}" style="width:${colPct}%; min-width:0; height:var(--row-height); padding:3px 4px;">${val}</td>`;
        }
        html += '</tr>';
      });
      html += '</tbody>';
      return html;
    }

    valuesDiv.innerHTML = `<table>${buildThead()}${buildTbody(visibleStats)}</table>`;
    wrapper.appendChild(valuesDiv);

    function measureLabelsWidthPx(labels: string[]): number {
      const fontSize = 13;
      const fontFamily = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 90;
      ctx.font = `${fontSize}px ${fontFamily}`;
      let max = 0;
      for (const txt of labels) {
        const w = ctx.measureText(txt).width;
        if (w > max) max = w;
      }
      return Math.ceil(max + 16);
    }

    function applyHeaderAndRowSync() {
      const thead = valuesDiv.querySelector('thead') as HTMLElement | null;
      const headRows = thead ? Array.from(thead.querySelectorAll('tr')) as HTMLElement[] : [];
      const topH = headRows[0] ? headRows[0].getBoundingClientRect().height : 0;
      const leafH = headRows[1] ? headRows[1].getBoundingClientRect().height : 0;
      const totalHeaderH = topH + leafH;

      // Keeps right header sticky (you already have this)
      panel.root.style.setProperty('--header-top-height', `${topH}px`);

      // NEW: give the left labels header a real height so it acts like a header and does not scroll
      const labelsHeaderEl = labelsDiv.querySelector('.labels-header') as HTMLElement | null;
      if (labelsHeaderEl) {
        labelsHeaderEl.style.height = `${totalHeaderH}px`;
      }

      // Existing: offset rows under the header height
      const rowsEl = labelsDiv.querySelector('.labels-rows') as HTMLElement;
      rowsEl.style.top = `${totalHeaderH}px`;

      const fixedRowH = DEFAULT_ROW_HEIGHT_PX;
      panel.root.style.setProperty('--row-height', `${fixedRowH}px`);
      rowsEl.querySelectorAll('.row-label').forEach(div => {
        const nd = div as HTMLElement;
        nd.style.height = `${fixedRowH}px`;
        nd.style.lineHeight = `${fixedRowH}px`;
      });

      const bodyRows = visibleStats.length;
      const idealTableHeight = Math.ceil(totalHeaderH + bodyRows * fixedRowH);
      const actualHeight = Math.min(idealTableHeight, SUMMARY_MAX_HEIGHT_PX);
      wrapper.style.height = `${actualHeight}px`;
      valuesDiv.style.height = `${actualHeight}px`;
      rowsEl.style.height = `${bodyRows * fixedRowH}px`;

      const labelNames = visibleStats.map(s => statLabelMap[s] || s);
      const measured = measureLabelsWidthPx(labelNames);
      const autoW = clamp(measured, 60, 140);
      panel.root.style.setProperty('--label-col-width', `${autoW}px`);

      const lblBorderColor = 'rgba(160,160,160,0.6)';
      labelsDiv.style.borderRight = 'none';
      if (labelsHeaderEl) labelsHeaderEl.style.borderRight = `1px solid ${lblBorderColor}`;
      rowsEl.style.borderRight = `1px solid ${lblBorderColor}`;

      panel.yScale.style.top = '0';
      panel.yScale.style.height = `calc(100% - ${actualHeight}px)`;
      panel.xScale.style.height = '0';
      panel.xScale.style.left = 'var(--label-col-width)';
      panel.xScale.style.right = '0px';
      panel.xScale.style.bottom = `${Math.max(actualHeight - 4, 0)}px`;
      panel.canvas.style.top = '0';
      panel.canvas.style.bottom = `${actualHeight}px`;
    }

    applyHeaderAndRowSync();
    requestAnimationFrame(applyHeaderAndRowSync);
    setTimeout(applyHeaderAndRowSync, 50);

    valuesDiv.addEventListener('scroll', () => {
      const rowsEl = labelsDiv.querySelector('.labels-rows') as HTMLElement;
      rowsEl.style.transform = `translate3d(0, ${-valuesDiv.scrollTop}px, 0)`;
    });

    // Disable header click triggers so only the button opens Settings
    const labelsHeaderEl = labelsDiv.querySelector('.labels-header') as HTMLElement | null;
    if (labelsHeaderEl) {
      labelsHeaderEl.onclick = null;
      labelsHeaderEl.style.cursor = 'default';
      labelsHeaderEl.removeAttribute('title');
    }
    const theadEl2 = wrapper.querySelector('.summary-table-values thead') as HTMLElement | null;
    if (theadEl2) { (theadEl2 as any).onclick = null; (theadEl2.style as any).cursor = 'default'; }

    const renderSettingsButton = () => {
      if (!context.isEditing) {
        const labelsHeaderEl = panel.root.querySelector('.summary-table-labels .labels-rows') as HTMLElement | null;
        if (labelsHeaderEl) labelsHeaderEl.onclick = null;
        const theadEl2 = panel.root.querySelector('.summary-table-values thead') as HTMLElement | null;
        if (theadEl2) (theadEl2 as any).onclick = null;
        return;
      }

      const isTrellis = borderDiv.classList.contains('trellis-mode');

      // Remove any accidental per-panel button
      const oldLocal = panel.root.querySelector('.settings-button');
      if (oldLocal) oldLocal.remove();

      if (isTrellis) {
        // One global button only
        if (!globalSettingsButtonCreated) {
          let existingGlobal = borderDiv.querySelector('.settings-button-global') as HTMLElement | null;
          if (!existingGlobal) {
            const btn = document.createElement('button');
            btn.className = 'settings-button settings-button-global';
            btn.title = 'Settings';
            btn.setAttribute('aria-label', 'Settings');

            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('viewBox', '0 0 32 32');
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.style.overflow = 'visible';
            const g = document.createElementNS(svgNS, 'g');
            g.setAttribute('fill', 'none');
            g.setAttribute('stroke', 'currentColor');
            g.setAttribute('stroke-width', '2');
            g.setAttribute('stroke-linecap', 'round');
            g.setAttribute('stroke-linejoin', 'round');
            g.setAttribute('vector-effect', 'non-scaling-stroke');
            g.setAttribute('shape-rendering', 'crispEdges');
            const outer = document.createElementNS(svgNS, 'circle');
            outer.setAttribute('cx', '16'); outer.setAttribute('cy', '16'); outer.setAttribute('r', '9'); g.appendChild(outer);
            const hub = document.createElementNS(svgNS, 'circle');
            hub.setAttribute('cx', '16'); hub.setAttribute('cy', '16'); hub.setAttribute('r', '4'); g.appendChild(hub);
            const addTooth = (angleDeg: number) => {
              const w = 3; const h = 4; const gap = 1;
              const rect = document.createElementNS(svgNS, 'rect');
              rect.setAttribute('x', String(-w / 2));
              rect.setAttribute('y', String(-(9 + gap + h / 2)));
              rect.setAttribute('width', String(w));
              rect.setAttribute('height', String(h));
              rect.setAttribute('rx', '0.8');
              rect.setAttribute('ry', '0.8');
              rect.setAttribute('fill', 'none');
              rect.setAttribute('transform', `translate(16,16) rotate(${angleDeg})`);
              g.appendChild(rect);
            };
            for (let a = 0; a < 360; a += 45) addTooth(a);
            svg.appendChild(g);
            btn.appendChild(svg);

            btn.onclick = (evt) => openStatsPopoutStable(evt as MouseEvent);
            borderDiv.appendChild(btn);
          }
          globalSettingsButtonCreated = true;
        }
        return; // no per-panel button in trellis
      }

      // Single-pane: render gear on panel root
      const host = panel.root;
      const old = host.querySelector('.settings-button');
      if (old) old.remove();

      const btn = document.createElement('button');
      btn.className = 'settings-button';
      btn.title = 'Settings';
      btn.setAttribute('aria-label', 'Settings');

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 32 32');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.style.overflow = 'visible';
      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('fill', 'none');
      g.setAttribute('stroke', 'currentColor');
      g.setAttribute('stroke-width', '2');
      g.setAttribute('stroke-linecap', 'round');
      g.setAttribute('stroke-linejoin', 'round');
      g.setAttribute('vector-effect', 'non-scaling-stroke');
      g.setAttribute('shape-rendering', 'crispEdges');
      const outer = document.createElementNS(svgNS, 'circle');
      outer.setAttribute('cx', '16');
      outer.setAttribute('cy', '16');
      outer.setAttribute('r', '9');
      g.appendChild(outer);
      const hub = document.createElementNS(svgNS, 'circle');
      hub.setAttribute('cx', '16');
      hub.setAttribute('cy', '16');
      hub.setAttribute('r', '4');
      g.appendChild(hub);
      const addTooth = (angleDeg: number) => {
        const w = 3; const h = 4; const gap = 1;
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', String(-w / 2));
        rect.setAttribute('y', String(-(9 + gap + h / 2)));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('rx', '0.8');
        rect.setAttribute('ry', '0.8');
        rect.setAttribute('fill', 'none');
        rect.setAttribute('transform', `translate(16,16) rotate(${angleDeg})`);
        g.appendChild(rect);
      };
      for (let a = 0; a < 360; a += 45) addTooth(a);
      svg.appendChild(g);
      btn.appendChild(svg);

      btn.onclick = (evt) => openStatsPopoutStable(evt as MouseEvent);
      host.appendChild(btn);

      const labelsHeaderEl2 = panel.root.querySelector('.summary-table-labels .labels-rows') as HTMLElement | null;
      if (labelsHeaderEl2) labelsHeaderEl2.onclick = null;
      const theadEl22 = panel.root.querySelector('.summary-table-values thead') as HTMLElement | null;
      if (theadEl22) (theadEl22 as any).onclick = null;
    };

    renderSettingsButton();
  }

  // ------------------------------
  // Canvas synchronization helpers
  // ------------------------------

  function syncCanvasColumnsToHeaderForPanel(panel: { root: HTMLElement; canvas: HTMLElement }) {
    const valuesDiv = panel.root.querySelector('.summary-table-values') as HTMLElement | null;
    if (!valuesDiv) return;
    const thead = valuesDiv.querySelector('thead') as HTMLElement | null;
    if (!thead) return;
    const leafRow = thead.querySelector('.thead-row-leaf') as HTMLElement | null;
    const singleRow = thead.querySelector('.thead-row-single') as HTMLElement | null;
    const cells = leafRow
      ? (Array.from(leafRow.querySelectorAll('th.header-leaf')) as HTMLElement[])
      : (singleRow ? (Array.from(singleRow.querySelectorAll('th.header-single')) as HTMLElement[]) : []);
    if (cells.length === 0) return;

    const canvasDiv = panel.canvas;
    const canvasRect = canvasDiv.getBoundingClientRect();
    const cols = Array.from(canvasDiv.querySelectorAll('.plot-col')) as HTMLElement[];
    cells.forEach((cell, i) => {
      const r = cell.getBoundingClientRect();
      const left = r.left - canvasRect.left;
      const width = r.width;
      const col = cols[i];
      if (col) { col.style.left = `${left}px`; col.style.width = `${width}px`; }
    });
  }

  function updateCanvasGroupSeparatorsForPanel(panel: { root: HTMLElement; canvas: HTMLElement }) {
    const canvasDiv = panel.canvas;
    canvasDiv.querySelectorAll('.primary-sync-separator').forEach(el => el.remove());
    if (!lastShowXGrid) return;

    const valuesDiv = panel.root.querySelector('.summary-table-values') as HTMLElement | null;
    if (!valuesDiv) return;
    const thead = valuesDiv.querySelector('thead') as HTMLElement | null;
    if (!thead) return;
    const topRow = thead.querySelector('.thead-row-top') as HTMLElement | null;
    const rowForPositions = topRow || (thead.querySelector('.thead-row-single') as HTMLElement | null);
    if (!rowForPositions) return;
    const groupThs = Array.from(rowForPositions.querySelectorAll('th')) as HTMLElement[];
    if (groupThs.length <= 1) return;

    const canvasRect = canvasDiv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    for (let i = 1; i < groupThs.length; i++) {
      const th = groupThs[i];
      const thRect = th.getBoundingClientRect();
      const cs = getComputedStyle(th);
      const borderLeftW = parseFloat(cs.borderLeftWidth || '0') || 0;
      const rawLeft = thRect.left - canvasRect.left;
      const targetLeft = rawLeft + (borderLeftW / 2);
      const alignedLeft = Math.round(targetLeft * dpr) / dpr;
      const sep = document.createElement('div');
      sep.className = 'primary-sync-separator';
      sep.style.left = `${alignedLeft}px`;
      sep.style.top = '0';
      sep.style.bottom = '0';
      canvasDiv.appendChild(sep);
    }
  }

  // ------------------------------
  // Box/dot rendering
  // ------------------------------

  function renderBoxes(
    panel: Panel,
    dataView: Spotfire.DataView,
    xRoot: Spotfire.DataViewHierarchyNode,
    minYValue: number,
    maxYValue: number,
    jitterWidthProp: Spotfire.ModProperty<number>,
    splitBars: Spotfire.ModProperty<boolean>,
    pointSizeProp: Spotfire.ModProperty<number>,
    pointOpacityPctProp: Spotfire.ModProperty<number>,
    useHollowDotsProp: Spotfire.ModProperty<boolean>,
    rowFilter: ((row: Spotfire.DataViewRow) => boolean) | null
  ) {
    const canvasDiv = panel.canvas;
    const summaryTableHeight = getStatsHeight(panel);
    canvasDiv.style.left = 'var(--label-col-width)';
    canvasDiv.style.right = '0px';
    canvasDiv.style.bottom = `${summaryTableHeight}px`;
    canvasDiv.style.top = '0';
    canvasDiv.style.display = 'block';
    canvasDiv.style.overflow = 'hidden';
    (canvasDiv.style as any).contain = 'paint';
    canvasDiv.onclick = (e: MouseEvent) => { /* no-op background click (compliance) */ };

    type LeafInfo = { leafNode: Spotfire.DataViewHierarchyNode, ancestry: string[] };
    const leafInfos: LeafInfo[] = [];
    (function traverse(node: Spotfire.DataViewHierarchyNode, ancestry: string[] = []) {
      const label = safeFormattedValue(node);
      const next = label && label.trim() !== '' ? [...ancestry, label] : ancestry;
      const children = node.children || [];
      if (children.length > 0) children.forEach(child => traverse(child, next));
      else leafInfos.push({ leafNode: node, ancestry: next });
    })(xRoot);

    function getHeaderLeafRects(valuesDiv: HTMLElement, canvasDiv: HTMLElement): { left: number; width: number }[] {
      const leafRow = valuesDiv.querySelector('thead .thead-row-leaf') as HTMLElement | null;
      const singleRow = valuesDiv.querySelector('thead .thead-row-single') as HTMLElement | null;
      const cells = leafRow ? (Array.from(leafRow.querySelectorAll('th.header-leaf')) as HTMLElement[]) : (singleRow ? (Array.from(singleRow.querySelectorAll('th.header-single')) as HTMLElement[]) : []);
      const canvasRect = canvasDiv.getBoundingClientRect();
      return cells.map((c) => { const r = c.getBoundingClientRect(); return { left: r.left - canvasRect.left, width: r.width }; });
    }

    const valuesDiv = panel.root.querySelector('.summary-table-values') as HTMLElement | null;
    const leafRects = valuesDiv ? getHeaderLeafRects(valuesDiv, canvasDiv) : [];
    const defaultColW = Math.max(1, Math.floor(canvasDiv.clientWidth / Math.max(1, leafInfos.length)));

    const baseMedianHeight = Math.max(1, propNum(props.medianWidth as any, 2));

    function renderBox(
      rows: Spotfire.DataViewRow[],
      minY: number,
      maxY: number,
      jitterProp: Spotfire.ModProperty<number>,
      boxW: number,
      whiskerW: number,
      medianH: number,
      baseHex: string,
      strokeHex: string,
      boxFillAlpha: number,
      boxStrokeW: number
    ) {
      const boxContainer = createDiv('box-container');
      boxContainer.style.position = 'relative';
      boxContainer.style.flex = '0 0 auto';
      boxContainer.style.width = `${boxW}px`;
      boxContainer.style.minWidth = `${boxW}px`;
      boxContainer.style.height = '100%';
      if (!rows.length) return boxContainer;

      const hasDet = rows.some(r => subjectKey(r) !== '');
      const dedupFlag = (props.countMode.value() === 'uniqueDetails') && hasDet;
      const values = getYValues(rows, dedupFlag).sort((a, b) => a - b);
      const stats = statsFromValues(values);
      const posPct = (v: number) => ((v - minY) / ((maxY - minY) || 1)) * 100;
      const iqr = stats.q3 - stats.q1;

      const whiskerColor = strokeHex;
      const capWidth = Math.max(12, Math.round(boxW * 0.65));
      const lo = stats.q1 - 1.5 * iqr;
      const hi = stats.q3 + 1.5 * iqr;
      const lowerCandidates = values.filter(v => v >= lo);
      const upperCandidates = values.filter(v => v <= hi);
      const nonOutlierMin = lowerCandidates.length ? Math.min(...lowerCandidates) : stats.q1;
      const nonOutlierMax = upperCandidates.length ? Math.max(...upperCandidates) : stats.q3;
      const lowerHeightPct = Math.max(0, posPct(stats.q1) - posPct(nonOutlierMin));
      const upperHeightPct = Math.max(0, posPct(nonOutlierMax) - posPct(stats.q3));

      const lowerWhisker = createDiv('whisker');
      lowerWhisker.style.position = 'absolute';
      lowerWhisker.style.bottom = `${posPct(nonOutlierMin)}%`;
      lowerWhisker.style.height = `${lowerHeightPct}%`;
      lowerWhisker.style.left = '50%';
      lowerWhisker.style.transform = 'translateX(-50%)';
      lowerWhisker.style.width = `${whiskerW}px`;
      lowerWhisker.style.backgroundColor = whiskerColor;
      lowerWhisker.style.zIndex = '2';
      lowerWhisker.style.pointerEvents = 'none';
      boxContainer.appendChild(lowerWhisker);

      const upperWhisker = createDiv('whisker');
      upperWhisker.style.position = 'absolute';
      upperWhisker.style.bottom = `${posPct(stats.q3)}%`;
      upperWhisker.style.height = `${upperHeightPct}%`;
      upperWhisker.style.left = '50%';
      upperWhisker.style.transform = 'translateX(-50%)';
      upperWhisker.style.width = `${whiskerW}px`;
      upperWhisker.style.backgroundColor = whiskerColor;
      upperWhisker.style.zIndex = '2';
      upperWhisker.style.pointerEvents = 'none';
      boxContainer.appendChild(upperWhisker);

      const minCap = createDiv('cap');
      minCap.style.position = 'absolute';
      minCap.style.bottom = `${lowerHeightPct === 0 ? posPct(stats.q1) : posPct(nonOutlierMin)}%`;
      minCap.style.left = `calc(50% - ${capWidth / 2}px)`;
      minCap.style.width = `${capWidth}px`;
      minCap.style.height = '1px';
      minCap.style.backgroundColor = whiskerColor;
      minCap.style.zIndex = '2';
      minCap.style.pointerEvents = 'none';
      boxContainer.appendChild(minCap);

      const maxCap = createDiv('cap');
      maxCap.style.position = 'absolute';
      maxCap.style.bottom = `${upperHeightPct === 0 ? posPct(stats.q3) : posPct(nonOutlierMax)}%`;
      maxCap.style.left = `calc(50% - ${capWidth / 2}px)`;
      maxCap.style.width = `${capWidth}px`;
      maxCap.style.height = '1px';
      maxCap.style.backgroundColor = whiskerColor;
      maxCap.style.zIndex = '2';
      maxCap.style.pointerEvents = 'none';
      boxContainer.appendChild(maxCap);

      const boxRect = createDiv('box-rect');
      boxRect.style.position = 'absolute';
      boxRect.style.bottom = `${posPct(stats.q1)}%`;
      boxRect.style.height = `${Math.max(0, posPct(stats.q3) - posPct(stats.q1))}%`;
      boxRect.style.left = '0';
      boxRect.style.width = '100%';
      boxRect.style.backgroundColor = hexToRgba(baseHex, Math.max(0, Math.min(1, 0.45)));
      boxRect.style.border = `${Math.max(1, Math.round(boxStrokeW))}px solid ${strokeHex}`;
      boxRect.style.borderRadius = '2px';
      boxRect.style.zIndex = '1';
      boxRect.style.pointerEvents = 'none';
      boxContainer.appendChild(boxRect);

      const medianLine = createDiv('median');
      medianLine.style.position = 'absolute';
      medianLine.style.bottom = `${posPct(stats.median)}%`;
      medianLine.style.left = '10%';
      medianLine.style.width = '80%';
      medianLine.style.height = `${Math.max(1, Math.round(medianH))}px`;
      medianLine.style.backgroundColor = (props.medianColor.value() as string) || '#ffffff';
      medianLine.style.zIndex = '2';
      medianLine.style.pointerEvents = 'none';
      boxContainer.appendChild(medianLine);

      const baseDotSize = Math.max(1, propNum(pointSizeProp, DEFAULT_POINT_SIZE));
      const pointAlpha = clamp(propNum(pointOpacityPctProp, DEFAULT_POINT_OPACITY) / 100, 0, 1);
      const fillBaseHex = darkenHex(baseHex, 8);
      const dotFill = hexToRgba(fillBaseHex, pointAlpha);
      const outlineHex = (props.dotBorderColor.value() as string) || darkenHex(baseHex, 28);
      const outlineColor = hexToRgba(outlineHex, 0.40);
      const borderWidthPx = (window.devicePixelRatio || 1) >= 2 ? 0.5 : 1;
      const outlierOutlineHex = (props.outlierBorderColor.value() as string) || '#d32f2f';
      const outlierOutlineColor = hexToRgba(outlierOutlineHex, 0.75);
      const dotSizePx = Math.max(1, Math.round(baseDotSize));
      const jitterPxBase = propNum(jitterProp, 0);
      const jitterPx = Math.round(jitterPxBase * (0.4 + 0.6 * clamp(boxW / 34, 0.12, 1)));

      rows.forEach((row: Spotfire.DataViewRow) => {
        const yValue = row.continuous('Y').value();
        if (typeof yValue !== 'number' || !Number.isFinite(yValue)) return;
        const isOutlier = (yValue < stats.q1 - 1.5 * iqr) || (yValue > stats.q3 + 1.5 * iqr);
        const jitterOffset = jitterPx > 0 ? (Math.random() - 0.5) * jitterPx : 0;
        const px = isOutlier ? Math.max(3, Math.round(dotSizePx * 1.25)) : dotSizePx;

        if (isOutlier) {
          const cross = createDiv('outlier-cross');
          cross.style.position = 'absolute';
          cross.style.bottom = `${posPct(yValue)}%`;
          cross.style.left = `calc(50% + ${jitterOffset}px)`;
          cross.style.transform = 'translateX(-50%)';
          cross.style.zIndex = '8';
          cross.style.width = `${px}px`;
          cross.style.height = `${px}px`;
          cross.style.pointerEvents = 'auto';
          const lineThickness = Math.max(1, Math.round(px * 0.28));
          const diagLen = Math.max(3, Math.round(px * 1.2));
          const l1 = document.createElement('div');
          l1.className = 'outlier-cross-line';
          l1.style.position = 'absolute';
          l1.style.left = '50%';
          l1.style.top = '50%';
          l1.style.width = `${diagLen}px`;
          l1.style.height = `${lineThickness}px`;
          l1.style.backgroundColor = outlierOutlineColor;
          l1.style.transformOrigin = 'center center';
          l1.style.transform = 'translate(-50%, -50%) rotate(45deg)';
          const l2 = document.createElement('div');
          l2.className = 'outlier-cross-line';
          l2.style.position = 'absolute';
          l2.style.left = '50%';
          l2.style.top = '50%';
          l2.style.width = `${diagLen}px`;
          l2.style.height = `${lineThickness}px`;
          l2.style.backgroundColor = outlierOutlineColor;
          l2.style.transformOrigin = 'center center';
          l2.style.transform = 'translate(-50%, -50%) rotate(-45deg)';
          cross.appendChild(l1);
          cross.appendChild(l2);
          cross.onmouseover = () => mod.controls.tooltip.show(row);
          cross.onmouseout = () => mod.controls.tooltip.hide();
          cross.onclick = (e: MouseEvent) => { e.stopPropagation(); const mode: Spotfire.MarkingOperation = (e as any).ctrlKey ? 'Toggle' : 'Replace'; (row as any).mark?.(mode); };
          boxContainer.appendChild(cross);
        } else {
          const dot = createDiv('dot');
          dot.style.position = 'absolute';
          dot.style.bottom = `${posPct(yValue)}%`;
          dot.style.left = `calc(50% + ${jitterOffset}px)`;
          dot.style.transform = 'translateX(-50%)';
          dot.style.zIndex = '7';
          dot.style.borderRadius = '50%';
          dot.style.width = `${px}px`;
          dot.style.height = `${px}px`;
          if (useHollowDotsProp.value()) {
            dot.style.backgroundColor = hexToRgba('#ffffff', Math.max(0.10, pointAlpha));
            dot.style.border = `${borderWidthPx}px solid ${outlineColor}`;
          } else {
            dot.style.backgroundColor = dotFill;
            dot.style.border = `${borderWidthPx}px solid ${outlineColor}`;
          }
          dot.onmouseover = () => mod.controls.tooltip.show(row);
          dot.onmouseout = () => mod.controls.tooltip.hide();
          dot.onclick = (e: MouseEvent) => { e.stopPropagation(); const mode: Spotfire.MarkingOperation = (e as any).ctrlKey ? 'Toggle' : 'Replace'; (row as any).mark?.(mode); };
          boxContainer.appendChild(dot);
        }
      });
      return boxContainer;
    }

    const groupCountByPrimary: Record<string, number> = {};
    leafInfos.forEach(li => {
      const primary = li.ancestry[0] || '';
      groupCountByPrimary[primary] = (groupCountByPrimary[primary] || 0) + 1;
    });

    leafInfos.forEach((info, i) => {
      const rect = leafRects[i] || { left: i * defaultColW, width: defaultColW };
      const columnWidthPx = rect.width;
      const col = document.createElement('div');
      col.className = 'plot-col';
      col.dataset.index = String(i);
      col.style.position = 'absolute';
      col.style.left = `${rect.left}px`;
      col.style.width = `${columnWidthPx}px`;
      col.style.top = '0';
      col.style.bottom = '0';
      col.style.height = '100%';
      col.style.zIndex = '2';
      col.style.overflow = 'hidden';

      const hasSecondaryLocal = leafInfos.some(li => (li.ancestry?.length || 0) >= 2);
      if (hasSecondaryLocal && splitBars.value()) {
        const currPrimary = info.ancestry[0] || '';
        const prevPrimary = i > 0 ? (leafInfos[i - 1].ancestry[0] || '') : null;
        const nextPrimary = i < leafInfos.length - 1 ? (leafInfos[i + 1].ancestry[0] || '') : null;
        if (i > 0 && currPrimary !== prevPrimary) col.classList.add('main-split-left');
        if (i < leafInfos.length - 1 && currPrimary !== nextPrimary) col.classList.add('main-split-right');
      }

      const configuredBoxW = Math.max(1, propNum(props.boxWidth as any, 34));
      const primaryKey = info.ancestry[0] || '';
      const groupCount = groupCountByPrimary[primaryKey] || 1;
      function widthFactorLocal(columnW: number, groupCnt: number) { let f = 0.82; if (groupCnt >= 6) f = 0.66; if (groupCnt >= 8) f = 0.60; if (groupCnt >= 10) f = 0.54; if (groupCnt >= 12) f = 0.50; if (groupCnt >= 14) f = 0.46; if (columnW < 46) f -= 0.06; return Math.max(0.34, f); }
      const factor = widthFactorLocal(columnWidthPx, groupCount);
      const isGroupFirst = (i === 0) || (primaryKey !== (leafInfos[i - 1]?.ancestry[0] || ''));
      const isGroupLast = (i === leafInfos.length - 1) || (primaryKey !== (leafInfos[i + 1]?.ancestry[0] || ''));
      const boundaryGuardPx = (isGroupFirst || isGroupLast) ? (columnWidthPx * 0.10) : (columnWidthPx * 0.04);
      const usableColumnW = Math.max(6, columnWidthPx - 2 * boundaryGuardPx);
      const dynamicW = usableColumnW * factor;
      const MIN_BOX_W = 1;
      const boxWidthPx = Math.min(configuredBoxW, Math.max(MIN_BOX_W, dynamicW));
      const rowsAll = info.leafNode.rows();
      const rows = rowFilter ? rowsAll.filter(r => rowFilter(r)) : rowsAll;
      const baseHex = rows[0]?.color()?.hexCode || '#597EA7';
      const strokeHex = darkenHex(baseHex, 16);

      const slot = document.createElement('div');
      slot.style.position = 'absolute';
      const leftCentered = (columnWidthPx - boxWidthPx) / 2;
      const minLeft = boundaryGuardPx;
      const maxLeft = columnWidthPx - boxWidthPx - boundaryGuardPx;
      const clampedLeft = Math.max(minLeft, Math.min(leftCentered, maxLeft));
      slot.style.left = `${clampedLeft}px`;
      slot.style.bottom = '0';
      slot.style.top = '0';
      slot.style.width = `${boxWidthPx}px`;
      slot.style.height = '100%';

      slot.appendChild(
        renderBox(
          rows,
          minYValue,
          maxYValue,
          jitterWidthProp,
          boxWidthPx,
          Math.max(1, Math.round(1)),
          Math.max(1, Math.round(baseMedianHeight)),
          baseHex,
          strokeHex,
          0.45,
          Math.max(1, Math.round(propNum(props.boxStrokeWidth as any, 1)))
        )
      );
      col.appendChild(slot);
      panel.canvas.appendChild(col);
    });
  }

  // ------------------------------
  // Significance annotation rendering
  // ------------------------------

  type AnnoConfig = { mode: string; test: string; padj: string; pairsCsv: string; alpha: number; starMode: string; fontPx: number; linePx: number; topPadPct: number; anchorLabel?: string; anchorIndex?: number };

  function renderAnnotations(
    panel: Panel,
    xRoot: Spotfire.DataViewHierarchyNode,
    rowFilter: ((row: Spotfire.DataViewRow) => boolean) | null,
    cfg: AnnoConfig
  ) {
    try {
      panel.canvas.querySelectorAll('.annotation-layer').forEach(el => el.remove());
      if (!cfg || cfg.mode === 'off') return;

      const layer = document.createElement('div');
      layer.className = 'annotation-layer';
      Object.assign(layer.style, { position: 'absolute', left: '0', right: '0', top: '0', bottom: '0', pointerEvents: 'none', zIndex: '9' });
      panel.canvas.appendChild(layer);

      const cols = Array.from(panel.canvas.querySelectorAll('.plot-col')) as HTMLElement[];
      if (!cols.length) return;
      const baseRect = panel.canvas.getBoundingClientRect();
      const centers = cols.map(c => { const r = c.getBoundingClientRect(); return { cx: (r.left + r.right) / 2 - baseRect.left }; });

      const leafNodes: Spotfire.DataViewHierarchyNode[] = [];
      (function t(n: Spotfire.DataViewHierarchyNode) { const ch = n.children || []; if (ch.length) ch.forEach(t); else leafNodes.push(n); })(xRoot);
      const wantUnique = (props.countMode.value() === 'uniqueDetails');
      const groupsY: number[][] = leafNodes.map(leaf => {
        const rowsAll = leaf.rows();
        const rows = rowFilter ? rowsAll.filter(r => rowFilter(r)) : rowsAll;
        const dedup = wantUnique && hasDetails(rows);
        return getYValues(rows, dedup);
      });

      const valuesDiv = panel.root.querySelector('.summary-table-values') as HTMLElement | null;
      const thead = valuesDiv?.querySelector('thead') as HTMLElement | null;
      const leafRow = thead?.querySelector('.thead-row-leaf') as HTMLElement | null;
      const singleRow = thead?.querySelector('.thead-row-single') as HTMLElement | null;
      const leafThs = leafRow ? Array.from(leafRow.querySelectorAll('th')) as HTMLElement[] : (singleRow ? Array.from(singleRow.querySelectorAll('th')) as HTMLElement[] : []);
      const labels = leafThs.map(th => (th.textContent || ''));

      const n = centers.length;
      const modeLC = (cfg.mode || 'off').toLowerCase();
      const pairsToDisplay: [number, number][] = [];
      if (modeLC === 'adjacent') { for (let i = 0; i < n - 1; i++) pairsToDisplay.push([i, i + 1]); }
      else if (modeLC === 'anchor') {
        let refIdx = -1;
        if (cfg.anchorLabel) refIdx = labels.findIndex(l => (l || '').trim() === String(cfg.anchorLabel || '').trim());
        if (refIdx < 0) { const idx = Math.max(1, Math.min(n, Number(cfg.anchorIndex || 1))); refIdx = idx - 1; }
        if (refIdx >= 0 && refIdx < n) { for (let j = 0; j < n; j++) if (j !== refIdx) pairsToDisplay.push([Math.min(refIdx, j), Math.max(refIdx, j)]); }
      } else if (modeLC === 'custompairs' || modeLC === 'manual') {
        const map: Record<string, number> = {};
        labels.forEach((lab, idx) => map[(lab || '').trim()] = idx);
        (cfg.pairsCsv || '').split(',').map(s => s.trim()).filter(Boolean).forEach(tok => {
          if (tok.includes('~')) {
            const [a, b] = tok.split('~').map(x => x.trim());
            if (a in map && b in map) { const i = map[a], j = map[b]; if (i !== j) pairsToDisplay.push([Math.min(i, j), Math.max(i, j)]); }
          } else if (tok.includes('-')) {
            const [ai, bi] = tok.split('-').map(x => parseInt(x.trim(), 10));
            const i = (ai | 0) - 1, j = (bi | 0) - 1;
            if (i >= 0 && j >= 0 && i < n && j < n && i !== j) pairsToDisplay.push([Math.min(i, j), Math.max(i, j)]);
          }
        });
      } else if (modeLC === 'global') {
        // handled later
      }

      const DBL_EPS = Number.EPSILON || 2.220446049250313e-16;
      function welfordStats(x: number[]): { n: number; mean: number; M2: number } { let n = 0, mean = 0, M2 = 0; for (const v of x) { n++; const d = v - mean; mean += d / n; M2 += d * (v - mean); } return { n, mean, M2 }; }
      const varUnbiasedR = (x: number[]) => { const s = welfordStats(x); return (s.n > 1) ? (s.M2 / (s.n - 1)) : NaN; };
      function erf(x: number): number { const sign = x >= 0 ? 1 : -1; const ax = Math.abs(x); const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911; const t = 1 / (1 + p * ax); const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax); return sign * y; }
      function normalCdf(z: number): number { return 0.5 * (1 + erf(z / Math.SQRT2)); }
      function logGamma(z: number): number { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z); z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i); const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); }
      function betacf(a: number, b: number, x: number): number { const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300; let qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d; for (let m = 1; m <= MAXIT; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c; aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1.0) < EPS) break; } return h; }
      function incompleteBetaReg(x: number, a: number, b: number): number { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)); if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a; return 1 - bt * betacf(b, a, 1 - x) / b; }
      function ptR(t: number, df: number, lowerTail = true): number { if (!Number.isFinite(df) || df > 1e7) { const p = normalCdf(t); return lowerTail ? p : (1 - p); } if (!Number.isFinite(t) || df <= 0) return NaN; const x = df / (df + t * t); const a = df / 2, b = 0.5; const I = incompleteBetaReg(x, a, b); let p: number; if (t >= 0) p = 1 - 0.5 * I; else p = 0.5 * I; return lowerTail ? p : (1 - p); }
      function welchDF_R(x: number[], y: number[]): number { const nx = x.length, ny = y.length; const vx = varUnbiasedR(x); const vy = varUnbiasedR(y); if (!Number.isFinite(vx) || !Number.isFinite(vy)) return NaN; const s2x = vx / nx; const s2y = vy / ny; const num = (s2x + s2y) * (s2x + s2y); const den = (s2x * s2x) / (nx - 1) + (s2y * s2y) / (ny - 1); if (!(den > 0)) return Infinity; return num / den; }
      function rWelchTwoSampleP(x: number[], y: number[], mu = 0): number { const nx = x.length, ny = y.length; if (nx < 2 || ny < 2) return NaN; const sx = welfordStats(x), sy = welfordStats(y); const vx = (sx.n > 1 ? sx.M2 / (sx.n - 1) : NaN), vy = (sy.n > 1 ? sy.M2 / (sy.n - 1) : NaN); if (!Number.isFinite(vx) || !Number.isFinite(vy)) return NaN; const s2x = vx / nx, s2y = vy / ny; const se2 = s2x + s2y; const diff = (sx.mean - sy.mean - mu); const tol = 10 * DBL_EPS * Math.max(1, Math.abs(sx.mean), Math.abs(sy.mean)); if (se2 <= 0 || !Number.isFinite(se2)) { if (Math.abs(diff) <= tol) return 1; else return 0; } const se = Math.sqrt(se2); const tstat = diff / se; const df = welchDF_R(x, y); const p = 2 * ptR(-Math.abs(tstat), df, true); return Math.min(1, Math.max(0, p)); }
      function pfLowerR(F: number, d1: number, d2: number): number { if (!Number.isFinite(F) || F < 0 || d1 <= 0 || d2 <= 0) return NaN; const x = (d1 * F) / (d1 * F + d2); return incompleteBetaReg(x, d1 / 2, d2 / 2); }
      function anovaAOV_R(groups: number[][]): { F: number, p: number, df1: number, df2: number } { const gs = groups.map(g => g.filter(v => Number.isFinite(v))).filter(g => g.length > 0); const k = gs.length; const ns = gs.map(g => g.length); const N = ns.reduce((s, n) => s + n, 0); if (k < 2 || N <= k) return { F: NaN, p: NaN, df1: k - 1, df2: N - k }; const stats = gs.map(g => welfordStats(g)); const means = stats.map(s => s.mean); const grand = means.reduce((s, m, i) => s + m * ns[i], 0) / N; let SSB = 0, SSW = 0; for (let i = 0; i < k; i++) { SSB += ns[i] * (means[i] - grand) ** 2; SSW += stats[i].M2; } const df1 = k - 1; const df2 = N - k; if (df2 <= 0) return { F: NaN, p: NaN, df1, df2 }; const MSB = SSB / df1; const MSW = SSW / df2; if (!(MSW > 0)) { if (SSB > 0) return { F: Infinity, p: 0, df1, df2 }; return { F: NaN, p: 1, df1, df2 }; } const F = MSB / MSW; const pLower = pfLowerR(F, df1, df2); const p = (Number.isFinite(pLower) ? (1 - pLower) : NaN); return { F, p, df1, df2 }; }
      function mannWhitneyP(x: number[], y: number[]): number {
        const nx = x.length, ny = y.length;
        const N = nx + ny;
        if (nx < 1 || ny < 1) return NaN;
        const all: { v: number; g: number }[] = [];
        x.forEach(v => { if (Number.isFinite(v)) all.push({ v, g: 0 }); });
        y.forEach(v => { if (Number.isFinite(v)) all.push({ v, g: 1 }); });
        if (all.length !== N) return NaN;
        all.sort((a, b) => a.v - b.v);
        const ranks: number[] = new Array(N);
        let tieSum = 0;
        for (let i = 0; i < N;) {
          let j = i;
          while (j < N && all[j].v === all[i].v) j++;
          const r = (i + 1 + j) / 2;
          for (let k = i; k < j; k++) ranks[k] = r;
          const t = j - i;
          if (t > 1) tieSum += (t * t * t - t);
          i = j;
        }
        let W = 0;
        for (let k = 0; k < N; k++) if (all[k].g === 0) W += ranks[k];
        const muW = (nx * (N + 1)) / 2;
        const varW = (nx * ny / 12) * ((N + 1) - (tieSum / (N * (N - 1))));
        if (!(varW > 0)) {
          const tol = 10 * (Number.EPSILON || 2.22e-16) * Math.max(1, Math.abs(muW));
          return Math.abs(W - muW) <= tol ? 1 : 0;
        }
        const cc = 0.5;
        const z = (W - muW - Math.sign(W - muW) * cc) / Math.sqrt(varW);
        const p = 2 * (1 - normalCdf(Math.abs(z)));
        return Math.max(0, Math.min(1, p));
      }
      function pairP(i: number, j: number): number {
        const x = (groupsY[i] || []).filter(v => Number.isFinite(v));
        const y = (groupsY[j] || []).filter(v => Number.isFinite(v));
        const choice = cfg.test;
        if (choice === 'auto' || choice === 'mannwhitney') return mannWhitneyP(x, y);
        if (choice === 't') return rWelchTwoSampleP(x, y, 0);
        if (choice === 'anova') { const res = anovaAOV_R([x, y]); return res.p; }
        if (choice === 'kruskal') { const res = kruskalWallis([x, y]); return res.p; }
        return mannWhitneyP(x, y);
      }
      function kruskalWallis(groups: number[][]): { H: number, p: number, corr: number } {
        const all: { v: number; g: number }[] = [];
        groups.forEach((g, gi) => g.forEach(v => all.push({ v, g: gi })));
        const N = all.length;
        if (!N) return { H: 0, p: 1, corr: 1 };
        all.sort((a, b) => a.v - b.v);
        let ranks: number[] = new Array(N);
        let i = 0, tie = 0;
        while (i < N) {
          let j = i;
          while (j < N && all[j].v === all[i].v) j++;
          const r = (i + 1 + j) / 2;
          for (let k = i; k < j; k++) ranks[k] = r;
          const t = j - i;
          if (t > 1) tie += (t * t * t - t);
          i = j;
        }
        const Rk = new Array(groups.length).fill(0), nk = new Array(groups.length).fill(0);
        for (let idx = 0; idx < N; idx++) { const g = all[idx].g; Rk[g] += ranks[idx]; nk[g] += 1; }
        const H = (12 / (N * (N + 1))) * Rk.reduce((s, R, gi) => s + (R * R) / Math.max(1, nk[gi]), 0) - 3 * (N + 1);
        const C = 1 - tie / (N * N * N - N);
        const Hc = H / C;
        const p = 1 - (function chiCdf(x: number, k: number) { return lowerRegGamma(k / 2, x / 2); })(Hc, groups.length - 1);
        return { H: Hc, p, corr: C };
      }
      function lowerRegGamma(s: number, x: number): number { const EPS = 1e-12; let sum = 1 / s, term = 1 / s; for (let n = 1; n < 100; n++) { term *= x / (s + n); sum += term; if (term < sum * EPS) break; } return Math.exp(-x + s * Math.log(x) - logGamma(s)) * sum; }

      const allPairs: [number, number][] = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) allPairs.push([i, j]);
      const familyRaw = allPairs.map(([i, j]) => {
        const x = (groupsY[i] || []).filter(v => Number.isFinite(v));
        const y = (groupsY[j] || []).filter(v => Number.isFinite(v));
        const choice = cfg.test;
        if (choice === 'auto' || choice === 'mannwhitney') return mannWhitneyP(x, y);
        if (choice === 't') return rWelchTwoSampleP(x, y, 0);
        if (choice === 'anova') { const res = anovaAOV_R([x, y]); return res.p; }
        if (choice === 'kruskal') { const res = kruskalWallis([x, y]); return res.p; }
        return mannWhitneyP(x, y);
      });
      const familyAdj = (cfg.padj === 'bh') ? pAdjustBHKeepNA(familyRaw) : familyRaw.slice();
      const key = (i: number, j: number) => `${i}|${j}`;
      const adjMap = new Map<string, number>();
      allPairs.forEach(([i, j], idx) => adjMap.set(key(i, j), familyAdj[idx]));

      type PairRes = { i: number; j: number; pAdj: number; label: string };
      const pairResults: PairRes[] = [];
      for (const [i, j] of pairsToDisplay) {
        const pAdj = adjMap.get(key(i, j));
        pairResults.push({ i, j, pAdj: (typeof pAdj === 'number' ? pAdj : NaN), label: '' });
      }

      let globalLabel: string | null = null;
      let globalSpan: { left: number; right: number } | null = null;
      if (modeLC === 'global' && centers.length >= 2) {
        let pGlobal = NaN;
        if (cfg.test === 'auto' || cfg.test === 'kruskal') pGlobal = kruskalWallis(groupsY).p;
        else if (cfg.test === 'anova') pGlobal = anovaAOV_R(groupsY).p;
        else pGlobal = kruskalWallis(groupsY).p;
        globalLabel = formatAnnoLabel(pGlobal, cfg);
        globalSpan = { left: centers[0].cx, right: centers[centers.length - 1].cx };
      }

      type Bracket = { leftX: number; rightX: number; label: string; level?: number };
      const brackets: Bracket[] = [];
      for (const pr of pairResults) {
        if (!isFinite(pr.pAdj)) continue;
        const lbl = formatAnnoLabel(pr.pAdj, cfg);
        brackets.push({ leftX: centers[pr.i].cx, rightX: centers[pr.j].cx, label: lbl });
      }
      if (globalLabel && globalSpan) brackets.push({ leftX: globalSpan.left, rightX: globalSpan.right, label: globalLabel });

      brackets.sort((a, b) => (a.rightX - a.leftX) - (b.rightX - b.leftX) || (a.leftX - b.leftX));
      const levels: { spans: { l: number; r: number }[] }[] = [];
      const intersects = (l1: number, r1: number, l2: number, r2: number) => !(r1 <= l2 || r2 <= l1);
      const placeLevel = (b: Bracket) => {
        for (let li = 0; li < levels.length; li++) {
          if (!levels[li].spans.some(s => intersects(s.l, s.r, b.leftX, b.rightX))) {
            levels[li].spans.push({ l: b.leftX, r: b.rightX });
            return li;
          }
        }
        levels.push({ spans: [{ l: b.leftX, r: b.rightX }] });
        return levels.length - 1;
      };
      for (const b of brackets) b.level = placeLevel(b);

      let minCenter = Infinity;
      for (let i = 0; i < centers.length - 1; i++) minCenter = Math.min(minCenter, centers[i + 1].cx - centers[i].cx);
      if (!Number.isFinite(minCenter)) minCenter = 60;
      const desiredGapPx = Math.max(8, Math.min(18, Math.round(minCenter * 0.10)));
      const byLevel = new Map<number, Bracket[]>();
      brackets.forEach(b => { const lv = b.level || 0; if (!byLevel.has(lv)) byLevel.set(lv, []); byLevel.get(lv)!.push(b); });
      for (const arr of byLevel.values()) {
        arr.sort((a, b) => a.leftX - b.leftX);
        for (let k = 1; k < arr.length; k++) {
          const prev = arr[k - 1], curr = arr[k];
          const dist = curr.leftX - prev.rightX;
          if (dist < desiredGapPx) {
            const need = desiredGapPx - Math.max(dist, 0);
            const prevSpan = Math.max(1, prev.rightX - prev.leftX), currSpan = Math.max(1, curr.rightX - curr.leftX);
            const dPrev = Math.min(need / 2, prevSpan * 0.20), dCurr = Math.min(need / 2, currSpan * 0.20);
            prev.rightX = Math.max(prev.leftX + 1, prev.rightX - dPrev);
            curr.leftX = Math.min(curr.rightX - 1, curr.leftX + dCurr);
          }
        }
      }

      const H = panel.canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const baseTop = Math.max(6, Math.min(H - 6, Math.round((cfg.topPadPct / 100) * H)));
      const levelGap = Math.max(16, cfg.fontPx + 10);
      const tickH = Math.max(8, Math.round(cfg.fontPx * 0.9));
      const LABEL_GAP_PX = 6;
      const totalLevels = levels.length;
      for (const b of brackets) {
        const yTop = Math.round((baseTop + (totalLevels - 1 - (b.level || 0)) * levelGap) * dpr) / dpr;
        drawBracket(b.leftX, b.rightX, yTop, tickH, cfg.linePx);
        drawLabel((b.leftX + b.rightX) / 2, yTop - LABEL_GAP_PX - cfg.fontPx, cfg.fontPx, b.label);
      }

      function drawBracket(x1: number, x2: number, yTop: number, tickH: number, strokeW: number) {
        const dpr = window.devicePixelRatio || 1;
        const snap = (v: number) => Math.round(v * dpr) / dpr;
        const sx1 = snap(x1), sx2 = snap(x2), sy = snap(yTop);
        const spanW = Math.max(1, sx2 - sx1);
        const pad = 2;
        const half = (strokeW % 2) ? 0.5 : 0;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(spanW + 2 * pad));
        svg.setAttribute('height', String(tickH + 2 * pad));
        svg.style.position = 'absolute';
        svg.style.left = `${sx1 - pad}px`;
        svg.style.top = `${sy - pad}px`;
        svg.style.pointerEvents = 'none';
        svg.style.overflow = 'visible';
        const L = pad + half, R = pad + spanW - half, T = pad + half, B = pad + tickH - half;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${L} ${B} V ${T} H ${R} V ${B}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#222');
        path.setAttribute('stroke-width', String(strokeW));
        path.setAttribute('stroke-linecap', 'square');
        path.setAttribute('stroke-linejoin', 'miter');
        path.setAttribute('shape-rendering', 'crispEdges');
        svg.appendChild(path);
        layer.appendChild(svg);
      }
      function drawLabel(cx: number, y: number, fontPx: number, text: string) {
        const el = document.createElement('div');
        el.className = 'anno-label';
        Object.assign(el.style, {
          position: 'absolute', left: `${cx}px`, top: `${y}px`, transform: 'translateX(-50%)',
          fontSize: `${fontPx}px`, color: '#222', fontWeight: '700', pointerEvents: 'auto',
          background: 'rgba(255,255,255,0.9)', padding: '0 3px', borderRadius: '2px'
        });
        el.textContent = text;
        layer.appendChild(el);
      }
      function formatAnnoLabel(p: number, cfg: AnnoConfig): string {
        if (!isFinite(p)) return 'ns';
        const stars = pToStars(p, cfg.alpha);
        const pTxt = `p = ${formatP(p)}`;
        if (cfg.starMode === 'pvalue') return pTxt;
        if (cfg.starMode === 'both') return `${stars} (${pTxt})`;
        return stars;
      }
      function pToStars(p: number, a: number) {
        if (p >= a) return 'ns';
        if (p < 1e-4) return '****';
        if (p < 1e-3) return '***';
        if (p < 1e-2) return '**';
        return '*';
      }
      function formatP(p: number) {
        if (p < 1e-4) return '< 1e-4';
        return p.toFixed(p < 1e-3 ? 4 : 3);
      }
    } catch { /* swallow */ }
  }
});