console.log('🎨 Design page loaded');

// ── Hardscape / Mulch coverage table (SF per ton at stated depth) ─────────────
const HARDSCAPE_COVERAGE = {
    'Colorado Rose 1.5"':         85,    // avg 80–90 SF/ton at 2"
    'Horizon Cobblestone 2–4"':   70,    // avg 65–75
    'Local River 1.5"':           85,
    'Mountain Granite 3/4"':      95,    // avg 90–100
    'Rainbow Cobblestone 2–4"':   70,
    'White Cobblestone 2–4"':     70,
    'White Cobblestone 4–8"':     52.5,  // avg 45–60
    'Second Harvest Brown Mulch': 130,   // avg 120–140 SF/ton at 3"
    'Second Harvest Black Mulch': 130,
    'Second Harvest Red Mulch':   130,
};

// Returns SF-per-pixel² based on Claude's analysis OR the manual area input
// Cache natural image dimensions — updated when the canvas image loads
let _imgNatW = 0, _imgNatH = 0;
function _cacheImgDims() {
    const img = document.getElementById('canvasImage');
    if (img && img.naturalWidth) {
        _imgNatW = img.naturalWidth;
        _imgNatH = img.naturalHeight;
        console.log('[SF] Cached image dims:', _imgNatW, 'x', _imgNatH);
        updateMaterialsList();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const img = document.getElementById('canvasImage');
    if (img) { img.addEventListener('load', _cacheImgDims); _cacheImgDims(); }
});

function getSqFtScale() {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) { console.warn('[SF] designCanvas not found'); return null; }

    const analysis = window.GarDIYStorage?.getAnalysis();
    const natW = analysis?.imageNaturalWidth  || _imgNatW;
    const natH = analysis?.imageNaturalHeight || _imgNatH;

    // ── Calibration always wins (most accurate — user provided real measurement) ──
    const calibScale = analysis?.calibrationSqFtPerNaturalPx2;
    if (calibScale && natW && natH) {
        const displayScale = Math.min(canvas.offsetWidth / natW, canvas.offsetHeight / natH);
        const sf = calibScale / (displayScale * displayScale);
        console.log('[SF] using calibration:', calibScale.toExponential(4), '→ SF/dispPx²:', sf.toExponential(4));
        return sf;
    }

    // Manual override always wins
    const manualInput = document.getElementById('manualAreaInput');
    const manualVal   = manualInput ? parseFloat(manualInput.value) : NaN;
    if (!isNaN(manualVal) && manualVal > 0) {
        // manualVal is the GROUND area — convert to frame SF using groundFraction
        const gf = parseFloat(analysis?.groundFraction) || 0;
        const frameSF = (gf > 0 && gf <= 1) ? manualVal / gf : manualVal;
        const natW = analysis?.imageNaturalWidth  || _imgNatW;
        const natH = analysis?.imageNaturalHeight || _imgNatH;
        if (natW && natH) {
            const s = Math.min(canvas.offsetWidth / natW, canvas.offsetHeight / natH);
            const areaPx = (natW * s) * (natH * s);
            console.log('[SF] manual override:', manualVal, 'SF | gf:', gf, '| frameSF:', frameSF.toFixed(1), '| scale:', (frameSF / areaPx).toExponential(4));
            return frameSF / areaPx;
        }
        return frameSF / (canvas.offsetWidth * canvas.offsetHeight);
    }

    // ── Primary path: backend-computed sqFtPerNaturalPx2 ─────────────────────
    // sqFtPerNaturalPx2 = totalFrameSqFt / (imageNaturalWidth × imageNaturalHeight)
    // Computed once at analysis time — no race conditions, no letterbox ambiguity.
    const sqFtPerNaturalPx2 = analysis?.sqFtPerNaturalPx2;

    if (sqFtPerNaturalPx2 && natW && natH) {
        // Items are measured in display pixels. Convert: 1 display px = 1/displayScale natural px
        const displayScale = Math.min(canvas.offsetWidth / natW, canvas.offsetHeight / natH);
        const scaleFactor  = sqFtPerNaturalPx2 / (displayScale * displayScale);
        console.log('[SF] using sqFtPerNaturalPx2:', sqFtPerNaturalPx2.toExponential(4),
                    '| displayScale:', displayScale.toFixed(4), '| → SF/dispPx²:', scaleFactor.toExponential(4));
        return scaleFactor;
    }

    // ── Fallback: use totalFrameSqFt / displayed photo area ──────────────────
    const claudeFrame  = analysis?.totalFrameSqFt ? parseFloat(analysis.totalFrameSqFt) : NaN;
    const claudeGround = analysis?.squareFeet && analysis.squareFeet !== '—'
                       ? parseFloat(analysis.squareFeet) : NaN;
    const frameForScale = !isNaN(claudeFrame) && claudeFrame > 0 ? claudeFrame
                        : !isNaN(claudeGround) && claudeGround > 0 ? claudeGround
                        : NaN;

    if (isNaN(frameForScale)) { console.warn('[SF] No area data — enter it in the materials panel'); return null; }

    const areaPx = (natW && natH)
        ? (() => { const s = Math.min(canvas.offsetWidth / natW, canvas.offsetHeight / natH); return (natW * s) * (natH * s); })()
        : canvas.offsetWidth * canvas.offsetHeight;

    console.log('[SF] fallback frameForScale:', frameForScale, '| areaPx:', Math.round(areaPx));
    return frameForScale / areaPx;
}

// Shoelace formula — polygon area in pixels²
function polygonAreaPx(points) {
    let area = 0, n = points.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

// Returns sq ft covered by a placed item (null if no scale available)
function getItemSqFt(placedItem) {
    const scale = getSqFtScale();
    if (!scale) return null;
    const el = placedItem.element;
    if (el.dataset.polyPoints) {
        const pts    = JSON.parse(el.dataset.polyPoints);
        const areaPx = pts.length >= 3 ? polygonAreaPx(pts) : 0;
        const sqFt   = areaPx * scale;
        console.log(`[SF] "${placedItem.name}" polyPoints(${pts.length}) areaPx=${areaPx.toFixed(0)} → ${sqFt.toFixed(1)} sqFt`);
        return pts.length >= 3 ? sqFt : null;
    }
    const w = parseFloat(el.style.width)  || el.offsetWidth;
    const h = parseFloat(el.style.height) || el.offsetHeight;

    if (isPathItem(placedItem.name, placedItem.category)) {
        const ratio = parseFloat(el.dataset.coloredRatio ?? '1');
        const sqFt  = w * h * ratio * scale;
        console.log(`[SF] path "${placedItem.name}" ${w}×${h}px coloredRatio=${ratio.toFixed(3)} → ${sqFt.toFixed(1)} sqFt`);
        return sqFt;
    }

    const sqFt = w * h * scale;
    console.log(`[SF] "${placedItem.name}" rect ${w}×${h}px → ${sqFt.toFixed(1)} sqFt`);
    return sqFt;
}

// ── Calibration tool ─────────────────────────────────────────────────────────
let _calibMode = false;
let _calibPts  = [];
let _calibDotEls = [];

function setupCalibration() {
    const startBtn  = document.getElementById('startCalibBtn');
    const panel     = document.getElementById('calibPanel');
    const step1     = document.getElementById('calibStep1');
    const step2     = document.getElementById('calibStep2');
    const step3     = document.getElementById('calibStep3');
    const applyBtn  = document.getElementById('applyCalibBtn');
    const cancelBtn = document.getElementById('cancelCalibBtn');
    const preset    = document.getElementById('calibPreset');
    const feetInput = document.getElementById('calibFeetInput');
    if (!startBtn) return;

    startBtn.addEventListener('click', () => {
        _calibMode = true;
        _calibPts  = [];
        _clearCalibDots();
        panel.style.display = 'block';
        step1.style.display = 'block';
        step2.style.display = 'none';
        step3.style.display = 'none';
        document.getElementById('calibActive').style.display = 'none';
        startBtn.textContent = '📏 Calibrating… (click photo)';
        startBtn.style.background = '#fef3c7';
    });

    preset.addEventListener('change', () => {
        if (preset.value) feetInput.value = preset.value;
    });

    applyBtn.addEventListener('click', () => {
        const feet = parseFloat(feetInput.value);
        if (!feet || feet <= 0) { alert('Enter a valid distance in feet'); return; }
        _applyCalibration(feet);
        panel.style.display = 'block';
        step1.style.display = 'none';
        step2.style.display = 'none';
        step3.style.display = 'none';
        document.getElementById('calibActive').style.display = 'block';
        startBtn.textContent = '📏 Re-Calibrate Scale';
        startBtn.style.background = '#f0fdf4';
        _calibMode = false;
    });

    cancelBtn.addEventListener('click', _cancelCalib);
}

function _cancelCalib() {
    _calibMode = false;
    _calibPts  = [];
    _clearCalibDots();
    const panel = document.getElementById('calibPanel');
    if (panel) panel.style.display = 'none';
    const btn = document.getElementById('startCalibBtn');
    if (btn) { btn.textContent = '📏 Calibrate Scale from Known Distance'; btn.style.background = '#fff'; }
}

function _clearCalibDots() {
    _calibDotEls.forEach(el => el.remove());
    _calibDotEls = [];
    const line = document.getElementById('_calibLine');
    if (line) line.remove();
}

function handleCalibCanvasClick(e) {
    if (!_calibMode) return false;
    const canvas = document.getElementById('designCanvas');
    const rect   = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Draw dot
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;width:10px;height:10px;background:#f59e0b;border:2px solid #fff;
        border-radius:50%;left:${x - 5}px;top:${y - 5}px;z-index:9999;pointer-events:none;`;
    canvas.appendChild(dot);
    _calibDotEls.push(dot);
    _calibPts.push({ x, y });

    if (_calibPts.length === 1) {
        document.getElementById('calibStep1').style.display = 'none';
        document.getElementById('calibStep2').style.display = 'block';
    } else if (_calibPts.length === 2) {
        // Draw line between points
        const [p1, p2] = _calibPts;
        const len  = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const ang  = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        const line = document.createElement('div');
        line.id = '_calibLine';
        line.style.cssText = `position:absolute;height:2px;background:#f59e0b;
            left:${p1.x}px;top:${p1.y}px;width:${len}px;
            transform-origin:0 50%;transform:rotate(${ang}deg);z-index:9998;pointer-events:none;`;
        canvas.appendChild(line);
        _calibDotEls.push(line);

        document.getElementById('calibStep2').style.display = 'none';
        document.getElementById('calibStep3').style.display = 'block';
    }
    return true;
}

function _applyCalibration(feet) {
    const [p1, p2] = _calibPts;
    const displayDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (displayDist < 5) { alert('Points too close together — try again'); return; }

    const analysis  = window.GarDIYStorage?.getAnalysis() || {};
    const natW = analysis.imageNaturalWidth  || _imgNatW;
    const natH = analysis.imageNaturalHeight || _imgNatH;
    const canvas = document.getElementById('designCanvas');

    let sqFtPerNatPx2;
    if (natW && natH) {
        const displayScale = Math.min(canvas.offsetWidth / natW, canvas.offsetHeight / natH);
        const naturalDist  = displayDist / displayScale;
        const natPxPerFt   = naturalDist / feet;
        sqFtPerNatPx2 = 1 / (natPxPerFt * natPxPerFt);
    } else {
        // Fallback: use display pixels directly
        const displayPxPerFt = displayDist / feet;
        sqFtPerNatPx2 = 1 / (displayPxPerFt * displayPxPerFt);
    }

    analysis.calibrationSqFtPerNaturalPx2 = sqFtPerNatPx2;
    analysis.calibrationFeet = feet;
    window.GarDIYStorage.saveAnalysis(analysis);

    console.log(`[Calib] ${feet} ft = ${displayDist.toFixed(1)} display px → sqFtPerNatPx2=${sqFtPerNatPx2.toExponential(4)}`);
    updateMaterialsList();
}

// Bricks per sq ft by product name — add entries here as new products are defined
const BRICK_PATH_DENSITY = {
    'brick path':  4.5,
    'brick paver': 4.5,
    'stone pathway': 4.5,
    'wood chips path': 0, // coverage-based, not brick-count
};

function getBricksPerSqFt(name) {
    const n = (name || '').toLowerCase();
    for (const [key, val] of Object.entries(BRICK_PATH_DENSITY)) {
        if (n.includes(key)) return val;
    }
    return 4.5; // default: 4.5 bricks per sq ft
}

// Returns brick count info for a placed brick-path item
// Fill mode: uses shoelace polygon area; stroke mode: uses getTotalLength
function getBrickPathInfo(placedItem) {
    const el    = placedItem.element;
    const scale = getSqFtScale();

    if (el.dataset.pathFill === 'true') {
        // Freehand drawn area — calculate from polygon
        const points = JSON.parse(el.dataset.pathPoints || '[]');
        if (points.length < 3) return null;
        if (!scale) return { noScale: true };
        const areaPx        = polygonAreaPx(points);
        if (areaPx < 1) return null;
        const areaInSqFt    = areaPx * scale;
        const bricksPerSqFt = getBricksPerSqFt(placedItem.name);
        const wasteFactor   = 1 + pathWastePct / 100;
        const brickCount    = Math.ceil(areaInSqFt * bricksPerSqFt * wasteFactor);
        return { areaInSqFt, bricksPerSqFt, brickCount, cost: brickCount * placedItem.price, noScale: false };
    }

    // Legacy stroke mode — measure path length × width
    const svgEl  = el.querySelector('svg.path-svg');
    const pathEl = svgEl?.querySelector('path[data-measure]') || svgEl?.querySelector('path');
    if (!pathEl) return null;
    const pixelLength   = pathEl.getTotalLength();
    const pathWidthPx   = parseInt(el.dataset.pathWidth || 40);
    if (!scale) return { pixelLength, pathWidthPx, noScale: true };
    const areaInSqFt    = pixelLength * pathWidthPx * scale;
    const bricksPerSqFt = getBricksPerSqFt(placedItem.name);
    const wasteFactor   = 1 + pathWastePct / 100;
    const brickCount    = Math.ceil(areaInSqFt * bricksPerSqFt * wasteFactor);
    return { pixelLength, pathWidthPx, areaInSqFt, bricksPerSqFt, brickCount, cost: brickCount * placedItem.price, noScale: false };
}

// Keyword-based coverage lookup — handles typos, truncation, any naming variation
function getCoverageRate(name) {
    // Exact match first
    if (HARDSCAPE_COVERAGE[name] !== undefined) return HARDSCAPE_COVERAGE[name];

    const n = name.toLowerCase().replace(/[""''–—]/g, ' ').replace(/\s+/g, ' ').trim();

    // Mulch — check before cobblestone so "harvest" keywords win
    if (n.includes('mulch') || n.includes('harvest')) {
        if (n.includes('brown')) { console.log(`[SF] keyword match "${name}" → Brown Mulch 130`); return 130; }
        if (n.includes('black')) { console.log(`[SF] keyword match "${name}" → Black Mulch 130`); return 130; }
        if (n.includes('red'))   { console.log(`[SF] keyword match "${name}" → Red Mulch 130`);   return 130; }
        console.log(`[SF] keyword match "${name}" → Mulch (generic) 130`); return 130;
    }

    // Cobblestone / Cbblestone variants — size matters
    if (n.includes('cobble') || n.includes('cbble') || n.includes('coblestone')) {
        if (n.includes('4') && (n.includes('8') || n.includes('- 8'))) {
            console.log(`[SF] keyword match "${name}" → Cobblestone 4-8" 52.5`); return 52.5;
        }
        console.log(`[SF] keyword match "${name}" → Cobblestone 2-4" 70`); return 70;
    }

    // Specific stone types
    if (n.includes('colorado') || n.includes('rose')) {
        console.log(`[SF] keyword match "${name}" → Colorado Rose 85`); return 85;
    }
    if (n.includes('river')) {
        console.log(`[SF] keyword match "${name}" → River Rock 85`); return 85;
    }
    if (n.includes('granite')) {
        console.log(`[SF] keyword match "${name}" → Granite 95`); return 95;
    }
    if (n.includes('rainbow')) {
        console.log(`[SF] keyword match "${name}" → Rainbow Cobblestone 70`); return 70;
    }
    if (n.includes('white') && (n.includes('cobble') || n.includes('stone'))) {
        if (n.includes('4') && n.includes('8')) {
            console.log(`[SF] keyword match "${name}" → White Cobblestone 4-8" 52.5`); return 52.5;
        }
        console.log(`[SF] keyword match "${name}" → White Cobblestone 2-4" 70`); return 70;
    }

    console.log(`[SF] no coverage match for "${name}"`);
    return undefined;
}

// ── Global state ──────────────────────────────────────────────────────────────
const BACKEND = 'https://gardiy-backend-production.up.railway.app';

// Cloud project state
let activeProjectId   = localStorage.getItem('gardiyActiveProject')     || null;
let activeProjectName = localStorage.getItem('gardiyActiveProjectName') || 'My Project';
let cloudSaveTimer    = null;
let isSharedView      = false; // true when page opened via ?share= link

// Waste percentage for paths/pavers (user-editable, persisted)
let pathWastePct = Math.max(0, Math.min(50, parseInt(localStorage.getItem('gardiyPathWaste') || '10')));

let placedItems    = [];
let selectedItem   = null;
let controlPanel   = null;
let itemIdCounter  = 0;
let isRotating     = false;
let rotationCenter = { x: 0, y: 0 };

// ── Undo / Redo ───────────────────────────────────────────────────────────────
const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 50;

function pushHistory() {
    if (!placedItems.length && !undoStack.length) return;
    undoStack.push(getCanvasState());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoBtns();
}

async function undoAction() {
    if (!undoStack.length) return;
    redoStack.push(getCanvasState());
    await _applyHistoryState(undoStack.pop());
    updateUndoRedoBtns();
}

async function redoAction() {
    if (!redoStack.length) return;
    undoStack.push(getCanvasState());
    await _applyHistoryState(redoStack.pop());
    updateUndoRedoBtns();
}

// Fast restore for undo/redo — uses productRegistry (already loaded, no network).
// Avoids the getProducts() + getItemPrices() network calls that restoreCanvasFromState makes.
async function _applyHistoryState(canvasStateJson) {
    const byName = {};
    Object.values(productRegistry).forEach(p => { byName[p.name] = p; });

    const data = JSON.parse(canvasStateJson);
    deselectItem();
    [...placedItems].forEach(pi => pi.element.remove());
    placedItems = [];

    const canvas = document.getElementById('designCanvas');
    const cW = canvas?.offsetWidth  || 800;
    const cH = canvas?.offsetHeight || 600;
    const sX = cW / (data.canvasW || cW);
    const sY = cH / (data.canvasH || cH);

    for (const d of data.items) {
        const product = byName[d.name];
        if (!product) continue;

        const x = d.xPct !== undefined ? Math.round(d.xPct * cW) : Math.round((d.x || 0) * sX);
        const y = d.yPct !== undefined ? Math.round(d.yPct * cH) : Math.round((d.y || 0) * sY);
        const w = d.wPct !== undefined ? Math.round(d.wPct * cW) : Math.round((d.width  || 80) * sX);
        const h = d.hPct !== undefined ? Math.round(d.hPct * cH) : Math.round((d.height || 80) * sY);

        await addItemToCanvas({ ...product, _skipHistory: true, _price: d.price ?? product.price ?? 0 }, x, y);
        const item = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
        if (!item) continue;

        item.style.left      = x + 'px';
        item.style.top       = y + 'px';
        item.style.width     = w + 'px';
        item.style.height    = h + 'px';
        item.dataset.rotation = d.rotation || 0;
        item.style.transform = `rotate(${d.rotation || 0}deg)`;
        item.style.zIndex    = d.zIndex || 1;

        if (d.polyPtsFrac || d.polyPoints) {
            const pts = d.polyPtsFrac
                ? d.polyPtsFrac.map(p => ({ id: p.id, x: Math.round(p.xF * cW), y: Math.round(p.yF * cH) }))
                : JSON.parse(d.polyPoints).map(p => ({ ...p, x: Math.round(p.x * sX), y: Math.round(p.y * sY) }));
            item.dataset.polyPoints = JSON.stringify(pts);
            applyPolyShape(item);
        }

        if (d.pathPoints) {
            const pts = d.pathPtsFrac
                ? d.pathPtsFrac.map(p => ({ id: p.id, x: Math.round(p.xF * cW), y: Math.round(p.yF * cH) }))
                : JSON.parse(d.pathPoints).map(p => ({ ...p, x: Math.round(p.x * sX), y: Math.round(p.y * sY) }));
            item.dataset.pathPoints = JSON.stringify(pts);
            const pw = d.pathWidthPct !== undefined
                ? Math.round(d.pathWidthPct * cW)
                : Math.round(parseInt(d.pathWidth || 40) * sX);
            item.dataset.pathWidth = pw;
            if (d.pathFill) item.dataset.pathFill = d.pathFill;
            applyPathShape(item);
        }

        if (d.borderRadius !== undefined) {
            item.dataset.borderRadius = d.borderRadius;
            item.style.borderRadius   = d.borderRadius + 'px';
        }
    }

    updateMaterialsList();
    saveDesign();
}

function updateUndoRedoBtns() {
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
}

// Polygon dots (grass / hardscapes)
let polyDots          = [];
let isDraggingPolyDot = false;
let draggedPolyDot    = null;
let polyDotIdCounter  = 0;

// Path dots (paths category)
let meshDots      = [];
let isDraggingDot = false;
let draggedDot    = null;
let dotIdCounter  = 0;

// Corner resize handles (regular items)
let cornerHandles = [];

// Freehand path drawing mode
let drawingMode       = false;
let drawingProduct    = null;
let drawingPoints     = [];
let isMouseDownDraw   = false;
let drawingOverlay    = null;
let drawingPreviewSvg = null;

// ── Product filter state (per category) ───────────────────────────────────────
const categoryProductsMap = {};  // { catKey: [products] }
const categoryFilterState = {};  // { catKey: { sort: 'default'|'asc'|'desc', color: '' } }

const COLOR_PATTERNS = {
    yellow: /yellow|golden|gold|sunflower|marigold/i,
    red:    /red|rose|scarlet|crimson|coral/i,
    white:  /white|ivory|cream|snow/i,
    blue:   /blue|indigo|cornflower|bluebell/i,
    purple: /purple|lavender|violet|lilac/i,
};

function productMatchesColor(p, color) {
    const pattern = COLOR_PATTERNS[color] || new RegExp(color, 'i');
    return pattern.test(p.color || '') || pattern.test(p.name || '');
}

function parseHeightMin(h) {
    const m = (h || '').match(/(\d+)/);
    return m ? parseInt(m[1]) : 9999;
}

function buildProductItemsHTML(products, esc) {
    if (!products.length) return '<div class="filter-no-results">No products match this filter.</div>';
    return products.map(p => {
        const thumb = p.type === 'image'
            ? `<img src="${esc(p.imageUrl || p.image)}" style="width:40px;height:40px;object-fit:contain;border-radius:8px;">`
            : `<span style="font-size:32px;">${esc(p.image)}</span>`;
        const infoBtn = p.notes
            ? `<button class="product-info-btn" data-pid="${p._pid}" title="Plant info" aria-label="Plant info">?</button>`
            : '';
        return `<div class="product-item" data-pid="${p._pid}">
            ${thumb}
            <div class="product-info">
                <div class="product-name">${esc(p.name)}${sunBadgeHTML(p.name, p.category, p.sun)}</div>
                <div class="product-price">$${p.price}</div>
            </div>
            ${infoBtn}
        </div>`;
    }).join('');
}

function applyProductFilter(catKey) {
    const state = categoryFilterState[catKey] || { sort: 'default', color: '' };
    let prods = [...(categoryProductsMap[catKey] || [])];
    if (state.color) prods = prods.filter(p => productMatchesColor(p, state.color));
    if (state.sort === 'asc')         prods.sort((a, b) => a.price - b.price);
    else if (state.sort === 'desc')   prods.sort((a, b) => b.price - a.price);
    else if (state.sort === 'h_asc')  prods.sort((a, b) => parseHeightMin(a.height) - parseHeightMin(b.height));
    else if (state.sort === 'h_desc') prods.sort((a, b) => parseHeightMin(b.height) - parseHeightMin(a.height));
    const listEl = document.querySelector(`.category-product-list[data-category="${catKey}"]`);
    if (!listEl) return;
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    listEl.innerHTML = buildProductItemsHTML(prods, esc);
    applyPlantRecommendationColors();
}

function setupCategoryFilters() {
    const sidebar = document.querySelector('.design-sidebar');
    if (!sidebar) return;
    sidebar.addEventListener('click', e => {
        const sortBtn  = e.target.closest('.filter-sort-btn');
        const colorBtn = e.target.closest('.filter-color-btn, .filter-color-all');
        if (!sortBtn && !colorBtn) return;
        e.stopPropagation();
        const btn    = sortBtn || colorBtn;
        const catKey = btn.dataset.cat;
        if (!catKey || !categoryFilterState[catKey]) return;
        if (sortBtn) {
            categoryFilterState[catKey].sort = sortBtn.dataset.sort;
            sortBtn.closest('.filter-sort-row').querySelectorAll('.filter-sort-btn')
                .forEach(b => b.classList.toggle('active', b === sortBtn));
        } else {
            categoryFilterState[catKey].color = colorBtn.dataset.color;
            colorBtn.closest('.filter-color-row').querySelectorAll('.filter-color-btn, .filter-color-all')
                .forEach(b => b.classList.toggle('active', b === colorBtn));
        }
        applyProductFilter(catKey);
    });
}

// ── Product notes popup ───────────────────────────────────────────────────────
function showProductNotes(product, anchorEl) {
    let popup = document.getElementById('productNotesPopup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'productNotesPopup';
        popup.className = 'product-notes-popup';
        document.body.appendChild(popup);
        document.addEventListener('click', e => {
            if (!e.target.closest('.product-notes-popup') && !e.target.closest('.product-info-btn')) {
                popup.style.display = 'none';
            }
        }, true);
    }
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const details = [
        product.height ? `<div><strong>Height:</strong> ${esc(product.height)}</div>` : '',
        product.spread ? `<div><strong>Spread:</strong> ${esc(product.spread)}</div>` : '',
        product.sun    ? `<div><strong>Sun:</strong> ${esc(product.sun)}</div>`        : '',
        product.color  ? `<div><strong>Color:</strong> ${esc(product.color)}</div>`   : '',
    ].filter(Boolean).join('');
    popup.innerHTML = `
        <div class="pnp-header">${esc(product.name)}</div>
        ${details ? `<div class="pnp-details">${details}</div>` : ''}
        ${product.notes ? `<div class="pnp-notes">${esc(product.notes)}</div>` : ''}
    `;
    const rect = anchorEl.getBoundingClientRect();
    popup.style.display = 'block';
    const pw = popup.offsetWidth;
    let left = rect.right + 8;
    if (left + pw > window.innerWidth - 8) left = rect.left - pw - 8;
    popup.style.left = Math.max(8, left) + 'px';
    popup.style.top  = Math.max(8, rect.top) + 'px';
}

document.addEventListener('click', e => {
    const btn = e.target.closest('.product-info-btn');
    if (!btn) return;
    e.stopPropagation();
    const pid = btn.dataset.pid;
    const product = productRegistry[pid];
    if (product) showProductNotes(product, btn);
});

// ── Mock products ─────────────────────────────────────────────────────────────
function getMockProducts() {
    return [
        { id: 1,  name: 'Stone Pathway',   category: 'paths',      type: 'emoji', image: '🛤️', price: 150  },
        { id: 2,  name: 'Wood Chips Path', category: 'paths',      type: 'emoji', image: '🟤', price: 120  },
        { id: 3,  name: 'Brick Path',      category: 'paths',      type: 'emoji', image: '🧱', price: 200  },
        { id: 4,  name: 'Kentucky Bluegrass', category: 'grass', type: 'image', image: 'images/texture-grass-hd.jpg', imageUrl: 'images/texture-grass-hd.jpg', price: 0.50 },
        { id: 5,  name: 'Grass Field',     category: 'grass',      type: 'emoji', image: '🌾', price: 0.40 },
        { id: 6,  name: 'Small Shrub',      category: 'shrubs',     type: 'emoji', image: '🌱', price: 25   },
        { id: 7,  name: 'Potted Shrub',    category: 'shrubs',     type: 'emoji', image: '🪴', price: 45   },
        { id: 8,  name: 'Cactus',          category: 'shrubs',     type: 'emoji', image: '🌵', price: 35   },
        { id: 9,  name: 'Tree',            category: 'trees',      type: 'emoji', image: '🌳', price: 150  },
        { id: 10, name: 'Palm Tree',       category: 'trees',      type: 'emoji', image: '🌴', price: 200  },
        { id: 11, name: 'Deciduous Tree',  category: 'trees',      type: 'emoji', image: '🌲', price: 180  },
        { id: 12, name: 'Rose',            category: 'flowers',    type: 'emoji', image: '🌹', price: 20   },
        { id: 13, name: 'Sunflower',       category: 'flowers',    type: 'emoji', image: '🌻', price: 25   },
        { id: 14, name: 'Tulip',           category: 'flowers',    type: 'emoji', image: '🌷', price: 18   },
        { id: 15, name: 'Cherry Blossom',  category: 'flowers',    type: 'emoji', image: '🌸', price: 30   },
        { id: 50, name: 'Pink Petunia',    category: 'flowers',    type: 'image', image: 'images/pink-petunia.png', imageUrl: 'images/pink-petunia.png', price: 15   },
        { id: 16, name: 'Bench',                category: 'furniture',    type: 'emoji', image: '🪑', price: 200   },
        { id: 17, name: 'Table',                category: 'furniture',    type: 'emoji', image: '🛋️', price: 300   },
        { id: 18, name: 'Fountain',             category: 'furniture',    type: 'emoji', image: '⛲', price: 500   },
        { id: 19, name: 'Concrete Paver',       category: 'rocks_pavers', type: 'emoji', image: '⬜', price: 6.00  },
        { id: 20, name: 'Brick Paver',          category: 'rocks_pavers', type: 'emoji', image: '🧱', price: 7.50  },
        { id: 21, name: 'Natural Stone Paver',  category: 'rocks_pavers', type: 'emoji', image: '🪨', price: 12.00 },
        { id: 22, name: 'Flagstone',            category: 'rocks_pavers', type: 'emoji', image: '🟫', price: 8.00  },
        { id: 23, name: 'Pea Gravel',           category: 'rocks_pavers', type: 'emoji', image: '⚫', price: 2.50  },
        { id: 24, name: 'Decomposed Granite',   category: 'rocks_pavers', type: 'emoji', image: '🟡', price: 2.00  },
        { id: 25, name: 'Colorado Rose 1.5"',     category: 'rocks_pavers', type: 'image', image: 'images/colorado-rose.jpg',       imageUrl: 'images/colorado-rose.jpg',       price: 100.00 },
        { id: 26, name: 'Horizon Cobblestone 2-4"', category: 'rocks_pavers', type: 'image', image: 'images/horizon-cobblestone.jpg', imageUrl: 'images/horizon-cobblestone.jpg', price: 110.00 },
    ];
}

function supplementWithMockProducts(products) {
    const existingCategories = new Set(products.map(p => (p.category || '').toLowerCase()));
    const missing = getMockProducts().filter(p => !existingCategories.has((p.category || '').toLowerCase()));
    return missing.length ? [...products, ...missing] : products;
}

async function getProducts() {
    if (window.ProductAPI && window.MigrationHelper) {
        try {
            const connected = await MigrationHelper.checkConnection();
            if (connected) {
                const result = await ProductAPI.getAll();
                const products = Array.isArray(result) ? result
                    : (result?.products && Array.isArray(result.products)) ? result.products
                    : (result?.data    && Array.isArray(result.data))     ? result.data
                    : null;
                if (products?.length) return supplementWithMockProducts(products);
            }
        } catch (e) { console.warn('Backend unavailable, using fallback'); }
    }
    const stored = localStorage.getItem('gardiyProducts');
    if (stored) { try { return supplementWithMockProducts(JSON.parse(stored)); } catch (e) {} }
    return getMockProducts();
}

async function getItemPrices() {
    const products = await getProducts();
    const map = {};
    products.forEach(p => map[p.name] = p.price);
    return map;
}

// ── Sun exposure requirements ────────────────────────────────────────────────
// Returns 'full_sun', 'shade', or 'both' for plants/flowers/trees; null for other categories.
const PLANT_CATEGORIES = new Set(['shrubs', 'trees', 'flowers']);

function getSunRequirement(name, category) {
    if (!PLANT_CATEGORIES.has((category || '').toLowerCase())) return null;
    const n = (name || '').toLowerCase();

    // ── Specific product matches ──────────────────────────────────────────────
    // Full sun
    const fullSun = [
        'austrian pine','bonna pine','colorado sprauce','columnar norway sprauce',
        'compact gem bosnian pine','crab spring snow','fastigiata spruce',
        'fat albert spruce 910','ginko b, sky tower','limber pine',
        'malus perfect purple',"malus 'prairfire'",'maple autumn blaze',
        'picea pungens glauca baby blue 400','pinyon pine','prairie gold aspen',
        'tannenbaum mugo pine','woodward columnar juniper',
        'asclepias tuberosa','bloomerang dark purple','dianthus',
        'little lady lilac','sombrero lemon yellow coneflower','purple pasque flower',
        'kentucky blur grass',
    ];
    if (fullSun.some(k => n.includes(k) || k.includes(n.replace(/\s+\d+$/,'')))) return 'full_sun';

    // Partial sun / both
    const partialSun = [
        'accolade elm','well\'s deer run oriental spruce',
        'geum tempp orange','juliana jane boxwood shrub 85',
        'starstruck amsonia','big leaf hydrangea eclipse',
        'dream cloud reblooming hydrangea','strawberry sundae panicle hydrangea',
    ];
    if (partialSun.some(k => n.includes(k) || k.includes(n))) return 'both';

    // ── Generic keyword fallbacks ────────────────────────────────────────────
    if (/cactus|sunflower|palm|lavender|sage|sedum|yucca|pine|spruce|juniper|aspen/.test(n)) return 'full_sun';
    if (/rose/.test(n) && !/primrose/.test(n))   return 'full_sun';
    if (/hydrangea|lilac|amsonia|boxwood/.test(n)) return 'both';
    if (/fern|hosta|impatiens|astilbe|begonia|caladium|shade/.test(n)) return 'shade';

    return 'both';
}

function sunBadgeHTML(name, category, sunField) {
    let req;
    if (sunField) {
        const s = (sunField || '').toLowerCase();
        if (s.includes('full sun') && s.includes('partial')) req = 'both';
        else if (s.includes('full sun')) req = 'full_sun';
        else if (s.includes('partial') || s.includes('shade')) req = 'both';
        else req = getSunRequirement(name, category);
    } else {
        req = getSunRequirement(name, category);
    }
    if (!req) return '';
    if (req === 'full_sun') return `<svg class="sun-badge" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" title="Full sun" aria-label="Full sun"><path fill="#FFAC33" d="M16 2h4v5h-4zm0 27h4v5h-4zM2 16h5v4H2zm27 0h5v4h-5zM6.1 6.1l2.8-2.8 3.5 3.5-2.8 2.8zm17.4 17.4l2.8-2.8 3.5 3.5-2.8 2.8zm-17.4 0l3.5-3.5-2.8-2.8-3.5 3.5zm17.4-17.4l3.5-3.5-2.8-2.8-3.5 3.5z"/><circle fill="#FFAC33" cx="18" cy="18" r="10"/><circle fill="#FFD983" cx="18" cy="18" r="7"/></svg>`;
    if (req === 'both')     return `<svg class="sun-badge" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" title="Partial sun" aria-label="Partial sun"><circle fill="#FFAC33" cx="12" cy="12" r="9"/><circle fill="#FFD983" cx="12" cy="12" r="6"/><path fill="#CCD6DD" d="M26 28H13A8 8 0 0 1 13 12a8 8 0 0 1 3 .6A10 10 0 0 1 34 22a6 6 0 0 1-6 6z"/></svg>`;
    if (req === 'shade')    return `<svg class="sun-badge" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" title="Shade" aria-label="Shade"><path fill="#CCD6DD" d="M30 23a7 7 0 0 0-7-7c-.4 0-.9 0-1.3.1A6 6 0 0 0 7 18a6 6 0 0 0 0 12h22a5 5 0 0 0 5-5z"/><path fill="#E1E8ED" d="M23 18a6 6 0 0 1 5.9 5A5 5 0 0 1 24 33H10a6 6 0 0 1-1-11.9A7 7 0 0 1 23 18z"/></svg>`;
    return '';
}

// ── Category helpers ──────────────────────────────────────────────────────────
function isGrassItem(n, c)       { return (c||'').toLowerCase() === 'grass'; }
function isHardscapeItem(n, c)   { return (c||'').toLowerCase() === 'hardscapes'; }
function isRocksPaversItem(n, c) { return (c||'').toLowerCase() === 'rocks_pavers'; }
function isMeshItem(n, c)        { return isGrassItem(n, c) || isHardscapeItem(n, c); }
function isMulchItem(n)          { const s = (n||'').toLowerCase(); return s.includes('mulch') || (s.includes('harvest') && !s.includes('cobblestone')); }
// ── Ramer-Douglas-Peucker path simplification ────────────────────────────────
function _perpDist(pt, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(pt.x - a.x, pt.y - a.y);
    return Math.abs(dx * (a.y - pt.y) - (a.x - pt.x) * dy) / len;
}
function rdpSimplify(pts, epsilon) {
    if (pts.length < 3) return pts;
    let maxD = 0, maxI = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = _perpDist(pts[i], pts[0], pts[pts.length - 1]);
        if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > epsilon) {
        const L = rdpSimplify(pts.slice(0, maxI + 1), epsilon);
        const R = rdpSimplify(pts.slice(maxI), epsilon);
        return [...L.slice(0, -1), ...R];
    }
    return [pts[0], pts[pts.length - 1]];
}

function isPathItem(n, c) {
    return (c||'').toLowerCase() === 'paths' ||
        ['path','pathway','walkway'].some(k => (n||'').toLowerCase().includes(k));
}
function isBrickPath(n, c) {
    return (c||'').toLowerCase() === 'paths' && (n||'').toLowerCase().includes('brick');
}

// ── DOM ready ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    checkUserStatus();
    await loadProductCategories();
    applyPlantRecommendationColors();

    const savedImage = window.GarDIYStorage?.getImage();
    const canvasImage = document.getElementById('canvasImage');
    const canvasHint  = document.getElementById('canvasHint');
    if (savedImage && canvasImage) {
        canvasImage.src = savedImage;
        if (canvasHint) canvasHint.style.display = 'none';
    }

    setupCategoryButtons();
    setupCategoryFilters();
    setupCanvasClick();
    setupCalibration();
    setupCheckoutButtons();
    setupProjectButtons();
    updateProjectNameDisplay();

    const shareToken = new URLSearchParams(window.location.search).get('share');
    if (shareToken) {
        await enterSharedViewMode(shareToken);
    } else {
        const cloudLoaded = await autoLoadLastProject();
        if (!cloudLoaded) loadSavedDesign();
    }

    // Pre-fill area input from Claude analysis, wire up live recalc
    const areaInput = document.getElementById('manualAreaInput');
    if (areaInput) {
        const analysis = window.GarDIYStorage?.getAnalysis();
        const claudeSF = analysis?.squareFeet && analysis.squareFeet !== '—' ? parseFloat(analysis.squareFeet) : null;
        if (claudeSF) { areaInput.value = claudeSF; console.log('[SF] Pre-filled area from Claude:', claudeSF, 'sq ft'); }
        areaInput.addEventListener('input', () => { console.log('[SF] Manual area changed to:', areaInput.value); updateMaterialsList(); });
    }

    // Waste % input — user-editable, persisted in localStorage
    const wasteInput = document.getElementById('wasteInput');
    if (wasteInput) {
        wasteInput.value = pathWastePct;
        wasteInput.addEventListener('input', () => {
            pathWastePct = Math.max(0, Math.min(50, parseInt(wasteInput.value) || 0));
            localStorage.setItem('gardiyPathWaste', pathWastePct);
            updateMaterialsList();
        });
    }

    // ── Global mousemove: freehand drawing + poly/path dot drag ──
    document.addEventListener('mousemove', e => {
        const canvas = document.getElementById('designCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Freehand path drawing
        if (drawingMode && isMouseDownDraw) {
            const last = drawingPoints[drawingPoints.length - 1];
            if (!last || Math.hypot(mx - last.x, my - last.y) > 4) {
                drawingPoints.push({ x: mx, y: my });
                _updateDrawingPreview();
            }
            return;
        }

        // Poly dot drag (grass / hardscapes)
        if (isDraggingPolyDot && draggedPolyDot && selectedItem) {
            draggedPolyDot.style.left = mx + 'px';
            draggedPolyDot.style.top  = my + 'px';
            const dotId = parseInt(draggedPolyDot.dataset.dotId);
            const points = JSON.parse(selectedItem.dataset.polyPoints || '[]');
            const idx = points.findIndex(p => p.id === dotId);
            if (idx !== -1) {
                points[idx].x = mx;
                points[idx].y = my;
                selectedItem.dataset.polyPoints = JSON.stringify(points);
                applyPolyShape(selectedItem);
                updateControlPanelPosition(selectedItem);
            }
        }

        // Path dot drag
        if (isDraggingDot && draggedDot && selectedItem) {
            draggedDot.style.left = mx + 'px';
            draggedDot.style.top  = my + 'px';
            const dotId = parseInt(draggedDot.dataset.dotId);
            const points = JSON.parse(selectedItem.dataset.pathPoints || '[]');
            const idx = points.findIndex(p => p.id === dotId);
            if (idx !== -1) {
                points[idx].x = mx;
                points[idx].y = my;
                selectedItem.dataset.pathPoints = JSON.stringify(points);
                applyPathShape(selectedItem);
            }
        }
    });

    document.addEventListener('mouseup', async () => {
        // Finish freehand path drawing
        if (drawingMode && isMouseDownDraw) {
            isMouseDownDraw = false;
            if (drawingPreviewSvg) { drawingPreviewSvg.remove(); drawingPreviewSvg = null; }
            if (drawingPoints.length >= 5) {
                const simplified = rdpSimplify(drawingPoints, 10);
                if (simplified.length >= 2) await _finishDrawingPath(simplified);
            }
            exitPathDrawingMode();
            return;
        }
        if (isDraggingPolyDot || isDraggingDot) { updateMaterialsList(); saveDesign(); }
        isDraggingPolyDot = false; draggedPolyDot = null;
        isDraggingDot     = false; draggedDot     = null;
    });

    // Undo / Redo keyboard shortcuts
    document.addEventListener('keydown', async e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault(); await undoAction();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault(); await redoAction();
        }
    });

    updateUndoRedoBtns();
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
// Keyed by numeric index matching data-pid attribute — avoids putting large
// base64 strings or unescaped quotes into HTML data attributes.
const productRegistry = {};

async function loadProductCategories() {
    // Show loading skeleton immediately so sidebar isn't blank while fetching
    const sidebarEarly = document.querySelector('.design-sidebar');
    if (sidebarEarly) sidebarEarly.innerHTML = '<h3>🎨 Products</h3><p style="padding:1rem;color:#6b7280;font-style:italic;">Loading products…</p>';

    const products = await getProducts();
    if (!products.length) {
        const sb = document.querySelector('.design-sidebar');
        if (sb) sb.innerHTML = '<h3>🎨 Products</h3><p style="padding:1rem;color:#ef4444;">No products found.</p>';
        return;
    }

    // Build registry so click handler can look up full product data by index
    products.forEach((p, i) => { productRegistry[i] = p; });

    const categories = {
        paths:        { name: 'Paths',           icon: '🚶', iconImg: 'images/categories/paths.png',     products: [] },
        grass:        { name: 'Grass',           icon: '🌿', iconImg: 'images/categories/grass.png',     products: [] },
        hardscapes:   { name: 'Hardscapes',      icon: '🛻', iconImg: 'images/categories/hardscape.png', products: [] },
        rocks_pavers: { name: 'Rocks & Pavers',  icon: '🪨', iconImg: 'images/categories/rocks.png',     products: [] },
        shrubs:       { name: 'Shrubs',          icon: '🌱', iconImg: 'images/categories/plants.png',    products: [] },
        trees:        { name: 'Trees',           icon: '🌳', iconImg: 'images/categories/trees.png',     products: [] },
        flowers:      { name: 'Flowers',         icon: '🌸', iconImg: 'images/categories/flowers.png',   products: [] },
        furniture:    { name: 'Furniture',       icon: '🪑', iconImg: 'images/categories/furniture.png', products: [] },
    };

    products.forEach((p, i) => {
        if (categories[p.category]) categories[p.category].products.push({ ...p, _pid: i });
    });

    // Populate filter maps
    Object.keys(categories).forEach(key => {
        categoryProductsMap[key] = categories[key].products;
        categoryFilterState[key] = { sort: 'default', color: '' };
    });

    const sidebar = document.querySelector('.design-sidebar');
    if (!sidebar) return;

    const esc = s => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const PLANT_CATS = new Set(['shrubs', 'trees', 'flowers']);
    const filterBarHTML = key => `
        <div class="category-filter-bar">
            <div class="filter-sort-row">
                <button class="filter-sort-btn active" data-sort="default" data-cat="${key}">Default</button>
                <button class="filter-sort-btn" data-sort="asc"  data-cat="${key}">↑ $ Low</button>
                <button class="filter-sort-btn" data-sort="desc" data-cat="${key}">↓ $ High</button>
                ${PLANT_CATS.has(key) ? `<button class="filter-sort-btn" data-sort="h_asc"  data-cat="${key}">↑ Short</button><button class="filter-sort-btn" data-sort="h_desc" data-cat="${key}">↓ Tall</button>` : ''}
            </div>
            <div class="filter-color-row">
                <button class="filter-color-all active" data-color="" data-cat="${key}">All</button>
                <button class="filter-color-btn" data-color="yellow" data-cat="${key}" title="Yellow" style="background:#fbbf24;"></button>
                <button class="filter-color-btn" data-color="red"    data-cat="${key}" title="Red"    style="background:#ef4444;"></button>
                <button class="filter-color-btn" data-color="white"  data-cat="${key}" title="White"  style="background:#f1f5f9;border:1.5px solid #cbd5e1;"></button>
                <button class="filter-color-btn" data-color="blue"   data-cat="${key}" title="Blue"   style="background:#3b82f6;"></button>
                <button class="filter-color-btn" data-color="purple" data-cat="${key}" title="Purple" style="background:#8b5cf6;"></button>
            </div>
        </div>`;

    let html = `<h3>🎨 Products</h3>
    <div class="category-list">`;
    Object.keys(categories).forEach(key => {
        const cat = categories[key];
        const iconHtml = cat.iconImg
            ? `<img src="${cat.iconImg}" class="category-icon-img" alt="${cat.name}">`
            : `<span class="category-icon">${cat.icon}</span>`;

        if (key === 'furniture') {
            html += `<div class="category-section" data-category="${key}">
                <button class="category-btn">
                    ${iconHtml}
                    <span>${cat.name}</span>
                    <span class="expand-icon">▼</span>
                </button>
                <div class="category-items" style="display:none;">
                    <div style="padding:1rem;text-align:center;color:#9ca3af;font-style:italic;font-size:0.9rem;">Coming Soon</div>
                </div>
            </div>`;
            return;
        }
        if (!cat.products.length) return;
        html += `<div class="category-section" data-category="${key}">
            <button class="category-btn">
                ${iconHtml}
                <span>${cat.name}</span>
                <span class="expand-icon">▼</span>
            </button>
            <div class="category-items" style="display:none;">
                ${filterBarHTML(key)}
                <div class="category-product-list" data-category="${key}">`;
        html += buildProductItemsHTML(cat.products, esc);
        html += '</div></div></div>';
    });
    html += '</div>';
    sidebar.innerHTML = html;
}

function setupCategoryButtons() {
    document.addEventListener('click', e => {
        if (!e.target.closest('.category-btn')) return;
        const section = e.target.closest('.category-section');
        const items   = section.querySelector('.category-items');
        const icon    = section.querySelector('.expand-icon');
        const open    = items.style.display !== 'none';
        items.style.display = open ? 'none' : 'block';
        icon.textContent    = open ? '▼' : '▲';
        if (!open) applyPlantRecommendationColors();
    });
}

function setupCanvasClick() {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;
    canvas.addEventListener('click', async e => {
        // Tap-to-place mode (mobile)
        if (_pendingPlaceData) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left - 40;
            const y = e.clientY - rect.top  - 40;
            const d = _pendingPlaceData;
            window.cancelTapToPlace();
            await addItemToCanvas(d, x, y);
            return;
        }
        if (handleCalibCanvasClick(e)) return;
        if (drawingMode) return;
        if (e.target.closest('.draggable-item') ||
            e.target.closest('.control-panel')  ||
            e.target.classList.contains('poly-dot') ||
            e.target.classList.contains('mesh-dot')) return;
        deselectItem();
    });
}

// ── Pinch-to-resize (mobile two-finger gesture on selected item) ──────────────
(function setupPinchResize() {
    let pinching = false, pinchStartDist = 0, pinchStartW = 0, pinchStartH = 0;

    function pinchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    document.addEventListener('touchstart', e => {
        if (e.touches.length !== 2 || !selectedItem) return;
        pinching       = true;
        pinchStartDist = pinchDist(e.touches);
        pinchStartW    = selectedItem.offsetWidth;
        pinchStartH    = selectedItem.offsetHeight;
        pushHistory();
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (!pinching || e.touches.length !== 2 || !selectedItem) return;
        const scale = pinchDist(e.touches) / pinchStartDist;
        const w = Math.max(10, Math.round(pinchStartW * scale));
        const h = Math.max(10, Math.round(pinchStartH * scale));
        selectedItem.style.width  = w + 'px';
        selectedItem.style.height = h + 'px';
        positionCornerHandles(selectedItem);
        updateControlPanelPosition(selectedItem);
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', e => {
        if (e.touches.length < 2) { pinching = false; updateMaterialsList(); }
    });
})();

// ── Tap-to-place (mobile: select from sidebar → tap canvas to place) ──────────
let _pendingPlaceData = null;

function _enterTapToPlace(data) {
    _pendingPlaceData = data;
    // Close products sidebar on mobile
    const sidebar = document.querySelector('.design-sidebar');
    if (sidebar) sidebar.classList.remove('mobile-active');

    let banner = document.getElementById('tapToPlaceBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'tapToPlaceBanner';
        banner.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:300;background:rgba(16,185,129,0.95);color:white;padding:10px 18px;border-radius:50px;font-size:14px;font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.25);';
        banner.innerHTML = `<span id="tapToPlaceLabel">📍 Tap to place</span><button onclick="cancelTapToPlace()" style="background:rgba(255,255,255,0.25);border:none;color:white;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;">✕</button>`;
        document.getElementById('designCanvas')?.appendChild(banner);
    }
    document.getElementById('tapToPlaceLabel').textContent = `📍 Tap to place ${data.name}`;
    banner.style.display = 'flex';
}

window.cancelTapToPlace = function() {
    _pendingPlaceData = null;
    const banner = document.getElementById('tapToPlaceBanner');
    if (banner) banner.style.display = 'none';
};

// ── Product click → add to canvas ─────────────────────────────────────────────
document.addEventListener('click', async e => {
    if (e.target.closest('.product-info-btn')) return;
    const item = e.target.closest('.product-item');
    if (!item) return;
    const pid = item.dataset.pid;
    const p = productRegistry[pid];
    if (!p) return;

    const data = { name: p.name, image: p.image, type: p.type, category: p.category, price: parseFloat(p.price) };

    if (isMobileDevice()) {
        _enterTapToPlace(data);
        return;
    }

    const canvas = document.getElementById('designCanvas');
    const rect   = canvas.getBoundingClientRect();
    await addItemToCanvas(data, rect.width / 2 - 40, rect.height / 2 - 40);
});

// ── Add item to canvas ────────────────────────────────────────────────────────

// Returns the fraction of pixels in the image that are non-transparent (alpha > 10).
// Used so path items count only the actual path area, not the transparent bounding box.
const _pathColoredRatioCache = {};
function _computePathColoredRatio(imgSrc) {
    if (_pathColoredRatioCache[imgSrc] !== undefined) return Promise.resolve(_pathColoredRatioCache[imgSrc]);
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const finish = ratio => { _pathColoredRatioCache[imgSrc] = ratio; resolve(ratio); };
        img.onload = () => {
            try {
                const oc = document.createElement('canvas');
                oc.width = img.naturalWidth; oc.height = img.naturalHeight;
                const ctx = oc.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, oc.width, oc.height).data;
                let colored = 0, total = oc.width * oc.height;
                for (let i = 3; i < data.length; i += 4) { if (data[i] > 10) colored++; }
                finish(total > 0 ? colored / total : 1);
            } catch (_) { finish(1); } // CORS fallback: assume full box
        };
        img.onerror = () => finish(1);
        img.src = imgSrc;
    });
}

function _loadImageDims(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve({ w: img.naturalWidth  || 200, h: img.naturalHeight || 200 });
        img.onerror = () => resolve({ w: 200, h: 200 });
        img.src = src;
    });
}

async function addItemToCanvas(itemData, x, y, customW, customH) {
    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    if (!itemData._skipHistory) pushHistory();

    const isMesh = isMeshItem(itemData.name, itemData.category);
    const isPath = isPathItem(itemData.name, itemData.category);

    let w, h;
    const noPos = (x == null || isNaN(x)); // true when called from sidebar click (no position given)
    if (customW) {
        w = customW; h = customH || customW;
    } else if (isMesh) {
        w = Math.round(canvas.offsetWidth  * 0.75) || 300;
        h = Math.round(canvas.offsetHeight * 0.75) || 300;
        if (noPos) { x = canvas.offsetWidth / 2 - w / 2; y = canvas.offsetHeight / 2 - h / 2; }
    } else if (isPath) {
        w = Math.round(canvas.offsetWidth  * 0.75) || 300;
        h = Math.round(canvas.offsetHeight * 0.75) || 300;
        if (noPos) { x = canvas.offsetWidth / 2 - w / 2; y = canvas.offsetHeight / 2 - h / 2; }
    } else if (itemData.type === 'image') {
        const dims = await _loadImageDims(itemData.imageUrl || itemData.image);
        const maxW = Math.round(canvas.offsetWidth * 0.75) || 400;
        const scale = Math.min(1, maxW / dims.w);
        w = Math.max(80, Math.round(dims.w * scale));
        h = Math.max(80, Math.round(dims.h * scale));
        if (noPos) { x = canvas.offsetWidth / 2 - w / 2; y = canvas.offsetHeight / 2 - h / 2; }
    } else {
        w = 80; h = 80;
        if (noPos) { x = canvas.offsetWidth / 2 - w / 2; y = canvas.offsetHeight / 2 - h / 2; }
    }

    const item = document.createElement('div');
    item.className        = 'draggable-item';
    item.dataset.id          = itemIdCounter++;
    item.dataset.name        = itemData.name;
    item.dataset.category    = itemData.category;
    item.dataset.type        = itemData.type;
    item.dataset.rotation    = '0';
    item.dataset.imageUrl    = itemData.image;

    item.style.cssText = `
        position:absolute; left:${x}px; top:${y}px;
        width:${w}px; height:${h}px;
        cursor:move; user-select:none;
        z-index:${Math.min(itemIdCounter, 100)};
        display:flex; align-items:center; justify-content:center;
    `;

    if (isMesh) {
        item.style.overflow     = 'hidden';
        item.style.borderRadius = '4px';

        // 4 corner dots in canvas-absolute coordinates
        const polyPoints = [
            { id: polyDotIdCounter++, x: x,     y: y     },
            { id: polyDotIdCounter++, x: x + w, y: y     },
            { id: polyDotIdCounter++, x: x + w, y: y + h },
            { id: polyDotIdCounter++, x: x,     y: y + h },
        ];
        item.dataset.polyPoints = JSON.stringify(polyPoints);

        if (itemData.type === 'image') {
            item.style.backgroundImage    = `url(${itemData.imageUrl || itemData.image})`;
            item.style.backgroundSize     = 'cover';
            item.style.backgroundRepeat   = 'no-repeat';
            item.style.backgroundPosition = 'center';
        } else {
            item.style.backgroundColor = 'rgba(120,190,90,0.3)';
            item.innerHTML = `<span style="font-size:64px;opacity:0.7;pointer-events:none;">${itemData.image}</span>`;
        }

        // Double-click on item → add dot at that exact position
        item.addEventListener('dblclick', e => {
            if (e.target.classList.contains('poly-dot')) return;
            e.preventDefault(); e.stopPropagation();
            if (item !== selectedItem) { selectItem(item); return; }
            const r = canvas.getBoundingClientRect();
            addPolyDot(e.clientX - r.left, e.clientY - r.top, item);
        });

    } else if (isPath) {
        item.style.overflow     = 'hidden';
        item.style.borderRadius = '0px';
        item.dataset.borderRadius = '0';
        const imgSrc = itemData.imageUrl || itemData.image;
        item.innerHTML = `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">`;
        // Compute colored-pixel ratio async — stored so materials list uses real path area
        _computePathColoredRatio(imgSrc).then(ratio => {
            item.dataset.coloredRatio = ratio.toFixed(4);
            updateMaterialsList();
        });
    } else {
        if (itemData.type === 'image') {
            item.innerHTML = `<img src="${itemData.image}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">`;
        } else {
            const initFontSize = Math.round(Math.min(w, h) * 0.6);
            item.innerHTML = `<span style="font-size:${initFontSize}px;pointer-events:none;">${itemData.image}</span>`;
        }
    }

    canvas.appendChild(item);
    if (isMesh) applyPolyShape(item); // apply clip-path immediately on placement

    // _price bypasses the getItemPrices() network call (used by auto-design batch)
    const priceVal = itemData._price !== undefined
        ? itemData._price
        : ((await getItemPrices())[itemData.name] || parseFloat(itemData.price) || 0);
    placedItems.push({
        id: item.dataset.id, element: item,
        name: itemData.name, category: itemData.category,
        type: itemData.type, price: priceVal,
    });

    makeDraggable(item);
    updateMaterialsList();
    selectItem(item);
}

// ── Touch helpers ─────────────────────────────────────────────────────────────
function isMobileDevice() { return window.matchMedia('(max-width: 768px)').matches; }
function getEventCoords(e) {
    if (e.touches      && e.touches.length)        return { clientX: e.touches[0].clientX,        clientY: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
    return { clientX: e.clientX, clientY: e.clientY };
}

// ── Drag (mouse + touch) ──────────────────────────────────────────────────────
function makeDraggable(item) {
    let dragging = false, sx, sy;

    function onStart(e) {
        if (e.touches && e.touches.length > 1) return; // let pinch handle 2 fingers
        if (e.target.classList.contains('poly-dot')) return;
        if (e.target.classList.contains('mesh-dot')) return;
        if (e.target.classList.contains('rotate-handle')) return;
        if (isRotating) return;
        selectItem(item);
        pushHistory();
        const c = getEventCoords(e);
        dragging = true; sx = c.clientX; sy = c.clientY;
        e.preventDefault();
    }

    function onMove(e) {
        if (!dragging) return;
        if (e.touches && e.touches.length > 1) { dragging = false; return; } // pinch took over
        const c  = getEventCoords(e);
        const dx = c.clientX - sx;
        const dy = c.clientY - sy;
        sx = c.clientX; sy = c.clientY;

        if (item.dataset.polyPoints) {
            const points = JSON.parse(item.dataset.polyPoints).map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
            item.dataset.polyPoints = JSON.stringify(points);
            applyPolyShape(item);
            if (item === selectedItem) updatePolyDotPositions(item);
        } else if (item.dataset.pathPoints) {
            const points = JSON.parse(item.dataset.pathPoints).map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
            item.dataset.pathPoints = JSON.stringify(points);
            applyPathShape(item);
            if (item === selectedItem) {
                meshDots.forEach(dot => {
                    dot.style.left = (parseFloat(dot.style.left) || 0) + dx + 'px';
                    dot.style.top  = (parseFloat(dot.style.top)  || 0) + dy + 'px';
                });
            }
        } else {
            item.style.left = (parseInt(item.style.left) || 0) + dx + 'px';
            item.style.top  = (parseInt(item.style.top)  || 0) + dy + 'px';
            if (item === selectedItem) positionCornerHandles(item);
        }
        updateControlPanelPosition(item);
        if (e.cancelable) e.preventDefault();
    }

    function onEnd() { dragging = false; }

    item.addEventListener('mousedown', onStart);
    item.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
}

// ── Select / deselect ─────────────────────────────────────────────────────────
function selectItem(item) {
    if (selectedItem === item) return;
    deselectItem();
    selectedItem = item;
    item.classList.add('selected');

    if (isMeshItem(item.dataset.name, item.dataset.category)) {
        createPolyDots(item);
    } else if (isPathItem(item.dataset.name, item.dataset.category)) {
        createCornerHandles(item);
    } else {
        createCornerHandles(item);
    }
    createControlPanel(item);
    addRotateHandle(item);
    addMobileDragHandle(item);
}

function deselectItem() {
    if (!selectedItem) return;
    selectedItem.classList.remove('selected');
    removeRotateHandle(selectedItem);
    removeMobileDragHandle(selectedItem);
    selectedItem = null;
    removePolyDots();
    removeMeshDots();
    removeCornerHandles();
    removeControlPanel();
}

// ── Polygon dot system ────────────────────────────────────────────────────────

function createPolyDots(item) {
    removePolyDots();
    const canvas = document.getElementById('designCanvas');
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    polyDots = points.map(pt => {
        const dot = makePolyDot(pt, item);
        canvas.appendChild(dot);
        return dot;
    });
}

function makePolyDot(point, item) {
    const dot = document.createElement('div');
    dot.className      = 'poly-dot';
    dot.dataset.dotId  = point.id;
    dot.dataset.itemId = item.dataset.id;
    dot.style.cssText  = `
        position:absolute;
        left:${point.x}px; top:${point.y}px;
        width:16px; height:16px;
        background:white; border:3px solid #667eea;
        border-radius:50%; cursor:move;
        z-index:9999; transform:translate(-50%,-50%);
        box-shadow:0 2px 8px rgba(102,126,234,0.55);
        pointer-events:auto;
    `;

    dot.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        pushHistory();
        isDraggingPolyDot = true;
        draggedPolyDot    = dot;
    });

    // Right-click dot → delete it
    dot.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        const points = JSON.parse(item.dataset.polyPoints || '[]');
        if (points.length <= 3) return; // keep at least 3
        pushHistory();
        const filtered = points.filter(p => p.id !== parseInt(dot.dataset.dotId));
        item.dataset.polyPoints = JSON.stringify(filtered);
        createPolyDots(item);
        applyPolyShape(item);
        updateControlPanelPosition(item);
    });

    return dot;
}

function removePolyDots() {
    polyDots.forEach(d => d.remove());
    polyDots = [];
}

// ── Corner resize handles (regular items) ─────────────────────────────────────
function createCornerHandles(item) {
    removeCornerHandles();
    const canvas = document.getElementById('designCanvas');
    ['nw','ne','se','sw'].forEach(pos => {
        const h = document.createElement('div');
        h.className      = 'corner-handle';
        h.dataset.pos    = pos;
        h.dataset.itemId = item.dataset.id;
        h.style.cssText  = `
            position:absolute; width:14px; height:14px;
            background:white; border:3px solid #667eea; border-radius:3px;
            cursor:${pos}-resize; z-index:9999; transform:translate(-50%,-50%);
            box-shadow:0 2px 6px rgba(102,126,234,0.45); pointer-events:auto;
        `;
        h.addEventListener('mousedown', startCornerResize);
        h.addEventListener('touchstart', startCornerResize, { passive: false });
        canvas.appendChild(h);
        cornerHandles.push(h);
    });
    positionCornerHandles(item);
}

function positionCornerHandles(item) {
    if (!cornerHandles.length) return;
    const l = parseInt(item.style.left) || 0;
    const t = parseInt(item.style.top)  || 0;
    const w = item.offsetWidth;
    const h = item.offsetHeight;
    const coords = { nw:[l,t], ne:[l+w,t], se:[l+w,t+h], sw:[l,t+h] };
    cornerHandles.forEach(handle => {
        const [x, y] = coords[handle.dataset.pos];
        handle.style.left = x + 'px';
        handle.style.top  = y + 'px';
    });
}

function removeCornerHandles() {
    cornerHandles.forEach(h => h.remove());
    cornerHandles = [];
}

function startCornerResize(e) {
    e.stopPropagation(); e.preventDefault();
    const isTouch = e.type === 'touchstart';
    const pos  = e.currentTarget.dataset.pos;
    const item = document.querySelector(`[data-id="${e.currentTarget.dataset.itemId}"]`);
    if (!item) return;
    pushHistory();

    const c0     = getEventCoords(e);
    const startX = c0.clientX, startY = c0.clientY;
    const startL = parseInt(item.style.left) || 0;
    const startT = parseInt(item.style.top)  || 0;
    const startW = item.offsetWidth;
    const startH = item.offsetHeight;
    const MIN    = 10;

    const onMove = mv => {
        const c  = getEventCoords(mv);
        const dx = c.clientX - startX;
        const dy = c.clientY - startY;
        if (mv.cancelable) mv.preventDefault();
        let l = startL, t = startT, w = startW, h = startH;

        if (pos === 'nw') {
            w = Math.max(MIN, startW - dx); l = startL + (startW - w);
            h = Math.max(MIN, startH - dy); t = startT + (startH - h);
        } else if (pos === 'ne') {
            w = Math.max(MIN, startW + dx);
            h = Math.max(MIN, startH - dy); t = startT + (startH - h);
        } else if (pos === 'se') {
            w = Math.max(MIN, startW + dx);
            h = Math.max(MIN, startH + dy);
        } else if (pos === 'sw') {
            w = Math.max(MIN, startW - dx); l = startL + (startW - w);
            h = Math.max(MIN, startH + dy);
        }

        item.style.left = l + 'px'; item.style.top  = t + 'px';
        item.style.width = w + 'px'; item.style.height = h + 'px';
        // Scale emoji content proportionally so it never gets clipped
        if (item.dataset.type !== 'image' && !isMeshItem(item.dataset.name, item.dataset.category)) {
            const span = item.querySelector('span');
            if (span) span.style.fontSize = Math.max(10, Math.round(Math.min(w, h) * 0.6)) + 'px';
        }
        positionCornerHandles(item);
        updateControlPanelPosition(item);
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
        updateMaterialsList();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

function updatePolyDotPositions(item) {
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    polyDots.forEach(dot => {
        const pt = points.find(p => p.id === parseInt(dot.dataset.dotId));
        if (pt) { dot.style.left = pt.x + 'px'; dot.style.top = pt.y + 'px'; }
    });
}

function addPolyDot(canvasX, canvasY, item) {
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    const newPt  = { id: polyDotIdCounter++, x: canvasX, y: canvasY };

    // Insert between the two nearest consecutive sorted points
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const sorted = [...points].sort((a, b) =>
        Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );
    const newAngle = Math.atan2(canvasY - cy, canvasX - cx);
    let insertIdx  = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
        const a1 = Math.atan2(sorted[i].y - cy, sorted[i].x - cx);
        const a2 = Math.atan2(sorted[(i + 1) % sorted.length].y - cy, sorted[(i + 1) % sorted.length].x - cx);
        if (newAngle >= Math.min(a1, a2) && newAngle <= Math.max(a1, a2)) { insertIdx = i + 1; break; }
    }
    sorted.splice(insertIdx, 0, newPt);

    item.dataset.polyPoints = JSON.stringify(sorted);
    createPolyDots(item);
    applyPolyShape(item);
    updateControlPanelPosition(item);
}

// Mirror-tile SVG fill — 4 mirrored copies eliminate visible seams.
// Tile dimensions are multiplied by devicePixelRatio so textures stay crisp
// on retina / high-DPI screens.
function _appendMirrorTileSvg(item, imageUrl, tileW, tileH) {
    item.querySelectorAll('svg.poly-texture').forEach(s => s.remove());
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3× to avoid huge patterns
    tileW = Math.round(tileW * dpr);
    tileH = Math.round(tileH * dpr);

    const NS = 'http://www.w3.org/2000/svg';
    const ns = t => document.createElementNS(NS, t);
    const svg = ns('svg');
    svg.classList.add('poly-texture');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;image-rendering:crisp-edges;image-rendering:pixelated;';
    const patId = `mirrorPat${item.dataset.id}`;
    const defs = ns('defs');
    const pat  = ns('pattern');
    pat.id = patId;
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width',  tileW * 2);
    pat.setAttribute('height', tileH * 2);
    [
        null,
        `translate(${tileW * 2},0) scale(-1,1)`,
        `translate(0,${tileH * 2}) scale(1,-1)`,
        `translate(${tileW * 2},${tileH * 2}) scale(-1,-1)`,
    ].forEach(transform => {
        const img = ns('image');
        img.setAttribute('href', imageUrl);
        img.setAttribute('x', '0'); img.setAttribute('y', '0');
        img.setAttribute('width', tileW); img.setAttribute('height', tileH);
        img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        if (transform) img.setAttribute('transform', transform);
        pat.appendChild(img);
    });
    defs.appendChild(pat);
    svg.appendChild(defs);
    const bg = ns('rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', '99999'); bg.setAttribute('height', '99999');
    bg.setAttribute('fill', `url(#${patId})`);
    svg.appendChild(bg);
    item.appendChild(svg);
}

// Apply clip-path polygon from canvas-absolute dot coordinates
function applyPolyShape(item) {
    const points = JSON.parse(item.dataset.polyPoints || '[]');
    if (points.length < 3) return;

    const xs   = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const W    = Math.max(1, maxX - minX);
    const H    = Math.max(1, maxY - minY);

    item.style.left   = minX + 'px';
    item.style.top    = minY + 'px';
    item.style.width  = W + 'px';
    item.style.height = H + 'px';

    // Sort by angle for correct polygon winding
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const sorted = [...points].sort((a, b) =>
        Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
    );

    const clip = sorted.map(p =>
        `${((p.x - minX) / W * 100).toFixed(2)}% ${((p.y - minY) / H * 100).toFixed(2)}%`
    ).join(', ');

    item.style.clipPath        = `polygon(${clip})`;
    item.style.webkitClipPath  = `polygon(${clip})`;
}

// ── Control panel ─────────────────────────────────────────────────────────────
function createControlPanel(item) {
    removeControlPanel();
    const canvas = document.getElementById('designCanvas');
    const panel  = document.createElement('div');
    panel.className = 'control-panel';

    const isMesh = isMeshItem(item.dataset.name, item.dataset.category);

    let html = `
        <button class="control-btn" onclick="sendToBack('${item.dataset.id}')"    title="Send to back"    style="font-size:11px;padding:4px 7px;">Back</button>
        <button class="control-btn" onclick="bringToFront('${item.dataset.id}')"  title="Bring to front"  style="font-size:11px;padding:4px 7px;">Front</button>
        <button class="control-btn" onclick="copyItem('${item.dataset.id}')"      title="Copy">⧉</button>
    `;

    if (isMesh) {
        html += `<button class="control-btn" onclick="resetSize('${item.dataset.id}')" title="Reset shape">↻</button>`;
        html += `<span style="font-size:11px;color:#718096;padding:0 4px;" id="dotCountBadge"></span>`;
    }

    const isPathEl = isPathItem(item.dataset.name, item.dataset.category);
    if (isPathEl) {
        html += `
            <button class="control-btn" onclick="adjustPathCurve('${item.dataset.id}', -15)" title="Straighten edges" style="font-size:13px;">⌐</button>
            <button class="control-btn" onclick="adjustPathCurve('${item.dataset.id}', 15)"  title="Curve edges"      style="font-size:13px;">◠</button>
        `;
    }

    html += `
        <button class="control-btn delete-btn" onclick="deleteItem('${item.dataset.id}')">🗑️</button>
    `;

    panel.innerHTML = html;
    canvas.appendChild(panel);
    controlPanel = panel;

    updateControlPanelPosition(item);
    updateDotCount();

}

function updateDotCount() {
    if (!selectedItem || !selectedItem.dataset.polyPoints) return;
    const badge = document.getElementById('dotCountBadge');
    if (badge) {
        const n = JSON.parse(selectedItem.dataset.polyPoints).length;
        badge.textContent = `${n} pts · right-click to add/remove`;
    }
}

function updateControlPanelPosition(item) {
    if (!controlPanel) return;
    let cx, ty;
    if (item.dataset.polyPoints) {
        const pts = JSON.parse(item.dataset.polyPoints);
        const xs  = pts.map(p => p.x), ys = pts.map(p => p.y);
        cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        ty = Math.min(...ys);
    } else if (item.dataset.pathPoints) {
        const pts = JSON.parse(item.dataset.pathPoints);
        const xs  = pts.map(p => p.x), ys = pts.map(p => p.y);
        cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        ty = Math.min(...ys);
    } else {
        cx = (parseInt(item.style.left) || 0) + item.offsetWidth / 2;
        ty = parseInt(item.style.top) || 0;
    }
    controlPanel.style.left = (cx - controlPanel.offsetWidth / 2) + 'px';
    controlPanel.style.top  = Math.max(4, ty - controlPanel.offsetHeight - 12) + 'px';
}

function removeControlPanel() {
    if (controlPanel) { controlPanel.remove(); controlPanel = null; }
}

// ── Mobile drag handle ────────────────────────────────────────────────────────
// A small button on selected items — long-press activates drag so the finger
// doesn't have to cover the item itself.
function addMobileDragHandle(item) {
    removeMobileDragHandle(item);
    if (!isMobileDevice()) return;

    const btn = document.createElement('div');
    btn.className = 'mobile-drag-handle';
    btn.innerHTML = '⊹';
    btn.setAttribute('title', 'Hold to move');
    item.appendChild(btn);

    let longPressTimer = null;
    let dragging = false;
    let lastX, lastY;

    btn.addEventListener('touchstart', e => {
        e.stopPropagation(); e.preventDefault();
        const t = e.touches[0];
        lastX = t.clientX; lastY = t.clientY;
        btn.classList.add('pressing');
        longPressTimer = setTimeout(() => {
            dragging = true;
            btn.classList.remove('pressing');
            btn.classList.add('active-drag');
            if (navigator.vibrate) navigator.vibrate(40);
            pushHistory();
        }, 200);
    }, { passive: false });

    btn.addEventListener('touchmove', e => {
        e.stopPropagation();
        if (!dragging) {
            clearTimeout(longPressTimer);
            btn.classList.remove('pressing');
            return;
        }
        e.preventDefault();
        const t  = e.touches[0];
        const dx = t.clientX - lastX;
        const dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;

        if (item.dataset.polyPoints) {
            const pts = JSON.parse(item.dataset.polyPoints).map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
            item.dataset.polyPoints = JSON.stringify(pts);
            applyPolyShape(item);
            updatePolyDotPositions(item);
        } else if (item.dataset.pathPoints) {
            const pts = JSON.parse(item.dataset.pathPoints).map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
            item.dataset.pathPoints = JSON.stringify(pts);
            applyPathShape(item);
        } else {
            item.style.left = (parseInt(item.style.left) || 0) + dx + 'px';
            item.style.top  = (parseInt(item.style.top)  || 0) + dy + 'px';
            positionCornerHandles(item);
        }
        updateControlPanelPosition(item);
    }, { passive: false });

    btn.addEventListener('touchend', e => {
        e.stopPropagation();
        clearTimeout(longPressTimer);
        btn.classList.remove('pressing', 'active-drag');
        if (dragging) {
            dragging = false;
            saveDesign();
            updateMaterialsList();
        }
    });
}

function removeMobileDragHandle(item) {
    if (item) item.querySelectorAll('.mobile-drag-handle').forEach(el => el.remove());
}

// ── Rotation ──────────────────────────────────────────────────────────────────
// Circular drag around item center — like MS Word's rotate handle.
function startRotation(e) {
    e.stopPropagation(); e.preventDefault();
    isRotating = true;
    const itemId = e.currentTarget.dataset.itemId;
    const item   = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    pushHistory();

    // Remove the current rotation so getBoundingClientRect returns the un-rotated center
    const currentAngle = parseFloat(item.dataset.rotation || 0);
    const rect   = item.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2;
    const cy     = rect.top  + rect.height / 2;

    // The initial offset angle so the item doesn't jump when you first grab
    const ec = getEventCoords(e);
    const startMouseAngle = Math.atan2(ec.clientY - cy, ec.clientX - cx) * 180 / Math.PI;
    const startItemAngle  = currentAngle;

    const onMove = mv => {
        if (!isRotating) return;
        const c = getEventCoords(mv);
        const mouseAngle = Math.atan2(c.clientY - cy, c.clientX - cx) * 180 / Math.PI;
        const delta  = mouseAngle - startMouseAngle;
        const angle  = ((startItemAngle + delta) % 360 + 360) % 360;
        item.dataset.rotation = Math.round(angle);
        item.style.transform  = `rotate(${angle}deg)`;
        if (mv.cancelable) mv.preventDefault();
    };
    const onUp = () => {
        isRotating = false;
        saveDesign();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
}

function addRotateHandle(item) {
    removeRotateHandle(item);
    const wrapper = document.createElement('div');
    wrapper.className = 'rotate-handle-wrapper';
    const stem = document.createElement('div');
    stem.className = 'rotate-handle-stem';
    const handle = document.createElement('div');
    handle.className = 'rotate-handle';
    handle.dataset.itemId = item.dataset.id;
    handle.title = 'Drag to rotate';
    handle.innerHTML = '↻';
    wrapper.appendChild(stem);
    wrapper.appendChild(handle);
    item.appendChild(wrapper);
    handle.addEventListener('mousedown', startRotation);
    handle.addEventListener('touchstart', startRotation, { passive: false });
}

function removeRotateHandle(item) {
    if (item) item.querySelectorAll('.rotate-handle-wrapper').forEach(el => el.remove());
}

// ── Item actions ──────────────────────────────────────────────────────────────
window.resetSize = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    pushHistory();
    const l = parseInt(item.style.left) || 0;
    const t = parseInt(item.style.top)  || 0;
    const polyPoints = [
        { id: polyDotIdCounter++, x: l,       y: t       },
        { id: polyDotIdCounter++, x: l + 400, y: t       },
        { id: polyDotIdCounter++, x: l + 400, y: t + 250 },
        { id: polyDotIdCounter++, x: l,       y: t + 250 },
    ];
    item.dataset.polyPoints   = JSON.stringify(polyPoints);
    item.style.clipPath        = 'none';
    item.style.webkitClipPath = 'none';
    item.style.width           = '400px';
    item.style.height          = '250px';
    if (item === selectedItem) { createPolyDots(item); updateControlPanelPosition(item); updateDotCount(); }
};

window.undoAction = undoAction;
window.redoAction = redoAction;

window.bringToFront = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) { pushHistory(); item.style.zIndex = 100; saveDesign(); }
};
window.sendToBack = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (item) { pushHistory(); item.style.zIndex = 1; saveDesign(); }
};
window.changeSize = function(itemId, delta) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    item.style.width  = Math.max(10, item.offsetWidth  + delta) + 'px';
    item.style.height = Math.max(10, item.offsetHeight + delta) + 'px';
    updateControlPanelPosition(item);
};
window.deleteItem = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    pushHistory();
    const idx = placedItems.findIndex(i => i.id === itemId);
    if (idx !== -1) placedItems.splice(idx, 1);
    item.remove();
    deselectItem();
    updateMaterialsList();
    saveDesign();
};

window.copyItem = async function(itemId) {
    const src = placedItems.find(i => i.id === itemId);
    if (!src) return;
    const el     = src.element;
    const offset = 25;

    const itemData = {
        name:     src.name,
        image:    el.dataset.imageUrl,
        type:     src.type,
        category: src.category,
        price:    src.price,
    };

    const x = (parseInt(el.style.left) || 0) + offset;
    const y = (parseInt(el.style.top)  || 0) + offset;

    await addItemToCanvas(itemData, x, y);

    // For mesh items, copy the polygon shape offset by the same amount
    const newEl = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
    if (newEl && el.dataset.polyPoints) {
        const pts = JSON.parse(el.dataset.polyPoints).map(p => ({
            ...p, id: polyDotIdCounter++, x: p.x + offset, y: p.y + offset,
        }));
        newEl.dataset.polyPoints = JSON.stringify(pts);
        applyPolyShape(newEl);
        if (newEl === selectedItem) { createPolyDots(newEl); updateControlPanelPosition(newEl); }
    }
    // Copy size for regular items
    if (newEl && !el.dataset.polyPoints) {
        newEl.style.width  = el.style.width;
        newEl.style.height = el.style.height;
    }
};

// ── Materials list ────────────────────────────────────────────────────────────
function updateMaterialsList() {
    const list = document.getElementById('materialsList');
    if (!list) return;
    if (!placedItems.length) {
        list.innerHTML = '<p style="color:#718096;text-align:center;padding:20px;">Add items to see your shopping list</p>';
        updateTotal(0);
        return;
    }

    // coverage: hardscapes ($/ton, sfPerUnit=SF per ton) + grass ($/sqft, sfPerUnit=1)
    const coverage  = {}; // name → { name, price, sfPerUnit, unitType, totalSqFt, noScale }
    const mulch     = {}; // name → { name, price, totalSqFt, noScale }  — cubic-yard calculation
    const regular   = {}; // name → { name, price, count }
    const pathItems = {}; // name → { name, price, items[] }  — all path-category items

    placedItems.forEach(item => {
        // All path items: sq ft from colored pixels × 4.5 bricks/sqft
        if (isPathItem(item.name, item.category)) {
            if (!pathItems[item.name]) pathItems[item.name] = { name: item.name, price: item.price, items: [] };
            pathItems[item.name].items.push(item);
            return;
        }
        // Mulch: cubic yards at 3" depth (handled separately from ton-based hardscapes)
        if (isMulchItem(item.name)) {
            if (!mulch[item.name]) mulch[item.name] = { name: item.name, price: item.price, totalSqFt: 0, noScale: false };
            const sqFt = getItemSqFt(item);
            if (sqFt === null) mulch[item.name].noScale = true;
            else mulch[item.name].totalSqFt += sqFt;
            return;
        }
        const sfPerTon  = getCoverageRate(item.name);
        const isPerSqft = isGrassItem(item.name, item.category);
        if (sfPerTon !== undefined) {
            if (!coverage[item.name]) coverage[item.name] = { name: item.name, price: item.price, sfPerUnit: sfPerTon, unitType: 'ton', totalSqFt: 0, noScale: false };
            const sqFt = getItemSqFt(item);
            if (sqFt === null) coverage[item.name].noScale = true;
            else coverage[item.name].totalSqFt += sqFt;
        } else if (isPerSqft) {
            if (!coverage[item.name]) coverage[item.name] = { name: item.name, price: item.price, sfPerUnit: 1, unitType: 'sqft', totalSqFt: 0, noScale: false };
            const sqFt = getItemSqFt(item);
            if (sqFt === null) coverage[item.name].noScale = true;
            else coverage[item.name].totalSqFt += sqFt;
        } else {
            if (!regular[item.name]) regular[item.name] = { name: item.name, price: item.price, count: 0 };
            regular[item.name].count++;
        }
    });

    let total = 0, html = '';

    // Mulch rows — cubic yards at 3" depth: cu yd = sqFt × 0.25 / 27 = sqFt / 108
    const SQFT_PER_CUYD_3IN = 108; // 27 cu ft/cu yd ÷ 0.25 ft depth
    Object.values(mulch).forEach(item => {
        const cuYd = item.totalSqFt / SQFT_PER_CUYD_3IN;
        const cost = cuYd * item.price;
        total += cost;
        const hasScale = !item.noScale && item.totalSqFt > 0;
        const detailLine = hasScale
            ? `<div style="font-size:11px;color:#10b981;font-weight:600;margin-top:3px;">📐 ${item.totalSqFt.toFixed(1)} sq ft · 3" deep</div>
               <div style="font-size:11px;color:#718096;">${cuYd.toFixed(2)} cu yd · $${item.price.toFixed(2)}/cu yd</div>`
            : item.noScale
                ? `<div style="font-size:11px;color:#f59e0b;">⚠ Analyze photo to calculate area</div>`
                : `<div style="font-size:11px;color:#718096;">Shape on canvas to calculate area</div>`;
        html += `<div class="material-item coverage-item">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${item.name}</div>
                ${detailLine}
            </div>
            <div style="font-weight:700;color:#059669;font-size:14px;white-space:nowrap;">$${cost.toFixed(2)}</div>
        </div>`;
    });

    // Coverage-based rows (hardscapes + grass)
    Object.values(coverage).forEach(item => {
        const units = item.totalSqFt / item.sfPerUnit;
        const cost  = units * item.price;
        total += cost;
        const hasScale = !item.noScale && item.totalSqFt > 0;
        const detailLine = hasScale
            ? item.unitType === 'ton'
                ? `<div style="font-size:11px;color:#10b981;font-weight:600;margin-top:3px;">📐 ${item.totalSqFt.toFixed(1)} sq ft covered</div>
                   <div style="font-size:11px;color:#718096;">${units.toFixed(2)} tons · $${item.price.toFixed(2)}/ton</div>`
                : `<div style="font-size:11px;color:#10b981;font-weight:600;margin-top:3px;">📐 ${item.totalSqFt.toFixed(1)} sq ft covered</div>
                   <div style="font-size:11px;color:#718096;">$${item.price.toFixed(2)}/sqft</div>`
            : item.noScale
                ? `<div style="font-size:11px;color:#f59e0b;">⚠ Analyze photo to calculate SF</div>`
                : `<div style="font-size:11px;color:#718096;">Shape on canvas to calculate SF</div>`;
        html += `<div class="material-item coverage-item">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${item.name}</div>
                ${detailLine}
            </div>
            <div style="font-weight:700;color:#059669;font-size:14px;white-space:nowrap;">$${cost.toFixed(2)}</div>
        </div>`;
    });

    // Regular rows
    Object.values(regular).forEach(item => {
        const sub = item.count * item.price;
        total += sub;
        html += `<div class="material-item">
            <div><div style="font-weight:600;font-size:13px;">${item.name}</div>
            <div style="font-size:12px;color:#718096;">Qty: ${item.count}</div></div>
            <div style="font-weight:700;color:#667eea;font-size:14px;">$${sub.toFixed(2)}</div>
        </div>`;
    });

    // Path rows: sq ft (colored pixels only) × 4.5 bricks per sq ft
    const BRICKS_PER_SQFT = 4.5;
    Object.values(pathItems).forEach(group => {
        let totalSqFt = 0, hasNoScale = false;
        group.items.forEach(item => {
            const sqFt = getItemSqFt(item);
            if (sqFt === null) hasNoScale = true;
            else totalSqFt += sqFt;
        });
        const bricks = Math.ceil(totalSqFt * BRICKS_PER_SQFT * (1 + pathWastePct / 100));
        const cost   = bricks * group.price;
        total += cost;
        const ratioReady = group.items.every(i => i.element.dataset.coloredRatio !== undefined);
        const detailLine = hasNoScale
            ? `<div style="font-size:11px;color:#f59e0b;">⚠ Enter yard area to calculate bricks</div>`
            : totalSqFt > 0
                ? `<div style="font-size:11px;color:#b5631a;font-weight:600;margin-top:3px;">🧱 ${bricks.toLocaleString()} bricks needed · ${totalSqFt.toFixed(1)} sq ft (+${pathWastePct}% waste)</div>
                   <div style="font-size:11px;color:#718096;">$${group.price.toFixed(2)}/brick · 4.5 bricks/sq ft</div>`
                : ratioReady
                    ? `<div style="font-size:11px;color:#718096;">Calibrate scale to calculate bricks</div>`
                    : `<div style="font-size:11px;color:#718096;">Calculating…</div>`;
        html += `<div class="material-item">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;">${group.name}</div>
                ${detailLine}
            </div>
            <div style="font-weight:700;color:#b5631a;font-size:14px;white-space:nowrap;">$${cost.toFixed(2)}</div>
        </div>`;
    });

    list.innerHTML = html;
    updateTotal(total);
}
function updateTotal(total) {
    const el = document.getElementById('totalCost');
    if (el) el.textContent = `$${total.toFixed(2)}`;
}

// ── Save / load ───────────────────────────────────────────────────────────────

// Wait for the canvas background image to fully load so offsetHeight is accurate.
// Resolves immediately if already complete or no src is set.
function waitForCanvasImage() {
    const img = document.getElementById('canvasImage');
    if (!img || !img.src || img.src === window.location.href || img.complete) return Promise.resolve();
    return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
}

function getCanvasState() {
    const canvas  = document.getElementById('designCanvas');
    const canvasW = canvas?.offsetWidth  || 800;
    // Derive height from natural image ratio if CSS hasn't resolved it yet
    const img     = document.getElementById('canvasImage');
    const rawH    = canvas?.offsetHeight || 0;
    const canvasH = rawH > 0 ? rawH
        : (img?.naturalWidth ? Math.round(canvasW * img.naturalHeight / img.naturalWidth) : 600);
    return JSON.stringify({
        canvasW, canvasH,
        items: placedItems.map(i => {
            const x  = parseInt(i.element.style.left)   || 0;
            const y  = parseInt(i.element.style.top)    || 0;
            const w  = parseInt(i.element.style.width)  || 80;
            const h  = parseInt(i.element.style.height) || 80;
            const pw = parseInt(i.element.dataset.pathWidth || 40);
            // Fractional coords (0-1) for device-independent restore
            let polyPtsFrac, pathPtsFrac;
            if (i.element.dataset.polyPoints) {
                const pts = JSON.parse(i.element.dataset.polyPoints);
                polyPtsFrac = pts.map(p => ({ id: p.id, xF: p.x / canvasW, yF: p.y / canvasH }));
            }
            if (i.element.dataset.pathPoints) {
                const pts = JSON.parse(i.element.dataset.pathPoints);
                pathPtsFrac = pts.map(p => ({ id: p.id, xF: p.x / canvasW, yF: p.y / canvasH }));
            }
            return {
                name: i.name, category: i.category, type: i.type,
                x, y, width: w, height: h,           // raw px — kept for legacy
                xPct: x / canvasW, yPct: y / canvasH,
                wPct: w / canvasW, hPct: h / canvasH,
                rotation: parseInt(i.element.dataset.rotation || 0),
                zIndex:   parseInt(i.element.style.zIndex) || 1,
                price:    i.price,
                polyPoints: i.element.dataset.polyPoints, polyPtsFrac,
                pathPoints: i.element.dataset.pathPoints, pathPtsFrac,
                pathWidth:  i.element.dataset.pathWidth,
                pathWidthPct: pw / canvasW,
                pathFill:     i.element.dataset.pathFill,
                borderRadius: i.element.dataset.borderRadius,
            };
        }),
    });
}

function saveDesign() {
    try { localStorage.setItem('gardiyDesign', getCanvasState()); } catch (e) { console.warn('Save error:', e); }
    scheduleCloudSave();
}

async function loadSavedDesign() {
    const saved = localStorage.getItem('gardiyDesign');
    if (!saved) return;
    try { await restoreCanvasFromState(saved); } catch (e) { console.error('Load error:', e); }
}

// ── Cloud project save / load ─────────────────────────────────────────────────
// projectStateCache holds canvasState JSON keyed by project _id, avoids storing
// large JSON strings in data-* attributes which breaks with apostrophes/quotes.
const projectStateCache = {};
const projectImageCache  = {};

async function saveProjectCloud(nameOverride) {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token) return null;
    const projectName = (nameOverride || activeProjectName || 'My Project').trim();
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` };
    const body    = {
        canvasState:        getCanvasState(),
        designName:         projectName,
        isDraft:            true,
        landscapeImageData: window.GarDIYStorage?.getImage() || '',
    };
    try {
        if (activeProjectId) {
            const res  = await fetch(`${BACKEND}/api/designs/${activeProjectId}`, { method: 'PUT', headers, body: JSON.stringify(body) });
            const data = await res.json();
            if (data.success) { activeProjectName = projectName; localStorage.setItem('gardiyActiveProjectName', projectName); return activeProjectId; }
        } else {
            const res  = await fetch(`${BACKEND}/api/designs`, { method: 'POST', headers, body: JSON.stringify({ ...body, userId: session.userId }) });
            const data = await res.json();
            if (data.success) {
                activeProjectId = data.designId; activeProjectName = projectName;
                localStorage.setItem('gardiyActiveProject', activeProjectId);
                localStorage.setItem('gardiyActiveProjectName', projectName);
                return activeProjectId;
            }
        }
    } catch (e) { console.warn('Cloud save failed:', e); }
    return null;
}

function scheduleCloudSave() {
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(async () => {
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        if (session.token && activeProjectId) { await saveProjectCloud(); showSavedIndicator(); }
    }, 5000);
}

const SAVE_BTN_HTML = `<img src="images/icon-save.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;margin-right:5px;">Save`;
function showSavedIndicator() {
    const btn = document.getElementById('saveProjectBtn');
    if (!btn) return;
    btn.innerHTML = '✓ Saved';
    clearTimeout(btn._savedTimer);
    btn._savedTimer = setTimeout(() => { btn.innerHTML = SAVE_BTN_HTML; }, 2500);
}

async function restoreCanvasFromState(canvasStateJson) {
    // Must wait for the background image so canvas.offsetHeight is real, not 0
    await waitForCanvasImage();

    const products = await getProducts();
    const data     = JSON.parse(canvasStateJson);
    [...placedItems].forEach(pi => pi.element.remove());
    placedItems = [];

    // Scale all coords from the saved canvas size to the current canvas size
    const canvas = document.getElementById('designCanvas');
    const cW     = canvas?.offsetWidth  || 800;
    const cH     = canvas?.offsetHeight || 600;
    const savedW = data.canvasW || cW;   // if no canvasW, assume same size (no scale)
    const savedH = data.canvasH || cH;
    const sX     = cW / savedW;          // horizontal scale factor
    const sY     = cH / savedH;          // vertical scale factor

    for (const d of data.items) {
        const product = products.find(p => p.name === d.name);
        if (!product) continue;

        // Prefer fractional coords (new format); fall back to raw × scale factor
        const x = d.xPct !== undefined ? Math.round(d.xPct * cW) : Math.round((d.x || 0) * sX);
        const y = d.yPct !== undefined ? Math.round(d.yPct * cH) : Math.round((d.y || 0) * sY);
        const w = d.wPct !== undefined ? Math.round(d.wPct * cW) : Math.round((d.width  || 80) * sX);
        const h = d.hPct !== undefined ? Math.round(d.hPct * cH) : Math.round((d.height || 80) * sY);

        await addItemToCanvas({ ...product, _skipHistory: true }, x, y);
        const item = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
        if (!item) continue;
        // Force position — addItemToCanvas may have centered the item internally
        item.style.left   = x + 'px';
        item.style.top    = y + 'px';
        item.style.width  = w + 'px';
        item.style.height = h + 'px';
        item.dataset.rotation = d.rotation || 0;
        item.style.transform  = `rotate(${d.rotation || 0}deg)`;
        item.style.zIndex     = d.zIndex || 1;

        if (d.polyPtsFrac || d.polyPoints) {
            const pts = d.polyPtsFrac
                ? d.polyPtsFrac.map(p => ({ id: p.id, x: Math.round(p.xF * cW), y: Math.round(p.yF * cH) }))
                : JSON.parse(d.polyPoints).map(p => ({ ...p, x: Math.round(p.x * sX), y: Math.round(p.y * sY) }));
            item.dataset.polyPoints = JSON.stringify(pts);
            applyPolyShape(item);
        }

        if (d.pathPoints) {
            const pts = d.pathPtsFrac
                ? d.pathPtsFrac.map(p => ({ id: p.id, x: Math.round(p.xF * cW), y: Math.round(p.yF * cH) }))
                : JSON.parse(d.pathPoints).map(p => ({ ...p, x: Math.round(p.x * sX), y: Math.round(p.y * sY) }));
            item.dataset.pathPoints = JSON.stringify(pts);
            const pw = d.pathWidthPct !== undefined
                ? Math.round(d.pathWidthPct * cW)
                : Math.round(parseInt(d.pathWidth || 40) * sX);
            item.dataset.pathWidth = pw;
            if (d.pathFill) item.dataset.pathFill = d.pathFill;
            applyPathShape(item);
        }

        if (d.borderRadius !== undefined) { item.dataset.borderRadius = d.borderRadius; item.style.borderRadius = d.borderRadius + 'px'; }
    }
    deselectItem();
    saveDesign();
    updateMaterialsList();
}

function restoreProjectPhoto(imageData) {
    if (!imageData) return;
    const canvasImage = document.getElementById('canvasImage');
    const canvasHint  = document.getElementById('canvasHint');
    if (canvasImage) { canvasImage.src = imageData; if (canvasHint) canvasHint.style.display = 'none'; }
    window.GarDIYStorage?.saveImage(imageData);
}

async function autoLoadLastProject() {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token || !activeProjectId) return false;
    try {
        const res  = await fetch(`${BACKEND}/api/designs`, { headers: { 'Authorization': `Bearer ${session.token}` } });
        const data = await res.json();
        if (!data.success) return false;
        const project = data.designs.find(d => d._id === activeProjectId && d.isDraft);
        if (!project?.canvasState) { activeProjectId = null; localStorage.removeItem('gardiyActiveProject'); return false; }
        activeProjectName = project.designName || 'My Project';
        localStorage.setItem('gardiyActiveProjectName', activeProjectName);
        restoreProjectPhoto(project.landscapeImageData);
        await restoreCanvasFromState(project.canvasState);
        updateProjectNameDisplay();
        return true;
    } catch (e) { return false; }
}

async function handleSaveProjectClick() {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token) {
        if (confirm('Sign in to save your project to the cloud.\n\nGo to login page?')) window.location.href = 'login.html';
        return;
    }
    if (!placedItems.length && !activeProjectId) { alert('Add items to your design before saving.'); return; }
    let name = activeProjectId ? null : prompt('Name your project:', 'My Project');
    if (name === null && !activeProjectId) return; // cancelled new-project prompt
    const btn = document.getElementById('saveProjectBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = 'Saving…'; }
    const id = await saveProjectCloud(name || undefined);
    if (btn) { btn.disabled = false; btn.innerHTML = SAVE_BTN_HTML; }
    if (id)  { updateProjectNameDisplay(); showSavedIndicator(); }
    else     { alert('Failed to save project. Please try again.'); }
}

async function openProjectsModal() {
    const modal = document.getElementById('projectsModal');
    if (!modal) return;
    modal.style.display = 'flex';
    await refreshProjectsList();
}

async function refreshProjectsList() {
    const listEl = document.getElementById('projectsList');
    if (!listEl) return;
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token) {
        listEl.innerHTML = '<p style="color:#6b7280;text-align:center;padding:24px;">Sign in to save and load projects.</p>';
        return;
    }
    listEl.innerHTML = '<p style="color:#6b7280;text-align:center;padding:24px;">Loading…</p>';
    try {
        const res      = await fetch(`${BACKEND}/api/designs`, { headers: { 'Authorization': `Bearer ${session.token}` } });
        const data     = await res.json();
        const projects = data.success ? data.designs.filter(d => d.isDraft) : [];
        if (!projects.length) {
            listEl.innerHTML = '<p style="color:#6b7280;text-align:center;padding:24px;">No saved projects yet.<br>Click <strong>Save</strong> to save your current work.</p>';
            return;
        }
        // Cache states and photos — avoids storing large data in DOM attributes
        projects.forEach(p => {
            if (p.canvasState)        projectStateCache[p._id] = p.canvasState;
            if (p.landscapeImageData) projectImageCache[p._id] = p.landscapeImageData;
        });
        listEl.innerHTML = projects.map(p => {
            const isActive = p._id === activeProjectId;
            const dateStr  = new Date(p.updatedAt || p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `<div class="project-item${isActive ? ' project-item--active' : ''}" data-id="${p._id}">
                <div class="project-item-info">
                    <div class="project-item-name">${p.designName || 'Untitled'}</div>
                    <div class="project-item-date">${dateStr}${isActive ? ' &middot; <span style="color:#10b981;font-weight:600;">active</span>' : ''}</div>
                </div>
                <div class="project-item-btns">
                    <button class="proj-open-btn" data-id="${p._id}" data-name="${(p.designName||'My Project').replace(/"/g,'&quot;')}">Open</button>
                    <button class="proj-del-btn"  data-id="${p._id}">✕</button>
                </div>
            </div>`;
        }).join('');
        listEl.querySelectorAll('.proj-open-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id    = btn.dataset.id;
                const name  = btn.dataset.name;
                const state = projectStateCache[id];
                if (!state) { alert('This project has no saved canvas data.'); return; }
                if (activeProjectId && activeProjectId !== id && !confirm(`Load "${name}"? Unsaved changes will be lost.`)) return;
                activeProjectId = id; activeProjectName = name;
                localStorage.setItem('gardiyActiveProject', id);
                localStorage.setItem('gardiyActiveProjectName', name);
                document.getElementById('projectsModal').style.display = 'none';
                updateProjectNameDisplay();
                restoreProjectPhoto(projectImageCache[id]);
                await restoreCanvasFromState(state);
            });
        });
        listEl.querySelectorAll('.proj-del-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id  = btn.dataset.id;
                const row = btn.closest('.project-item');
                const name = row.querySelector('.project-item-name').textContent;
                if (!confirm(`Delete "${name}"?`)) return;
                const r = await fetch(`${BACKEND}/api/designs/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session.token}` } });
                const d = await r.json();
                if (d.success) {
                    delete projectStateCache[id];
                    delete projectImageCache[id];
                    if (activeProjectId === id) { activeProjectId = null; activeProjectName = 'My Project'; localStorage.removeItem('gardiyActiveProject'); localStorage.removeItem('gardiyActiveProjectName'); updateProjectNameDisplay(); }
                    row.remove();
                    if (!listEl.querySelector('.project-item')) listEl.innerHTML = '<p style="color:#6b7280;text-align:center;padding:24px;">No saved projects yet.</p>';
                }
            });
        });
    } catch (e) {
        listEl.innerHTML = '<p style="color:#ef4444;text-align:center;padding:24px;">Failed to load projects.</p>';
    }
}

function updateProjectNameDisplay() {
    const el = document.getElementById('activeProjectName');
    if (el) el.textContent = activeProjectId ? activeProjectName : '';
}

function setupProjectButtons() {
    document.getElementById('saveProjectBtn')?.addEventListener('click', handleSaveProjectClick);
    document.getElementById('myProjectsBtn')?.addEventListener('click', openProjectsModal);
    document.getElementById('closeProjectsModal')?.addEventListener('click', () => { document.getElementById('projectsModal').style.display = 'none'; });
    document.getElementById('projectsModal')?.addEventListener('click', e => {
        if (e.target.id === 'projectsModal') document.getElementById('projectsModal').style.display = 'none';
    });
    document.getElementById('newProjectBtn')?.addEventListener('click', () => {
        if (placedItems.length && !confirm('Start a new project? The canvas will be cleared.')) return;
        activeProjectId = null; activeProjectName = 'My Project';
        localStorage.removeItem('gardiyActiveProject');
        localStorage.removeItem('gardiyActiveProjectName');
        [...placedItems].forEach(pi => pi.element.remove());
        placedItems = []; saveDesign(); updateMaterialsList(); updateProjectNameDisplay();
        document.getElementById('projectsModal').style.display = 'none';
    });
    document.getElementById('shareProjectBtn')?.addEventListener('click', handleShareClick);
}

// ── Share feature ─────────────────────────────────────────────────────────────

async function handleShareClick() {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token) {
        if (confirm('Sign in to share your project.\n\nGo to login page?')) window.location.href = 'login.html';
        return;
    }
    if (!activeProjectId) {
        const shouldSave = confirm('Save your project first to generate a share link.');
        if (!shouldSave) return;
        const id = await handleSaveProjectClick();
        if (!activeProjectId) return;
    }
    const btn = document.getElementById('shareProjectBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
        const imageData = window.GarDIYStorage?.getImage() || '';
        const res  = await fetch(`${BACKEND}/api/designs/${activeProjectId}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
            body: JSON.stringify({ landscapeImageData: imageData }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${data.shareToken}`;
        await navigator.clipboard.writeText(shareUrl).catch(() => {
            prompt('Copy this share link:', shareUrl);
        });
        if (btn) { btn.textContent = '✓ Link copied!'; setTimeout(() => { btn.disabled = false; btn.textContent = '🔗 Share'; }, 3000); }
    } catch (e) {
        console.error('Share failed:', e);
        if (btn) { btn.disabled = false; btn.textContent = '🔗 Share'; }
        alert('Could not generate share link. Please try again.');
    }
}

async function enterSharedViewMode(token) {
    isSharedView = true;
    const banner = document.getElementById('sharedBanner');
    if (banner) banner.style.display = 'flex';

    // Disable save controls — viewer shouldn't trigger auto-save
    const saveBtn   = document.getElementById('saveProjectBtn');
    const projBtn   = document.getElementById('myProjectsBtn');
    const shareBtn  = document.getElementById('shareProjectBtn');
    if (saveBtn)  { saveBtn.style.display  = 'none'; }
    if (projBtn)  { projBtn.style.display  = 'none'; }
    if (shareBtn) { shareBtn.style.display = 'none'; }

    try {
        const res  = await fetch(`${BACKEND}/api/designs/shared/${token}`);
        const data = await res.json();
        if (!data.success) { alert('This share link is invalid or has expired.'); return; }

        const nameEl = document.getElementById('sharedDesignName');
        if (nameEl) nameEl.textContent = data.designName || 'Untitled Design';

        // Restore background image
        if (data.landscapeImageData) {
            const canvasImage = document.getElementById('canvasImage');
            const canvasHint  = document.getElementById('canvasHint');
            if (canvasImage) { canvasImage.src = data.landscapeImageData; if (canvasHint) canvasHint.style.display = 'none'; }
            window.GarDIYStorage?.saveImage(data.landscapeImageData);
        }

        // Restore placed items
        if (data.canvasState) await restoreCanvasFromState(data.canvasState);

    } catch (e) {
        console.error('Failed to load shared design:', e);
        alert('Could not load this shared design. Please try again.');
    }

    // Wire up "Save a Copy" button
    document.getElementById('saveSharedCopyBtn')?.addEventListener('click', () => saveSharedCopy(token));
}

async function saveSharedCopy(token) {
    const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!session.token) {
        if (confirm('Sign in to save this design to your account.\n\nGo to login page?')) {
            sessionStorage.setItem('gardiyReturnShare', token);
            window.location.href = 'login.html';
        }
        return;
    }
    const btn = document.getElementById('saveSharedCopyBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
        const res  = await fetch(`${BACKEND}/api/designs/shared/${token}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}` },
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        activeProjectId   = data.designId;
        activeProjectName = data.designName;
        localStorage.setItem('gardiyActiveProject',     activeProjectId);
        localStorage.setItem('gardiyActiveProjectName', activeProjectName);
        // Reload without the share param so the user is now in edit mode
        window.location.href = window.location.pathname;
    } catch (e) {
        console.error('Copy failed:', e);
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save a Copy to My Account'; }
        alert('Could not save a copy. Please try again.');
    }
}

// ── Path system ───────────────────────────────────────────────────────────────
window.adjustPathCurve = function(itemId, delta) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    pushHistory();
    const current = parseFloat(item.dataset.borderRadius || 0);
    const next = Math.max(0, Math.min(300, current + delta));
    item.dataset.borderRadius = next;
    item.style.borderRadius = next + 'px';
    saveDesign();
};

function removeMeshDots() { meshDots.forEach(d => d.remove()); meshDots = []; }

function createPathControls(item) {
    removeMeshDots();
    const canvas = document.getElementById('designCanvas');
    const points = JSON.parse(item.dataset.pathPoints || '[]');
    meshDots = points.map(pt => {
        const dot = document.createElement('div');
        dot.className      = 'mesh-dot';
        dot.dataset.dotId  = pt.id;
        dot.style.cssText  = `
            position:absolute; left:${pt.x}px; top:${pt.y}px;
            width:12px; height:12px; background:#ffb800; border:3px solid #ff8c42;
            border-radius:50%; cursor:move; z-index:9999;
            transform:translate(-50%,-50%);
            box-shadow:0 2px 8px rgba(255,140,66,0.4); pointer-events:auto;
        `;
        dot.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); isDraggingDot = true; draggedDot = dot; });
        dot.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); addPathPoint(e.clientX, e.clientY); });
        canvas.appendChild(dot);
        return dot;
    });
    applyPathShape(item);
}

function applyPathShape(item) {
    if (isBrickPath(item.dataset.name, item.dataset.category)) { return applyBrickPathShape(item); }
    // Non-brick path in fill mode (freehand drawn area)
    if (item.dataset.pathFill === 'true') {
        const pts = JSON.parse(item.dataset.pathPoints || '[]');
        if (pts.length >= 3) return applyGenericPathFillShape(item);
    }
    const points    = JSON.parse(item.dataset.pathPoints || '[]');
    const pathWidth = parseInt(item.dataset.pathWidth || 40);
    if (points.length < 2) return;

    let svg = item.querySelector('svg.path-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('path-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        item.appendChild(svg);
    }

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad  = pathWidth;
    const W    = maxX - minX + pad * 2, H = maxY - minY + pad * 2;

    item.style.left = (minX - pad) + 'px'; item.style.top  = (minY - pad) + 'px';
    item.style.width = W + 'px';           item.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad  = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = `pg${item.dataset.id}`;
    grad.innerHTML = `<stop offset="0%" style="stop-color:#a0826d"/><stop offset="100%" style="stop-color:#8b6f47"/>`;
    defs.appendChild(grad); svg.appendChild(defs);

    let d = `M ${points[0].x - minX + pad} ${points[0].y - minY + pad}`;
    for (let i = 1; i < points.length; i++) {
        const cx2 = points[i].x - minX + pad, cy2 = points[i].y - minY + pad;
        if (i === points.length - 1) { d += ` L ${cx2} ${cy2}`; }
        else {
            const nx = points[i+1].x - minX + pad, ny = points[i+1].y - minY + pad;
            d += ` Q ${cx2} ${cy2} ${(cx2+nx)/2} ${(cy2+ny)/2}`;
        }
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); path.setAttribute('stroke', `url(#pg${item.dataset.id})`);
    path.setAttribute('stroke-width', pathWidth); path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0.9');
    svg.appendChild(path);
}

function applyBrickPathShape(item) {
    const points    = JSON.parse(item.dataset.pathPoints || '[]');
    const pathWidth = parseInt(item.dataset.pathWidth || 40);
    const fillMode  = item.dataset.pathFill === 'true' && points.length >= 3;
    if (points.length < 2) return;

    let svg = item.querySelector('svg.path-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('path-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        item.appendChild(svg);
    }

    const xs   = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad  = fillMode ? 4 : pathWidth;
    const W    = Math.max(1, maxX - minX + pad * 2);
    const H    = Math.max(1, maxY - minY + pad * 2);

    item.style.left = (minX - pad) + 'px'; item.style.top  = (minY - pad) + 'px';
    item.style.width = W + 'px';           item.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';

    const NS    = 'http://www.w3.org/2000/svg';
    const ns    = tag => document.createElementNS(NS, tag);
    const patId = `brickPat${item.dataset.id}`;
    const patScale = fillMode ? '1' : (pathWidth / 40).toFixed(3);

    const imageUrl   = item.dataset.imageUrl || '';
    const isRealImage = /^(https?:|\/|data:|blob:)/.test(imageUrl);

    const defs = ns('defs');
    const pat  = ns('pattern');
    pat.id = patId;
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('patternTransform', `scale(${patScale})`);

    if (isRealImage) {
        const tileSize = 80;
        pat.setAttribute('width', tileSize); pat.setAttribute('height', tileSize);
        const imgEl = ns('image');
        imgEl.setAttribute('href', imageUrl);
        imgEl.setAttribute('width', tileSize); imgEl.setAttribute('height', tileSize);
        imgEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        pat.appendChild(imgEl);
    } else {
        // SVG-drawn brick fallback (emoji / no real image)
        const patW = 40, patH = 26;
        pat.setAttribute('width', patW); pat.setAttribute('height', patH);
        const bg = ns('rect');
        bg.setAttribute('width', patW); bg.setAttribute('height', patH);
        bg.setAttribute('fill', '#c8a882');
        pat.appendChild(bg);
        [[2, 2, 16, 11], [22, 2, 16, 11]].forEach(([x, y, w, h]) => {
            const r = ns('rect');
            r.setAttribute('x', x); r.setAttribute('y', y);
            r.setAttribute('width', w); r.setAttribute('height', h);
            r.setAttribute('rx', '1'); r.setAttribute('fill', '#b5631a');
            pat.appendChild(r);
        });
        [[0, 15, 8, 11], [12, 15, 16, 11], [32, 15, 8, 11]].forEach(([x, y, w, h]) => {
            const r = ns('rect');
            r.setAttribute('x', x); r.setAttribute('y', y);
            r.setAttribute('width', w); r.setAttribute('height', h);
            r.setAttribute('rx', '1'); r.setAttribute('fill', '#b5631a');
            pat.appendChild(r);
        });
    }
    defs.appendChild(pat);
    svg.appendChild(defs);

    if (fillMode) {
        // Build smooth CLOSED polygon (catmull-rom via Q beziers)
        const n = points.length;
        const px = i => points[i % n].x - minX + pad;
        const py = i => points[i % n].y - minY + pad;
        const mx0 = (px(n - 1) + px(0)) / 2, my0 = (py(n - 1) + py(0)) / 2;
        let d = `M ${mx0.toFixed(1)} ${my0.toFixed(1)}`;
        for (let i = 0; i < n; i++) {
            const nx_ = (px(i) + px(i + 1)) / 2, ny_ = (py(i) + py(i + 1)) / 2;
            d += ` Q ${px(i).toFixed(1)} ${py(i).toFixed(1)} ${nx_.toFixed(1)} ${ny_.toFixed(1)}`;
        }
        d += ' Z';

        // Shadow
        const shadow = ns('path');
        shadow.setAttribute('d', d); shadow.setAttribute('fill', 'rgba(0,0,0,0.2)');
        shadow.setAttribute('stroke', 'none'); shadow.setAttribute('transform', 'translate(3,3)');
        svg.appendChild(shadow);

        if (isRealImage) {
            // Mirror-tile pattern — 2×2 reflected grid, seamless at any scale
            const tilePatId = `brickMirror${item.dataset.id}`;
            const tileW = 150, tileH = 100;
            const tilePat = ns('pattern');
            tilePat.id = tilePatId;
            tilePat.setAttribute('patternUnits', 'userSpaceOnUse');
            tilePat.setAttribute('width', tileW * 2); tilePat.setAttribute('height', tileH * 2);
            [
                null,
                `translate(${tileW * 2},0) scale(-1,1)`,
                `translate(0,${tileH * 2}) scale(1,-1)`,
                `translate(${tileW * 2},${tileH * 2}) scale(-1,-1)`,
            ].forEach(transform => {
                const img = ns('image');
                img.setAttribute('href', imageUrl);
                img.setAttribute('x', '0'); img.setAttribute('y', '0');
                img.setAttribute('width', tileW); img.setAttribute('height', tileH);
                img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
                if (transform) img.setAttribute('transform', transform);
                tilePat.appendChild(img);
            });
            defs.appendChild(tilePat);

            const fill = ns('path');
            fill.setAttribute('d', d); fill.setAttribute('fill', `url(#${tilePatId})`);
            fill.setAttribute('stroke', 'none');
            svg.appendChild(fill);
        } else {
            // SVG brick pattern fallback
            const fill = ns('path');
            fill.setAttribute('d', d); fill.setAttribute('fill', `url(#${patId})`);
            fill.setAttribute('stroke', 'none');
            svg.appendChild(fill);
        }

        // Border on top
        const border = ns('path');
        border.setAttribute('d', d); border.setAttribute('fill', 'none');
        border.setAttribute('stroke', '#7a3f10'); border.setAttribute('stroke-width', '2.5');
        border.setAttribute('stroke-linejoin', 'round'); border.setAttribute('data-measure', 'true');
        svg.appendChild(border);
    } else {
        // Legacy stroke mode (default 3-point path from sidebar click)
        let d = `M ${points[0].x - minX + pad} ${points[0].y - minY + pad}`;
        for (let i = 1; i < points.length; i++) {
            const cx2 = points[i].x - minX + pad, cy2 = points[i].y - minY + pad;
            if (i === points.length - 1) { d += ` L ${cx2} ${cy2}`; }
            else {
                const nx = points[i+1].x - minX + pad, ny = points[i+1].y - minY + pad;
                d += ` Q ${cx2} ${cy2} ${(cx2+nx)/2} ${(cy2+ny)/2}`;
            }
        }
        const shadow = ns('path');
        shadow.setAttribute('d', d); shadow.setAttribute('stroke', 'rgba(0,0,0,0.28)');
        shadow.setAttribute('stroke-width', pathWidth + 4); shadow.setAttribute('stroke-linecap', 'round');
        shadow.setAttribute('stroke-linejoin', 'round'); shadow.setAttribute('fill', 'none');
        svg.appendChild(shadow);
        const brickPath = ns('path');
        brickPath.setAttribute('d', d); brickPath.setAttribute('stroke', `url(#${patId})`);
        brickPath.setAttribute('stroke-width', pathWidth); brickPath.setAttribute('stroke-linecap', 'round');
        brickPath.setAttribute('stroke-linejoin', 'round'); brickPath.setAttribute('fill', 'none');
        brickPath.setAttribute('opacity', '0.95'); brickPath.setAttribute('data-measure', 'true');
        svg.appendChild(brickPath);
    }
}

// Filled polygon for non-brick path types (stone, gravel, wood chips, etc.)
function applyGenericPathFillShape(item) {
    const points = JSON.parse(item.dataset.pathPoints || '[]');
    if (points.length < 3) return;

    let svg = item.querySelector('svg.path-svg');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('path-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        item.appendChild(svg);
    }

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const pad = 4;
    const W = Math.max(1, maxX - minX + pad * 2), H = Math.max(1, maxY - minY + pad * 2);

    item.style.left = (minX - pad) + 'px'; item.style.top = (minY - pad) + 'px';
    item.style.width = W + 'px'; item.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.innerHTML = '';

    const name = (item.dataset.name || '').toLowerCase();
    let fillColor = '#a0826d', strokeColor = '#7a5c3a';
    if (name.includes('stone') || name.includes('cobble') || name.includes('paver')) { fillColor = '#9e9e9e'; strokeColor = '#616161'; }
    else if (name.includes('wood') || name.includes('chip')) { fillColor = '#8d6038'; strokeColor = '#5d3c1e'; }
    else if (name.includes('gravel') || name.includes('pea')) { fillColor = '#bcaaa4'; strokeColor = '#795548'; }

    const imageUrl    = item.dataset.imageUrl || '';
    const isRealImage = /^(https?:|\/|data:|blob:)/.test(imageUrl);

    const NS = 'http://www.w3.org/2000/svg';
    const gns = tag => document.createElementNS(NS, tag);

    const n = points.length;
    const px = i => points[i % n].x - minX + pad;
    const py = i => points[i % n].y - minY + pad;
    const mx0 = (px(n - 1) + px(0)) / 2, my0 = (py(n - 1) + py(0)) / 2;
    let d = `M ${mx0.toFixed(1)} ${my0.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
        const nx_ = (px(i) + px(i + 1)) / 2, ny_ = (py(i) + py(i + 1)) / 2;
        d += ` Q ${px(i).toFixed(1)} ${py(i).toFixed(1)} ${nx_.toFixed(1)} ${ny_.toFixed(1)}`;
    }
    d += ' Z';

    const shadow = gns('path');
    shadow.setAttribute('d', d); shadow.setAttribute('fill', 'rgba(0,0,0,0.15)');
    shadow.setAttribute('transform', 'translate(3,3)');
    svg.appendChild(shadow);

    if (isRealImage) {
        // Mirror-tile pattern — seamless at any scale
        const tilePatId = `genericMirror${item.dataset.id}`;
        const tileSize  = 150;
        const defs      = gns('defs');
        const tilePat   = gns('pattern');
        tilePat.id = tilePatId;
        tilePat.setAttribute('patternUnits', 'userSpaceOnUse');
        tilePat.setAttribute('width', tileSize * 2); tilePat.setAttribute('height', tileSize * 2);
        [
            null,
            `translate(${tileSize * 2},0) scale(-1,1)`,
            `translate(0,${tileSize * 2}) scale(1,-1)`,
            `translate(${tileSize * 2},${tileSize * 2}) scale(-1,-1)`,
        ].forEach(transform => {
            const img = gns('image');
            img.setAttribute('href', imageUrl);
            img.setAttribute('x', '0'); img.setAttribute('y', '0');
            img.setAttribute('width', tileSize); img.setAttribute('height', tileSize);
            img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
            if (transform) img.setAttribute('transform', transform);
            tilePat.appendChild(img);
        });
        defs.appendChild(tilePat);
        svg.appendChild(defs);

        const fill = gns('path');
        fill.setAttribute('d', d); fill.setAttribute('fill', `url(#${tilePatId})`);
        fill.setAttribute('stroke', 'none');
        svg.appendChild(fill);
    } else {
        const fill = gns('path');
        fill.setAttribute('d', d); fill.setAttribute('fill', fillColor);
        fill.setAttribute('fill-opacity', '0.9');
        svg.appendChild(fill);
    }

    // Border on top
    const border = gns('path');
    border.setAttribute('d', d); border.setAttribute('fill', 'none');
    border.setAttribute('stroke', strokeColor); border.setAttribute('stroke-width', '2.5');
    border.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(border);
}

function addPathPoint(clientX, clientY) {
    if (!selectedItem || !selectedItem.dataset.pathPoints) return;
    const rect = document.getElementById('designCanvas').getBoundingClientRect();
    const pts  = JSON.parse(selectedItem.dataset.pathPoints);
    pts.push({ id: dotIdCounter++, x: clientX - rect.left, y: clientY - rect.top });
    selectedItem.dataset.pathPoints = JSON.stringify(pts);
    createPathControls(selectedItem);
}

window.changePathWidth = function(itemId, delta) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    item.dataset.pathWidth = Math.max(10, Math.min(120, parseInt(item.dataset.pathWidth || 40) + delta));
    applyPathShape(item);
    updateMaterialsList();
};
window.resetPath = function(itemId) {
    const item = document.querySelector(`[data-id="${itemId}"]`);
    if (!item) return;
    const pts = JSON.parse(item.dataset.pathPoints);
    const sx = pts[0].x, sy = pts[0].y;
    item.dataset.pathPoints = JSON.stringify([
        { id: pts[0].id,  x: sx,       y: sy },
        { id: pts[1]?.id ?? dotIdCounter++, x: sx + 100, y: sy },
        { id: pts[2]?.id ?? dotIdCounter++, x: sx + 200, y: sy },
    ]);
    createPathControls(item);
};

// ── Checkout ──────────────────────────────────────────────────────────────────
function checkUserStatus() {
    const user  = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    const badge = document.querySelector('.user-badge');
    if (badge) badge.textContent = user.loggedIn ? `👤 ${user.name || 'User'}` : '👤 Guest';
}

function setupCheckoutButtons() {
    const btn = document.getElementById('checkoutMainBtn');
    if (!btn) return;
    btn.addEventListener('click', async e => {
        e.preventDefault(); e.stopPropagation();
        if (!placedItems.length) { alert('⚠️ Please add items to your design first!'); return; }
        const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        if (!user.loggedIn) {
            if (confirm('⚠️ Please sign in to proceed.\n\nGo to login page?')) { try { saveDesign(); } catch(ex){} window.location.href = 'login.html'; }
            return;
        }
        try { saveDesign(); } catch(ex){}
        btn.disabled = true;
        btn.textContent = 'Capturing design...';
        await submitDesignForCheckout();
        btn.disabled = false;
        btn.textContent = 'Proceed to Checkout →';
    });
}

async function submitDesignForCheckout() {
    const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!user.loggedIn || !user.email) { alert('⚠️ Please sign in'); return; }
    if (!placedItems.length) { alert('⚠️ Add items first'); return; }

    // Hide control panels and dots before screenshot
    document.querySelectorAll('.control-panel, .poly-dot, .corner-handle, .mesh-dot').forEach(el => el.style.visibility = 'hidden');

    let designScreenshot = null;
    try {
        const canvasEl = document.getElementById('designCanvas');
        const captured = await html2canvas(canvasEl, {
            useCORS: true,
            allowTaint: false,
            scale: 0.5,
            logging: false,
        });
        designScreenshot = captured.toDataURL('image/jpeg', 0.7);
    } catch (e) {
        console.warn('Screenshot failed:', e);
    }

    // Restore visibility
    document.querySelectorAll('.control-panel, .poly-dot, .corner-handle, .mesh-dot').forEach(el => el.style.visibility = '');

    const width  = document.getElementById('width')?.value  || 'Not specified';
    const height = document.getElementById('height')?.value || 'Not specified';
    const depth  = document.getElementById('depth')?.value  || 'Not specified';

    // Mirror updateMaterialsList pricing: hardscapes per ton, grass per sqft
    const checkoutItems  = [];
    const coverageGroups = {};
    const regularGroups  = {};
    placedItems.forEach(item => {
        const sfPerTon  = getCoverageRate(item.name);
        const isPerSqft = isGrassItem(item.name, item.category);
        if (sfPerTon !== undefined) {
            if (!coverageGroups[item.name]) coverageGroups[item.name] = { name: item.name, basePricePerUnit: item.price || 0, sfPerUnit: sfPerTon, totalSqFt: 0 };
            const sqFt = getItemSqFt(item);
            if (sqFt) coverageGroups[item.name].totalSqFt += sqFt;
        } else if (isPerSqft) {
            if (!coverageGroups[item.name]) coverageGroups[item.name] = { name: item.name, basePricePerUnit: item.price || 0, sfPerUnit: 1, totalSqFt: 0 };
            const sqFt = getItemSqFt(item);
            if (sqFt) coverageGroups[item.name].totalSqFt += sqFt;
        } else if (isBrickPath(item.name, item.category)) {
            const info = getBrickPathInfo(item);
            const itemCost = (info && !info.noScale && info.cost) ? info.cost : (item.price || 0);
            const bricks   = (info && !info.noScale && info.brickCount) ? info.brickCount : 1;
            const brickProd = Object.values(productRegistry).find(p => p.name === item.name);
            checkoutItems.push({ name: `${item.name} (${bricks.toLocaleString()} bricks)`, price: parseFloat(itemCost.toFixed(2)), size: brickProd?.size || '' });
        } else {
            if (!regularGroups[item.name]) {
                const prod = Object.values(productRegistry).find(p => p.name === item.name);
                regularGroups[item.name] = { name: item.name, price: item.price || 0, count: 0, size: prod?.size || '' };
            }
            regularGroups[item.name].count++;
        }
    });

    // Coverage items (hardscapes + grass): area-computed when polygon drawn, unit price fallback
    Object.values(coverageGroups).forEach(g => {
        const coverProd = Object.values(productRegistry).find(p => p.name === g.name);
        const coverSize = coverProd?.size || '';
        const isTonBased = g.sfPerUnit > 1; // grass=1 sqft/unit; hardscapes=70-130 sqft/ton
        if (g.sfPerUnit > 0 && g.totalSqFt > 0) {
            const units = g.totalSqFt / g.sfPerUnit;
            checkoutItems.push({ name: g.name, price: parseFloat((units * g.basePricePerUnit).toFixed(2)), size: coverSize, tons: isTonBased ? parseFloat(units.toFixed(3)) : 0 });
        } else {
            const count = placedItems.filter(i => i.name === g.name).length;
            const unitPrice = parseFloat(g.basePricePerUnit) || 0;
            for (let c = 0; c < count; c++) checkoutItems.push({ name: g.name, price: unitPrice, size: coverSize, tons: 0 });
        }
    });
    // Regular items: individual entries so checkout can display qty × unit price
    Object.values(regularGroups).forEach(g => {
        const unitPrice = parseFloat(g.price) || 0;
        for (let c = 0; c < g.count; c++) checkoutItems.push({ name: g.name, price: unitPrice, size: g.size || '' });
    });
    // Compute total directly from checkoutItems so it's always consistent with actual prices
    const total = parseFloat(checkoutItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0).toFixed(2));

    try {
        // Pass items + total to checkout page
        localStorage.setItem('gardiyCheckout', JSON.stringify({ items: checkoutItems, total }));
        if (designScreenshot) localStorage.setItem('gardiyDesignScreenshot', designScreenshot);

        // Save submission to MongoDB (fire-and-forget — don't block redirect)
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        fetch('https://gardiy-backend-production.up.railway.app/api/designs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(session.token ? { 'Authorization': `Bearer ${session.token}` } : {})
            },
            body: JSON.stringify({
                userId: session.id || session.email || 'guest',
                designName: `${session.name || 'Customer'} – ${new Date().toLocaleDateString()}`,
                items: checkoutItems,
                totalCost: total,
                landscapeImageData: designScreenshot,
            })
        }).catch(() => {});

        placedItems = []; updateMaterialsList(); saveDesign();
        window.location.href = 'checkout.html';
    } catch (e) { alert('⚠️ Storage error. Try clearing browser storage.'); }
}

// ── Styles ────────────────────────────────────────────────────────────────────
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
    .draggable-item.selected { outline:2px dashed #667eea; outline-offset:3px; }

    .poly-dot {
        transition: transform 0.1s, background 0.1s;
    }
    .poly-dot:hover {
        transform: translate(-50%,-50%) scale(1.5) !important;
        background: #667eea !important;
        border-color: white !important;
    }

    .corner-handle {
        transition: transform 0.1s, background 0.1s;
    }
    .corner-handle:hover {
        transform: translate(-50%,-50%) scale(1.4) !important;
        background: #667eea !important;
        border-color: white !important;
    }

    .mesh-dot { transition: transform 0.1s; }
    .mesh-dot:hover { transform:translate(-50%,-50%) scale(1.5) !important; background:#ff8c42 !important; }

    .product-item.drawing-active {
        background: #fff7ed !important;
        border: 2px solid #b5631a !important;
        box-shadow: 0 0 0 3px rgba(181,99,26,0.18);
    }

    .control-panel {
        position:absolute; display:flex; gap:6px; align-items:center;
        background:white; padding:6px 10px; border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,0.15); z-index:9998; pointer-events:auto;
    }
    .control-btn {
        width:34px; height:34px; border:none; border-radius:8px;
        background:#f7fafc; cursor:pointer; font-size:16px;
        display:flex; align-items:center; justify-content:center; transition:all 0.15s;
    }
    .control-btn:hover { background:#e2e8f0; transform:translateY(-2px); }
    .control-btn.delete-btn:hover { background:#fee; color:#e53e3e; }

    .rotate-handle-wrapper {
        position:absolute; bottom:-52px; top:auto; left:50%;
        transform:translateX(-50%);
        display:flex; flex-direction:column; align-items:center;
        pointer-events:none; z-index:9999;
    }
    .rotate-handle-stem {
        width:2px; height:20px;
        background:rgba(102,126,234,0.7);
        pointer-events:none;
    }
    .rotate-handle {
        width:28px; height:28px; border-radius:50%;
        background:linear-gradient(135deg,#667eea,#764ba2);
        cursor:grab; display:flex; align-items:center; justify-content:center;
        color:white; font-size:15px;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        pointer-events:auto; user-select:none;
    }
    .rotate-handle:active { cursor:grabbing; }

    /* Mobile drag handle — hidden on desktop, shown on mobile via media query */
    .mobile-drag-handle {
        display: none;
        position: absolute;
        bottom: -12px;
        left: -12px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        font-size: 13px;
        align-items: center;
        justify-content: center;
        z-index: 9998;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        user-select: none;
        touch-action: none;
        cursor: grab;
        transition: transform 0.15s, box-shadow 0.15s;
    }
    .mobile-drag-handle.pressing {
        transform: scale(1.3);
        box-shadow: 0 0 0 4px rgba(102,126,234,0.35), 0 2px 6px rgba(0,0,0,0.3);
    }
    .mobile-drag-handle.active-drag {
        transform: scale(1.2);
        box-shadow: 0 0 0 4px rgba(102,126,234,0.5), 0 4px 12px rgba(0,0,0,0.25);
    }
    @media (max-width: 768px) {
        .mobile-drag-handle { display: flex; }
    }
` }));

// ── Plant recommendation color coding ─────────────────────────────────────────
// Maps AI-returned plant name keywords → generic product names in the sidebar
const PLANT_KEYWORD_MAP = [
    { keys: ['spruce','pine','oak','maple','elm','birch','willow','ash','fir','cedar','cottonwood','aspen','larch','juniper','conifer','evergreen','deciduous'], products: ['tree','deciduous tree'] },
    { keys: ['palm','tropical','banana','ficus','hibiscus'], products: ['palm tree'] },
    { keys: ['cactus','succulent','agave','yucca','aloe','opuntia'], products: ['cactus'] },
    { keys: ['rose','rosa'], products: ['rose'] },
    { keys: ['sunflower','helianthus'], products: ['sunflower'] },
    { keys: ['tulip','daffodil','crocus','hyacinth','bulb'], products: ['tulip'] },
    { keys: ['cherry','blossom','ornamental cherry','prunus'], products: ['cherry blossom'] },
    { keys: ['lavender','sage','thyme','oregano','herb','perennial','annual','columbine','yarrow','coneflower','echinacea','black-eyed','daisy','zinnia','marigold','petunia','impatiens','salvia','aster','sedum'], products: ['small plant','potted plant'] },
    { keys: ['shrub','bush','boxwood','lilac','forsythia','spirea','viburnum','potentilla'], products: ['small plant','potted plant'] },
    { keys: ['grass','lawn','turf','sod','bluegrass','fescue','buffalo grass','zoysia','bermuda','ryegrass','dropseed'], products: ['lawn','grass field'] },
];

function matchRecsToProducts(recList, productName) {
    const name = productName.toLowerCase();
    return recList.some(r => {
        const rl = r.toLowerCase();
        // direct substring match
        if (name.includes(rl) || rl.includes(name)) return true;
        // keyword map: check if the rec string contains a keyword that maps to this product
        return PLANT_KEYWORD_MAP.some(entry =>
            entry.products.some(p => name.includes(p)) &&
            entry.keys.some(k => rl.includes(k))
        );
    });
}

function applyPlantRecommendationColors() {
    const recs = window.GarDIYStorage?.getRecommendations?.();
    if (!recs) return;

    const recommended    = (recs.recommended    || []);
    const notRecommended = (recs.notRecommended || []);
    if (!recommended.length && !notRecommended.length) return;

    const plantCategories = ['shrubs', 'trees', 'flowers'];
    let anyColored = false;

    document.querySelectorAll('.product-item').forEach(item => {
        const product = productRegistry[item.dataset.pid];
        if (!product || !plantCategories.includes((product.category || '').toLowerCase())) return;

        const name = product.name;

        const isRec    = matchRecsToProducts(recommended,    name);
        const isNotRec = !isRec && matchRecsToProducts(notRecommended, name);

        item.classList.remove('plant-recommended', 'plant-not-recommended');
        if (isRec) {
            item.classList.add('plant-recommended');
            anyColored = true;
        } else if (isNotRec) {
            item.classList.add('plant-not-recommended');
            anyColored = true;
        }
    });

    // Inject a legend into the sidebar when colors are active
    if (anyColored && !document.getElementById('plantLegend')) {
        const sidebar = document.querySelector('.design-sidebar');
        const h3 = sidebar?.querySelector('h3');
        if (h3) {
            const legend = document.createElement('div');
            legend.id        = 'plantLegend';
            legend.className = 'plant-legend';
            legend.innerHTML = `
                <span class="legend-item"><span class="legend-dot rec-dot"></span>Recommended</span>
                <span class="legend-item"><span class="legend-dot notrec-dot"></span>Not recommended</span>
                <span class="legend-item sun-legend">☀️ Full sun &nbsp; ⛅ Both &nbsp; ☁️ Shade</span>
            `;
            h3.insertAdjacentElement('afterend', legend);
        }
    }
}

// ── Freehand path drawing mode ────────────────────────────────────────────────

function enterPathDrawingMode(product, sidebarItem) {
    document.querySelectorAll('.product-item.drawing-active').forEach(el => el.classList.remove('drawing-active'));
    if (sidebarItem) sidebarItem.classList.add('drawing-active');

    drawingMode    = true;
    drawingProduct = product;
    drawingPoints  = [];
    isMouseDownDraw = false;

    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    deselectItem();

    // Transparent overlay captures all mouse events on the canvas
    drawingOverlay = document.createElement('div');
    drawingOverlay.style.cssText = 'position:absolute;inset:0;z-index:10000;cursor:crosshair;user-select:none;';
    canvas.appendChild(drawingOverlay);

    drawingOverlay.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        isMouseDownDraw = true;
        drawingPoints   = [];
        const rect = canvas.getBoundingClientRect();
        drawingPoints.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });

        // Live preview SVG
        drawingPreviewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        drawingPreviewSvg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10001;overflow:visible;';
        canvas.appendChild(drawingPreviewSvg);
    });

    // Drawing hint banner
    let hint = document.getElementById('drawingModeHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'drawingModeHint';
        hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(181,99,26,0.92);color:white;padding:7px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:10002;pointer-events:none;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
        canvas.appendChild(hint);
    }
    hint.textContent = `✏️ Draw ${product.name} — click & drag, release to place  ·  Esc to cancel`;
    hint.style.display = 'block';
}

function exitPathDrawingMode() {
    drawingMode     = false;
    drawingProduct  = null;
    drawingPoints   = [];
    isMouseDownDraw = false;

    if (drawingOverlay)    { drawingOverlay.remove();    drawingOverlay    = null; }
    if (drawingPreviewSvg) { drawingPreviewSvg.remove(); drawingPreviewSvg = null; }

    const hint = document.getElementById('drawingModeHint');
    if (hint) hint.style.display = 'none';

    document.querySelectorAll('.product-item.drawing-active').forEach(el => el.classList.remove('drawing-active'));
}

function _updateDrawingPreview() {
    if (!drawingPreviewSvg || drawingPoints.length < 2) return;
    const pts = drawingPoints;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    drawingPreviewSvg.innerHTML = `
        <path d="${d}" stroke="#b5631a" stroke-width="3" fill="none"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="10 5" opacity="0.75"/>`;
}

async function _finishDrawingPath(simplifiedPts) {
    const p = drawingProduct;
    if (!p) return;
    const data = { name: p.name, image: p.image, type: p.type, category: p.category, price: parseFloat(p.price) };

    await addItemToCanvas(data, simplifiedPts[0].x, simplifiedPts[0].y);

    const newItem = document.querySelector(`[data-id="${itemIdCounter - 1}"]`);
    if (!newItem) return;

    // Auto-close: if last point is far from first, connect them to seal the area
    const pts   = [...simplifiedPts];
    const first = pts[0], last = pts[pts.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) > 30) {
        pts.push({ x: first.x, y: first.y });
    }

    newItem.dataset.pathPoints = JSON.stringify(pts.map(pt => ({ id: dotIdCounter++, x: pt.x, y: pt.y })));
    newItem.dataset.pathFill   = 'true'; // render as filled area, not stroke

    applyPathShape(newItem);
    if (newItem === selectedItem) createPathControls(newItem);
    updateMaterialsList();
}

// Escape key cancels drawing mode
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawingMode) exitPathDrawingMode();
});

// ── Auto Design ──────────────────────────────────────────────────────────────

const AUTO_DESIGN_STYLES = {
    california_coastal: {
        key:   'california_coastal',
        icon:  '🌊',
        name:  'California Coastal',
        desc:  'Drought-tolerant plants, ornamental grasses, stone paths',
    },
    mediterranean: {
        key:   'mediterranean',
        icon:  '🫒',
        name:  'Mediterranean',
        desc:  'Lavender, roses, stone pavers, terracotta pots, fountain',
    },
    japanese: {
        key:   'japanese',
        icon:  '⛩️',
        name:  'Japanese Garden',
        desc:  'Cherry blossoms, stone paths, minimalist & serene',
    },
};

let autoDesignSelectedStyle = null;

function openAutoDesignModal() {
    if (document.getElementById('autoDesignModal')) {
        document.getElementById('autoDesignModal').style.display = 'flex';
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'autoDesignModal';
    modal.className = 'ad-overlay';
    modal.innerHTML = `
        <div class="ad-modal">
            <button class="ad-close" onclick="closeAutoDesignModal()">×</button>
            <div class="ad-header">
                <h2>✨ Auto Design</h2>
                <p>Choose a style — AI will design your yard using your available products.</p>
            </div>
            <div class="ad-cards">
                ${Object.values(AUTO_DESIGN_STYLES).map(s => `
                <div class="ad-card" data-style="${s.key}" onclick="selectAutoStyle(this)">
                    <div class="ad-card-icon">${s.icon}</div>
                    <div class="ad-card-name">${s.name}</div>
                    <div class="ad-card-desc">${s.desc}</div>
                </div>`).join('')}
            </div>
            <button class="ad-generate-btn" id="adGenerateBtn" disabled onclick="runAutoDesign()">
                Choose a style to generate
            </button>
        </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) closeAutoDesignModal(); });
    document.body.appendChild(modal);
}

function closeAutoDesignModal() {
    const m = document.getElementById('autoDesignModal');
    if (m) m.style.display = 'none';
}

function selectAutoStyle(card) {
    document.querySelectorAll('.ad-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    autoDesignSelectedStyle = card.dataset.style;
    const btn = document.getElementById('adGenerateBtn');
    if (btn) {
        btn.disabled = false;
        btn.textContent = `Generate ${AUTO_DESIGN_STYLES[autoDesignSelectedStyle].name} Design`;
    }
}

async function runAutoDesign() {
    if (!autoDesignSelectedStyle) return;
    const btn = document.getElementById('adGenerateBtn');
    if (btn) { btn.disabled = true; btn.textContent = '🎨 Generating…'; }

    const imageData = window.GarDIYStorage?.getImage();
    if (!imageData) {
        alert('No landscape photo found — please upload a photo first.');
        if (btn) { btn.disabled = false; btn.textContent = 'Generate Design'; }
        return;
    }

    // Only send plant/tree/flower/rocks/path categories to the AI
    const ALLOWED_FOR_AD = new Set(['shrubs', 'trees', 'flowers', 'rocks_pavers', 'paths']);
    const products = Object.values(productRegistry)
        .filter(p => ALLOWED_FOR_AD.has((p.category || '').toLowerCase()))
        .map(p => ({ name: p.name, category: p.category }));

    try {
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const headers = { 'Content-Type': 'application/json' };
        if (session.token) headers['Authorization'] = 'Bearer ' + session.token;

        const res = await fetch('https://gardiy-backend-production.up.railway.app/api/auto-design', {
            method: 'POST',
            headers,
            body: JSON.stringify({ imageData, style: autoDesignSelectedStyle, products }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Auto-design failed');

        closeAutoDesignModal();
        await placeAutoDesignItems(data.items, AUTO_DESIGN_STYLES[autoDesignSelectedStyle].name);

    } catch (err) {
        alert('Auto-design error: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Generate Design'; }
    }
}

async function placeAutoDesignItems(items, styleName) {
    // Clear current design first
    deselectItem();
    [...placedItems].forEach(pi => pi.element.remove());
    placedItems = []; saveDesign();
    removePolyDots();
    removeMeshDots();
    removeCornerHandles();
    removeControlPanel();

    const canvas = document.getElementById('designCanvas');
    if (!canvas) return;

    // Canvas loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'adCanvasOverlay';
    overlay.innerHTML = `<span style="font-size:2rem;">✨</span><span style="margin-top:0.4rem;font-size:0.95rem;font-weight:600;color:#065f46;">Designing your ${styleName} garden…</span>`;
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,0.82);backdrop-filter:blur(2px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:200;border-radius:inherit;gap:0.25rem;';
    canvas.appendChild(overlay);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const allProducts = Object.values(productRegistry);

    for (const item of items) {
        const product = allProducts.find(p => p.name.toLowerCase() === (item.name || '').toLowerCase());
        if (!product) { console.warn('Auto-design: product not found:', item.name); continue; }

        const itemW = Math.round(Math.max(40, (item.w || 0.08) * W));
        const itemH = Math.round(Math.max(40, (item.h || 0.08) * H));
        // x/y from AI is the item center; convert to top-left for canvas
        const x = Math.max(0, Math.min(W - itemW, ((item.x || 0.5) * W) - itemW / 2));
        const y = Math.max(0, Math.min(H - itemH, ((item.y || 0.5) * H) - itemH / 2));

        await addItemToCanvas({
            name:     product.name,
            image:    product.image,
            type:     product.type,
            category: product.category,
            price:    parseFloat(product.price) || 0,
            _price:   parseFloat(product.price) || 0,
            _skipHistory: true,
        }, x, y, itemW, itemH);

        await new Promise(r => setTimeout(r, 120)); // progressive reveal
    }

    overlay.remove();
    deselectItem();
    updateMaterialsList();
}


// ── Enhance Design ────────────────────────────────────────────────────────────
(function setupEnhanceDesign() {
    const btn = document.getElementById('enhanceDesignBtn');
    if (!btn) return;
    btn.addEventListener('click', enhanceDesign);
})();

async function enhanceDesign() {
    const btn = document.getElementById('enhanceDesignBtn');
    const canvas = document.getElementById('designCanvas');
    const canvasImage = document.getElementById('canvasImage');

    if (!canvasImage || !canvasImage.src || canvasImage.src === window.location.href) {
        alert('Please upload a photo first before enhancing.');
        return;
    }
    if (btn.disabled) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="enhance-btn-spinner"></span> Enhancing…';

    // Show loading modal immediately so user sees progress
    _showEnhanceLoading();

    try {
        // Capture canvas at up to 2× devicePixelRatio for quality
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const shot  = await html2canvas(canvas, {
            useCORS: true, allowTaint: false,
            scale, logging: false,
            backgroundColor: null,
        });

        // Compress to JPEG (large base64 = slow upload, 0.82 quality is fine)
        const base64 = shot.toDataURL('image/jpeg', 0.82).split(',')[1];
        const originalDataUrl = shot.toDataURL('image/jpeg', 0.82);

        const BACKEND = 'https://gardiy-backend-production.up.railway.app';
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const headers = { 'Content-Type': 'application/json' };
        if (session.token) headers['Authorization'] = 'Bearer ' + session.token;

        const res  = await fetch(`${BACKEND}/api/enhance-design`, {
            method: 'POST', headers,
            body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Enhancement failed');

        const enhancedDataUrl = `data:${data.mimeType || 'image/jpeg'};base64,${data.imageBase64}`;
        _showEnhanceResult(originalDataUrl, enhancedDataUrl);

    } catch (err) {
        console.error('Enhance error:', err);
        _closeEnhanceModal();
        alert('Enhancement failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '✨ Enhance Design';
    }
}

function _showEnhanceLoading() {
    _closeEnhanceModal();
    const modal = document.createElement('div');
    modal.id = '_enhanceModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:3rem 2.5rem;text-align:center;max-width:380px;width:100%;box-shadow:0 24px 80px rgba(0,0,0,0.4);">
            <div style="font-size:3rem;margin-bottom:1rem;">✨</div>
            <h2 style="margin:0 0 0.5rem;color:#1a202c;font-size:1.3rem;">Enhancing Your Design</h2>
            <p style="color:#718096;margin:0 0 1.5rem;font-size:14px;line-height:1.6;">AI is improving realism, lighting, blending,<br>and shadows — this takes ~30 seconds</p>
            <div class="enhance-progress-bar"><div class="enhance-progress-fill"></div></div>
            <p style="font-size:11px;color:#a0aec0;margin-top:0.75rem;">Please wait…</p>
        </div>`;
    document.body.appendChild(modal);
}

function _showEnhanceResult(originalSrc, enhancedSrc) {
    _closeEnhanceModal();
    // Store for download — avoid putting huge base64 in onclick attribute
    window._gardiyEnhancedSrc  = enhancedSrc;
    window._gardiyOriginalSrc  = originalSrc;

    const modal = document.createElement('div');
    modal.id = '_enhanceModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;z-index:99999;padding:12px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:1.5rem;max-width:960px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.4);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem;">
                <h2 style="margin:0;color:#1a202c;font-size:1.2rem;">✨ Enhanced Design</h2>
                <button id="_enhCloseBtn" style="background:none;border:none;font-size:1.6rem;cursor:pointer;color:#9ca3af;line-height:1;padding:2px 6px;">×</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1.1rem;">
                <div>
                    <p style="font-size:11px;font-weight:700;color:#9ca3af;margin:0 0 5px;text-transform:uppercase;letter-spacing:0.06em;">Original</p>
                    <img id="_enhOrigImg" style="width:100%;border-radius:10px;border:1px solid #e5e7eb;display:block;">
                </div>
                <div>
                    <p style="font-size:11px;font-weight:700;color:#8b5cf6;margin:0 0 5px;text-transform:uppercase;letter-spacing:0.06em;">✨ Enhanced</p>
                    <img id="_enhNewImg" style="width:100%;border-radius:10px;border:2px solid #8b5cf6;display:block;">
                </div>
            </div>
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;flex-wrap:wrap;">
                <button id="_enhCancelBtn" style="padding:10px 22px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;">Close</button>
                <button id="_enhDownloadBtn" style="padding:10px 22px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:700;font-size:14px;">⬇ Download Enhanced</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    // Set large image srcs after appending (avoids huge inline HTML string)
    document.getElementById('_enhOrigImg').src = originalSrc;
    document.getElementById('_enhNewImg').src  = enhancedSrc;

    document.getElementById('_enhCloseBtn').addEventListener('click', _closeEnhanceModal);
    document.getElementById('_enhCancelBtn').addEventListener('click', _closeEnhanceModal);
    document.getElementById('_enhDownloadBtn').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = window._gardiyEnhancedSrc;
        a.download = 'gardiy-enhanced-design.jpg';
        a.click();
    });
    modal.addEventListener('click', e => { if (e.target === modal) _closeEnhanceModal(); });
}

function _closeEnhanceModal() {
    document.getElementById('_enhanceModal')?.remove();
}

console.log('✅ Design page ready');
