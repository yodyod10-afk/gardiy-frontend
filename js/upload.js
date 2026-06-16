// Upload & Analysis Page JavaScript

// DOM element references
let uploadArea, uploadBtn, fileInput, uploadSection, analysisSection;
let previewImage, photoPreview, scanOverlay;
let changePhotoBtn, backToUploadBtn, analysisLoading, analysisResults;
let startDesignBtn;
let locationForm, zipCodeInput;
let analyzeBtn;
let exifStatusBanner, exifStatusText;
let zipBadge;

// ── Polygon tool state ────────────────────────────────────────────────────────
let _polyPoints = [];    // [{x,y}] normalized 0–1 relative to rendered image
let _polyActive = false; // drawing mode on
let _polyClosed = false; // polygon completed
let _polyCanvas = null;
let _polyCtx    = null;
let _polyMouse  = null;  // last mouse position in canvas internal pixels

document.addEventListener('DOMContentLoaded', function () {
    console.log('✅ Upload page loaded');

    // Require sign-in before allowing any scanning
    const currentUser = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
    if (!currentUser.loggedIn) {
        showSignInGate();
        return;
    }

    uploadArea       = document.getElementById('uploadArea');
    uploadBtn        = document.getElementById('uploadBtn');
    fileInput        = document.getElementById('fileInput');
    uploadSection    = document.getElementById('uploadSection');
    analysisSection  = document.getElementById('analysisSection');
    previewImage     = document.getElementById('previewImage');
    photoPreview     = document.getElementById('photoPreview');
    scanOverlay      = document.getElementById('scanOverlay');
    changePhotoBtn   = document.getElementById('changePhotoBtn');
    backToUploadBtn  = document.getElementById('backToUploadBtn');
    analysisLoading  = document.getElementById('analysisLoading');
    analysisResults  = document.getElementById('analysisResults');
    startDesignBtn   = document.getElementById('startDesignBtn');
    locationForm     = document.getElementById('locationForm');
    zipCodeInput     = document.getElementById('zipCodeInput');
    analyzeBtn       = document.getElementById('analyzeBtn');
    exifStatusBanner = document.getElementById('exifStatusBanner');
    exifStatusText   = document.getElementById('exifStatusText');
    zipBadge         = document.getElementById('zipBadge');

    setupEventListeners();
    checkForSavedData();
});

// ── Event listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
    uploadBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.value = ''; fileInput.click(); });
    uploadArea.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });

    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.style.borderColor = '#059669';
        uploadArea.style.background  = '#f0fdf4';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#10b981';
        uploadArea.style.background  = 'white';
    });
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.style.borderColor = '#10b981';
        uploadArea.style.background  = 'white';
        if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });

    changePhotoBtn.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });

    backToUploadBtn.addEventListener('click', () => {
        analysisSection.style.display = 'none';
        uploadSection.style.display   = 'block';
        resetLocationForm();
        resetLoadingSteps();
        window.scrollTo(0, 0);
    });

    if (analyzeBtn) analyzeBtn.addEventListener('click', () => analyzeWithLocation());

    const demoBtn = document.getElementById('demoGardenBtn');
    if (demoBtn) demoBtn.addEventListener('click', e => { e.stopPropagation(); handleDemoGarden(); });

    // Polygon tool buttons
    document.getElementById('polyToggleBtn')?.addEventListener('click', enablePolygonMode);
    document.getElementById('polyCancelBtn')?.addEventListener('click', disablePolygonMode);
    document.getElementById('polyClearBtn')?.addEventListener('click', () => {
        _polyPoints = [];
        _polyClosed = false;
        _polyMouse  = null;
        if (_polyCanvas) { _polyCanvas.style.pointerEvents = 'auto'; _polyCanvas.style.cursor = 'crosshair'; }
        const inst = document.getElementById('polyInstructions');
        if (inst) inst.textContent = 'Click on the photo to place points. Click the first point to close.';
        document.getElementById('polyDoneMsg').style.display   = 'none';
        document.getElementById('polyRedrawBtn').style.display = 'none';
        drawPolyCanvas();
    });
    document.getElementById('polyRedrawBtn')?.addEventListener('click', () => {
        _polyPoints = [];
        _polyClosed = false;
        _polyActive = true;
        _polyMouse  = null;
        if (_polyCanvas) { _polyCanvas.style.pointerEvents = 'auto'; _polyCanvas.style.cursor = 'crosshair'; }
        document.getElementById('polyActiveControls').style.display = 'flex';
        document.getElementById('polyInstructions').textContent     = 'Click on the photo to place points. Click the first point to close.';
        document.getElementById('polyDoneMsg').style.display        = 'none';
        document.getElementById('polyRedrawBtn').style.display      = 'none';
        drawPolyCanvas();
    });

    if (startDesignBtn) {
        startDesignBtn.addEventListener('click', e => {
            e.preventDefault();
            if (!previewImage?.src) { alert('⚠️ Please upload a photo first'); return; }
            try { window.GarDIYStorage.saveImage(previewImage.src); } catch (err) {}
            // Clear active project so the design page shows the new photo
            // instead of auto-loading an old project that would overwrite it
            localStorage.removeItem('gardiyActiveProject');
            localStorage.removeItem('gardiyActiveProjectName');
            localStorage.removeItem('gardiyDesign');
            setTimeout(() => { window.location.href = 'design.html'; }, 100);
        });
    }
}

// ── Image compression ─────────────────────────────────────────────────────────
function compressImage(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const MAX = 1024;
                let w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else       { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ── EXIF extraction ───────────────────────────────────────────────────────────
function degreesToCompass(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

async function getZipFromCoords(lat, lon) {
    try {
        const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'User-Agent': 'GarDIY Landscaping App' } }
        );
        const data = await res.json();
        return data?.address?.postcode?.replace(/\s/g, '').slice(0, 10) || null;
    } catch {
        return null;
    }
}

async function extractExifData(file) {
    if (typeof exifr === 'undefined') { console.warn('exifr not loaded'); return null; }
    try {
        const exif = await exifr.parse(file, {
            gps: true, tiff: true, exif: true,
            pick: ['GPSImgDirection', 'DateTimeOriginal', 'CreateDate']
        });
        if (!exif) return null;

        const result = {};

        if (exif.GPSImgDirection != null) {
            result.direction = degreesToCompass(exif.GPSImgDirection);
        }

        const ts = exif.DateTimeOriginal || exif.CreateDate;
        if (ts instanceof Date && !isNaN(ts)) {
            result.timeOfDay = `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`;
        }

        if (exif.latitude != null && exif.longitude != null) {
            result._lat = exif.latitude;
            result._lon = exif.longitude;
        }

        return Object.keys(result).length ? result : null;
    } catch (err) {
        console.warn('EXIF extraction failed:', err.message);
        return null;
    }
}

// ── Sun exposure description ──────────────────────────────────────────────────
function describeSunExposure(direction, timeOfDay) {
    if (!direction && !timeOfDay) return null;

    const dirDesc = {
        N:  'north-facing (mostly shaded, receives little direct sun throughout the day)',
        NE: 'northeast-facing (receives morning sun, shaded by mid-afternoon)',
        E:  'east-facing (full morning sun, afternoon shade)',
        SE: 'southeast-facing (good morning sun through early afternoon)',
        S:  'south-facing (full sun for most of the day — highest sun exposure)',
        SW: 'southwest-facing (some morning light, full afternoon and evening sun)',
        W:  'west-facing (shaded in the morning, full afternoon and evening sun)',
        NW: 'northwest-facing (very limited direct sun, receives some late-day light)',
    };

    const parts = [];

    if (timeOfDay) {
        const [h, m] = timeOfDay.split(':').map(Number);
        const ampm = h < 12 ? 'AM' : 'PM';
        const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
        parts.push(`Photo taken at ${h12}:${String(m).padStart(2,'0')} ${ampm}`);
    }

    if (direction && dirDesc[direction]) {
        parts.push(`This is a ${dirDesc[direction]} area`);
    }

    return parts.join('. ') + '.';
}

// ── ZIP code → climate lookup (overrides AI climate analysis) ────────────────
function getClimateFromZip(zip) {
    const n = parseInt(zip, 10);
    if (!n || isNaN(n)) return null;
    if (n >= 80001 && n <= 81699) return { label: 'Semi-arid Continental (Colorado), Zone 5-6',     zone: 5 };
    if (n >= 82001 && n <= 83128) return { label: 'Semi-arid High Plains (Wyoming), Zone 4-5',       zone: 4 };
    if (n >= 83201 && n <= 83876) return { label: 'Semi-arid Continental (Idaho), Zone 5-7',         zone: 5 };
    if (n >= 84001 && n <= 84784) return { label: 'Semi-arid Continental (Utah), Zone 5-8',          zone: 6 };
    if (n >= 85001 && n <= 86556) return { label: 'Hot Desert (Arizona), Zone 8-10',                 zone: 9 };
    if (n >= 87001 && n <= 88441) return { label: 'Semi-arid Steppe (New Mexico), Zone 5-9',         zone: 7 };
    if (n >= 89001 && n <= 89883) return { label: 'Hot Desert (Nevada), Zone 7-10',                  zone: 8 };
    if (n >= 90001 && n <= 96162) return { label: 'Mediterranean / Coastal (California), Zone 9-11', zone: 9 };
    if (n >= 97001 && n <= 97920) return { label: 'Oceanic Marine (Oregon), Zone 7-9',               zone: 8 };
    if (n >= 98001 && n <= 99403) return { label: 'Oceanic Marine (Washington), Zone 7-9',           zone: 8 };
    if (n >= 99501 && n <= 99950) return { label: 'Subarctic (Alaska), Zone 1-4',                    zone: 2 };
    if (n >= 96701 && n <= 96898) return { label: 'Tropical (Hawaii), Zone 11-13',                   zone: 12 };
    if (n >= 75001 && n <= 79999) return { label: 'Humid Subtropical / Semi-arid (Texas), Zone 7-9', zone: 8 };
    if (n >= 70001 && n <= 71497) return { label: 'Humid Subtropical (Louisiana), Zone 8-9',         zone: 9 };
    if (n >= 32004 && n <= 34997) return { label: 'Humid Subtropical (Florida), Zone 9-11',          zone: 10 };
    if (n >= 30001 && n <= 31999) return { label: 'Humid Subtropical (Georgia), Zone 7-9',           zone: 8 };
    if (n >= 35001 && n <= 36925) return { label: 'Humid Subtropical (Alabama), Zone 7-9',           zone: 8 };
    if (n >= 27001 && n <= 28909) return { label: 'Humid Subtropical (North Carolina), Zone 6-8',    zone: 7 };
    if (n >= 29001 && n <= 29948) return { label: 'Humid Subtropical (South Carolina), Zone 7-9',    zone: 8 };
    if (n >= 23001 && n <= 24658) return { label: 'Humid Subtropical (Virginia), Zone 6-8',          zone: 7 };
    if (n >= 20001 && n <= 21930) return { label: 'Humid Subtropical (DC / Maryland), Zone 6-7',     zone: 7 };
    if (n >= 10001 && n <= 14975) return { label: 'Humid Continental (New York), Zone 5-7',          zone: 6 };
    if (n >= 6001  && n <= 6928)  return { label: 'Humid Continental (Connecticut), Zone 5-7',       zone: 6 };
    if (n >= 1001  && n <= 2791)  return { label: 'Humid Continental (New England), Zone 5-6',       zone: 5 };
    if (n >= 15001 && n <= 19640) return { label: 'Humid Continental (Pennsylvania), Zone 5-7',      zone: 6 };
    if (n >= 43001 && n <= 45999) return { label: 'Humid Continental (Ohio), Zone 5-6',              zone: 5 };
    if (n >= 46001 && n <= 47997) return { label: 'Humid Continental (Indiana), Zone 5-6',           zone: 5 };
    if (n >= 48001 && n <= 49971) return { label: 'Humid Continental (Michigan), Zone 4-6',          zone: 5 };
    if (n >= 53001 && n <= 54990) return { label: 'Humid Continental (Wisconsin), Zone 3-5',         zone: 4 };
    if (n >= 55001 && n <= 56763) return { label: 'Humid Continental (Minnesota), Zone 3-5',         zone: 4 };
    if (n >= 60001 && n <= 62999) return { label: 'Humid Continental (Illinois), Zone 5-6',          zone: 5 };
    if (n >= 50001 && n <= 52809) return { label: 'Humid Continental (Iowa), Zone 4-5',              zone: 5 };
    if (n >= 64001 && n <= 65899) return { label: 'Humid Continental (Missouri), Zone 5-7',          zone: 6 };
    if (n >= 66001 && n <= 67954) return { label: 'Semi-arid (Kansas), Zone 5-7',                    zone: 6 };
    if (n >= 68001 && n <= 69367) return { label: 'Semi-arid (Nebraska), Zone 4-6',                  zone: 5 };
    if (n >= 57001 && n <= 57799) return { label: 'Semi-arid (South Dakota), Zone 3-5',              zone: 4 };
    if (n >= 58001 && n <= 58856) return { label: 'Semi-arid (North Dakota), Zone 3-4',              zone: 3 };
    if (n >= 59001 && n <= 59937) return { label: 'Semi-arid Continental (Montana), Zone 3-6',       zone: 4 };
    return null;
}

// ── Fallback plant recommendations ───────────────────────────────────────────
// Used when backend does not return recommendedPlants / notRecommendedPlants
function generateFallbackRecommendations(analysis) {
    const sunlight = (analysis.sunlight || '').toLowerCase();
    const climate  = (analysis.climate  || '').toLowerCase();

    let sunCategory = 'full_sun';
    if (/partial|3[\s-]|4[\s-]|5[\s-]/.test(sunlight)) sunCategory = 'partial';
    if (/shade|1[\s-]|2[\s-]/.test(sunlight))           sunCategory = 'shade';

    const zoneMatch = climate.match(/zone\s*(\d+)/i);
    const zone = zoneMatch ? parseInt(zoneMatch[1]) : 6;

    let recommended = [], notRecommended = [];

    if (sunCategory === 'full_sun') {
        recommended    = ['Sunflower', 'Rose', 'Tree', 'Deciduous Tree', 'Lawn', 'Grass Field'];
        notRecommended = ['Cherry Blossom'];
    } else if (sunCategory === 'partial') {
        recommended    = ['Small Plant', 'Potted Plant', 'Tulip', 'Cherry Blossom', 'Lawn'];
        notRecommended = ['Cactus', 'Sunflower'];
    } else {
        recommended    = ['Small Plant', 'Potted Plant'];
        notRecommended = ['Sunflower', 'Cactus', 'Rose', 'Tulip'];
    }

    if (zone >= 9) {
        if (!recommended.includes('Palm Tree')) recommended.push('Palm Tree');
        notRecommended = notRecommended.filter(p => p !== 'Palm Tree');
    } else if (zone <= 5) {
        notRecommended.push('Palm Tree');
        recommended = recommended.filter(p => p !== 'Palm Tree');
    }

    return { recommended, notRecommended };
}

// ── Location form helpers ─────────────────────────────────────────────────────
function resetLocationForm() {
    if (locationForm)     locationForm.style.display     = 'none';
    if (zipCodeInput)     zipCodeInput.value             = '';
    if (exifStatusBanner) exifStatusBanner.style.display = 'none';
    if (zipBadge)         zipBadge.style.display         = 'none';
    resetPolygon();
}

function resetLoadingSteps() {
    document.querySelectorAll('.loading-step').forEach(step => {
        step.classList.remove('active');
        step.querySelector('.step-dot')?.classList.remove('active');
    });
}

function showLocationForm(prefilled = {}) {
    if (!locationForm) return;

    locationForm.style.display    = 'block';
    analysisLoading.style.display = 'none';
    analysisResults.style.display = 'none';

    // Initialize polygon canvas and reveal polygon section
    initPolygonCanvas();
    const polygonSection = document.getElementById('polygonSection');
    if (polygonSection) polygonSection.style.display = 'block';

    if (prefilled.zipCode) {
        zipCodeInput.value = prefilled.zipCode;
        if (zipBadge) zipBadge.style.display = 'inline-block';
        if (exifStatusBanner) exifStatusBanner.style.display = 'flex';
    }
}

// ── File upload handler ───────────────────────────────────────────────────────
async function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
    }

    // Show analysis section immediately with photo
    uploadSection.style.display   = 'none';
    analysisSection.style.display = 'block';
    window.scrollTo(0, 0);

    // Extract EXIF from original file AND compress in parallel
    const [imageDataUrl, exifData] = await Promise.all([
        compressImage(file),
        extractExifData(file),
    ]);

    console.log('📷 Image compressed:', (imageDataUrl.length / 1024).toFixed(2), 'KB');
    console.log('🗺️ EXIF data:', exifData);

    try { window.GarDIYStorage.saveImage(imageDataUrl); } catch (e) {}

    previewImage.src = imageDataUrl;
    previewImage.onload = () => showLocationForm({});

    // Resolve ZIP from GPS coordinates in background (network call)
    if (exifData?._lat && exifData?._lon) {
        getZipFromCoords(exifData._lat, exifData._lon).then(zip => {
            if (zip && zipCodeInput && locationForm.style.display !== 'none') {
                zipCodeInput.value = zip;
                if (zipBadge) zipBadge.style.display = 'inline-block';
                if (exifStatusBanner) exifStatusBanner.style.display = 'flex';
            }
        });
    }
}

// ── Start analysis with location data ─────────────────────────────────────────
function isColoradoZip(zip) {
    const n = parseInt(zip, 10);
    return !isNaN(n) && n >= 80001 && n <= 81658;
}

function showZipError(msg) {
    const el = document.getElementById('zipError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}
function clearZipError() {
    const el = document.getElementById('zipError');
    if (el) el.style.display = 'none';
}

function analyzeWithLocation() {
    clearZipError();

    // ZIP code is required
    const zip = zipCodeInput?.value.trim() || '';
    if (!zip || zip.length < 5) {
        showZipError('Please enter your ZIP code to continue.');
        zipCodeInput?.focus();
        return;
    }
    if (!isColoradoZip(zip)) {
        showZipError('GarDIY is currently only available in Colorado. We\'re expanding soon — check back later!');
        return;
    }

    if (window.GarDIYSubscriptions) {
        const check = GarDIYSubscriptions.checkScanLimit();
        if (!check.allowed) {
            GarDIYSubscriptions.showUnlockModal(
                `You've used all ${check.limit} free scan${check.limit === 1 ? '' : 's'}. Unlock unlimited scans for a one-time $10 payment.`
            );
            return;
        }
    }

    const locationData = {
        zipCode: zip,
    };

    if (locationData.zipCode || locationData.direction || locationData.timeOfDay) {
        try { window.GarDIYStorage.saveLocationContext(locationData); } catch (e) {}
    }

    if (locationForm) locationForm.style.display = 'none';
    simulateAIAnalysis(locationData);
}

// ── AI analysis ───────────────────────────────────────────────────────────────
async function simulateAIAnalysis(locationData = {}) {
    console.log('🤖 Sending image to Claude...', locationData);

    analysisLoading.style.display = 'block';
    analysisResults.style.display = 'none';

    if (photoPreview && scanOverlay) {
        photoPreview.classList.add('scanning');
        scanOverlay.style.display = 'block';
    }

    const steps = document.querySelectorAll('.loading-step');
    steps[0]?.classList.add('active');
    steps[0]?.querySelector('.step-dot')?.classList.add('active');
    const stepTimers = [
        setTimeout(() => { steps[1]?.classList.add('active'); steps[1]?.querySelector('.step-dot')?.classList.add('active'); }, 1500),
        setTimeout(() => { steps[2]?.classList.add('active'); steps[2]?.querySelector('.step-dot')?.classList.add('active'); }, 3000),
        setTimeout(() => { steps[3]?.classList.add('active'); steps[3]?.querySelector('.step-dot')?.classList.add('active'); }, 4500),
    ];

    try {
        const session    = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const authHeader = session.token ? { 'Authorization': `Bearer ${session.token}` } : {};

        // If polygon is drawn, annotate the image so Claude sees the focus area visually
        let imageData     = previewImage.src;
        let polygonPoints = null;
        if (_polyClosed && _polyPoints.length >= 3) {
            const annotated = getAnnotatedImageData();
            if (annotated) imageData = annotated;
            polygonPoints = _polyPoints;
        }

        const body = {
            imageData,
            imageWidth:  previewImage.naturalWidth  || 0,
            imageHeight: previewImage.naturalHeight || 0,
            ...(locationData.zipCode && { zipCode: locationData.zipCode }),
            ...(polygonPoints        && { polygonPoints }),
        };

        const res  = await fetch('https://gardiy-backend-production.up.railway.app/api/analyze-image', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body:    JSON.stringify(body),
        });
        const data = await res.json();

        stepTimers.forEach(clearTimeout);

        if (photoPreview && scanOverlay) {
            photoPreview.classList.remove('scanning');
            scanOverlay.style.display = 'none';
        }

        if (!data.success && data.limitReached === 'scans') {
            if (window.GarDIYSubscriptions) GarDIYSubscriptions.showUnlockModal(data.message);
            return;
        }

        if (!data.success) throw new Error(data.message || 'Analysis failed');

        if (window.GarDIYSubscriptions) GarDIYSubscriptions.incrementScans();
        showAnalysisResults(data.analysis, locationData);

    } catch (err) {
        console.error('❌ Claude analysis failed:', err.message);
        stepTimers.forEach(clearTimeout);
        if (photoPreview && scanOverlay) {
            photoPreview.classList.remove('scanning');
            scanOverlay.style.display = 'none';
        }
        alert('⚠️ AI analysis unavailable: ' + err.message + '\n\nShowing estimated values.');
        showAnalysisResults(null, locationData);
    }
}

// ── Show analysis results ─────────────────────────────────────────────────────
function showAnalysisResults(claude, locationData = {}) {
    analysisLoading.style.display = 'none';
    analysisResults.style.display = 'block';
    setupUploadCalibration();

    // Compute pixel→SF ratio directly here — previewImage is guaranteed loaded at this point
    const _natW      = previewImage?.naturalWidth  || 0;
    const _natH      = previewImage?.naturalHeight || 0;
    const _groundSF  = parseFloat(claude?.squareFeet) || 0;
    const _groundFrac= parseFloat(claude?.groundFraction) || 0;
    // Prefer backend-enforced totalFrameSqFt (= groundSF / groundFraction); fallback to raw value
    const _frameSF   = (_groundSF > 0 && _groundFrac > 0)
        ? _groundSF / _groundFrac
        : (parseFloat(claude?.totalFrameSqFt) || 0);
    const _sqFtPerNaturalPx2 = (_natW > 0 && _natH > 0 && _frameSF > 0)
        ? _frameSF / (_natW * _natH)
        : (claude?.sqFtPerNaturalPx2 || null);
    console.log('[SF] ground:', _groundSF, 'SF | fraction:', _groundFrac,
                '| frame:', _frameSF.toFixed(1), 'SF | sqFtPerNaturalPx2:', _sqFtPerNaturalPx2,
                '| image:', _natW, 'x', _natH);

    const analysisData = {
        squareFeet:           claude?.squareFeet           || '—',
        totalFrameSqFt:       claude?.totalFrameSqFt       || null,
        sqFtPerNaturalPx2:    _sqFtPerNaturalPx2,
        groundFraction:       _groundFrac || null,
        imageNaturalWidth:    _natW  || null,
        imageNaturalHeight:   _natH  || null,
        dimensions:           claude?.dimensions            || '— ft × — ft',
        sunlight:             claude?.sunlight              || '—',
        climate:              claude?.climate               || '—',
        soilType:             claude?.soilType              || '—',
        irrigation:           claude?.irrigation            || '—',
        temperature:          claude?.temperature           || '—',
        confidence:           claude?.confidence            || '—',
        scaleReference:       claude?.scaleReference        || '—',
        recommendations:      claude?.recommendations       || [],
    };

    // ZIP code overrides AI climate — user's location always wins
    const zipClimate = locationData.zipCode ? getClimateFromZip(locationData.zipCode) : null;
    if (zipClimate) {
        analysisData.climate = zipClimate.label;
        console.log('📍 Climate overridden by ZIP code:', locationData.zipCode, '→', zipClimate.label);
    }

    try { window.GarDIYStorage.saveAnalysis(analysisData); } catch (e) {}

    document.getElementById('dimensions').textContent  = analysisData.dimensions;
    document.getElementById('sunlight').textContent    = analysisData.sunlight;
    document.getElementById('climate').textContent     = analysisData.climate;
    document.getElementById('soilType').textContent    = analysisData.soilType;
    document.getElementById('irrigation').textContent  = analysisData.irrigation;
    document.getElementById('temperature').textContent = analysisData.temperature;

    // Square footage hero card
    let sqftCard = document.getElementById('sqftCard');
    if (!sqftCard) {
        sqftCard = document.createElement('div');
        sqftCard.id        = 'sqftCard';
        sqftCard.className = 'result-card sqft-hero';
        sqftCard.innerHTML = `
            <div class="result-icon">📐</div>
            <div class="result-info">
                <span class="result-label">Estimated Area</span>
                <span class="result-value sqft-value" id="sqftValue">—</span>
                <span class="result-sub" id="sqftConfidence"></span>
                <span class="result-sub" id="sqftRef"></span>
            </div>`;
        document.querySelector('.results-grid')?.prepend(sqftCard);
    }
    document.getElementById('sqftValue').textContent =
        analysisData.squareFeet !== '—' ? analysisData.squareFeet + ' sq ft' : '—';
    document.getElementById('sqftConfidence').textContent =
        analysisData.confidence !== '—' ? 'Confidence: ' + analysisData.confidence : '';
    document.getElementById('sqftRef').textContent =
        analysisData.scaleReference && analysisData.scaleReference !== '—'
            ? 'Scale ref: ' + analysisData.scaleReference : '';

    // When ZIP overrides climate, regenerate recommendations for the real location.
    // Otherwise prefer backend response, then saved data, then fallback.
    let finalRecommended    = (zipClimate ? [] : claude?.recommendedPlants)    || [];
    let finalNotRecommended = (zipClimate ? [] : claude?.notRecommendedPlants) || [];

    if (!finalRecommended.length && !finalNotRecommended.length) {
        const saved = zipClimate ? null : window.GarDIYStorage.getRecommendations?.();
        if (saved) {
            finalRecommended    = saved.recommended    || [];
            finalNotRecommended = saved.notRecommended || [];
        } else if (claude || zipClimate) {
            const fallback  = generateFallbackRecommendations(analysisData);
            finalRecommended    = fallback.recommended;
            finalNotRecommended = fallback.notRecommended;
            console.log('🌿 Plant recommendations (zip-corrected):', fallback);
        }
    }

    if (finalRecommended.length || finalNotRecommended.length) {
        try {
            window.GarDIYStorage.saveRecommendations({
                recommended:    finalRecommended,
                notRecommended: finalNotRecommended,
            });
        } catch (e) {}
        showPlantRecommendationsPreview(finalRecommended, finalNotRecommended);
    }

    generateRecommendations(analysisData);
}

function showPlantRecommendationsPreview(recommended, notRecommended) {
    let card = document.getElementById('plantRecommendationsPreview');
    if (!card) {
        card = document.createElement('div');
        card.id        = 'plantRecommendationsPreview';
        card.className = 'plant-recommendations-preview';
        const container = document.getElementById('plantRecommendationsContainer');
        if (container) container.appendChild(card);
        else document.querySelector('.action-buttons')?.parentNode.insertBefore(card, document.querySelector('.action-buttons'));
    }
    card.innerHTML = `
        <h4>🌿 Plant Recommendations Ready</h4>
        <div class="rec-summary">
            <span class="rec-count recommended-count">✓ ${recommended.length} recommended</span>
            <span class="rec-count not-recommended-count">✗ ${notRecommended.length} to avoid</span>
        </div>
        <p class="rec-hint">Plants will be color-coded in the design panel</p>
    `;
}

function generateRecommendations(data) {
    const list = document.getElementById('recommendationsList');
    const box  = document.getElementById('recommendationsBox');
    if (!list) return;
    if (Array.isArray(data.recommendations) && data.recommendations.length) {
        list.innerHTML = data.recommendations.map(r => '<li>' + r + '</li>').join('');
        if (box) box.style.display = 'block';
        return;
    }
    if (box) box.style.display = 'none';
}

// ── Check for saved data on page load ────────────────────────────────────────
function checkForSavedData() {
    const savedImage    = window.GarDIYStorage.getImage();
    const savedAnalysis = window.GarDIYStorage.getAnalysis();

    if (savedImage && savedAnalysis) {
        uploadSection.style.display   = 'none';
        analysisSection.style.display = 'block';
        previewImage.src              = savedImage;
        analysisLoading.style.display = 'none';
        if (locationForm) locationForm.style.display = 'none';
        showAnalysisResults(savedAnalysis);
    }
}

// ── Polygon drawing tool ──────────────────────────────────────────────────────
function initPolygonCanvas() {
    if (!_polyCanvas) {
        _polyCanvas = document.getElementById('polygonCanvas');
        if (!_polyCanvas) return;
        _polyCtx = _polyCanvas.getContext('2d');
        _polyCanvas.addEventListener('click',      _onPolyClick);
        _polyCanvas.addEventListener('dblclick',   _onPolyDblClick);
        _polyCanvas.addEventListener('mousemove',  _onPolyMouseMove);
        _polyCanvas.addEventListener('mouseleave', () => { _polyMouse = null; drawPolyCanvas(); });
    }
    // Size canvas to match the container so 1 canvas px = 1 CSS px
    _polyCanvas.width  = photoPreview.offsetWidth;
    _polyCanvas.height = photoPreview.offsetHeight;
    drawPolyCanvas();
}

function resetPolygon() {
    _polyPoints = [];
    _polyActive = false;
    _polyClosed = false;
    _polyMouse  = null;
    if (_polyCanvas) {
        _polyCanvas.style.pointerEvents = 'none';
        _polyCanvas.style.cursor = 'default';
        _polyCtx?.clearRect(0, 0, _polyCanvas.width, _polyCanvas.height);
    }
    document.getElementById('polygonSection')?.setAttribute('style', 'display:none;margin:12px 0 6px;');
    document.getElementById('polyToggleBtn')?.setAttribute('style', 'width:100%;padding:8px;background:#fff;border:1px dashed #10b981;border-radius:8px;color:#065f46;font-size:12px;font-weight:600;cursor:pointer;');
    const pac = document.getElementById('polyActiveControls');
    if (pac) pac.style.display = 'none';
    const pdm = document.getElementById('polyDoneMsg');
    if (pdm) pdm.style.display = 'none';
    const prb = document.getElementById('polyRedrawBtn');
    if (prb) prb.style.display = 'none';
}

function enablePolygonMode() {
    _polyActive = true;
    _polyClosed = false;
    _polyPoints = [];
    _polyMouse  = null;
    if (_polyCanvas) { _polyCanvas.style.pointerEvents = 'auto'; _polyCanvas.style.cursor = 'crosshair'; }
    document.getElementById('polyToggleBtn').style.display      = 'none';
    document.getElementById('polyActiveControls').style.display = 'flex';
    document.getElementById('polyInstructions').textContent     = 'Click on the photo to place points. Click the first point to close.';
    document.getElementById('polyDoneMsg').style.display        = 'none';
    document.getElementById('polyRedrawBtn').style.display      = 'none';
    drawPolyCanvas();
}

function disablePolygonMode() {
    _polyActive = false;
    _polyClosed = false;
    _polyPoints = [];
    _polyMouse  = null;
    if (_polyCanvas) {
        _polyCanvas.style.pointerEvents = 'none';
        _polyCanvas.style.cursor = 'default';
        _polyCtx?.clearRect(0, 0, _polyCanvas.width, _polyCanvas.height);
    }
    document.getElementById('polyToggleBtn').style.display      = 'block';
    document.getElementById('polyActiveControls').style.display = 'none';
    document.getElementById('polyDoneMsg').style.display        = 'none';
    document.getElementById('polyRedrawBtn').style.display      = 'none';
}

function _onPolyClick(e) {
    if (!_polyActive || _polyClosed) return;
    const n = _canvasClickToNorm(e);
    if (!n.valid) return;

    // Close polygon when clicking near the first point (>= 3 points already)
    if (_polyPoints.length >= 3) {
        const fp = _normToCanvasXY(_polyPoints[0].x, _polyPoints[0].y);
        const cp = _normToCanvasXY(n.x, n.y);
        if (Math.hypot(cp.x - fp.x, cp.y - fp.y) < 18) { closePolygon(); return; }
    }

    _polyPoints.push({ x: n.x, y: n.y });
    const inst = document.getElementById('polyInstructions');
    if (inst && _polyPoints.length === 2) inst.textContent = 'Keep clicking to add more points. Double-click or click the first point to finish.';
    drawPolyCanvas();
}

function _onPolyDblClick(e) {
    if (!_polyActive || _polyClosed || _polyPoints.length < 3) return;
    _polyPoints.pop(); // remove duplicate point added by the preceding click event
    closePolygon();
}

function _onPolyMouseMove(e) {
    if (!_polyActive || _polyClosed) return;
    const rect = _polyCanvas.getBoundingClientRect();
    _polyMouse = {
        x: (e.clientX - rect.left) * (_polyCanvas.width  / rect.width),
        y: (e.clientY - rect.top)  * (_polyCanvas.height / rect.height),
    };
    drawPolyCanvas();
}

function closePolygon() {
    _polyClosed = true;
    _polyMouse  = null;
    if (_polyCanvas) { _polyCanvas.style.pointerEvents = 'none'; _polyCanvas.style.cursor = 'default'; }
    document.getElementById('polyActiveControls').style.display = 'none';
    document.getElementById('polyDoneMsg').style.display        = 'block';
    document.getElementById('polyRedrawBtn').style.display      = 'block';
    drawPolyCanvas();
}

// Maps a click event to normalized image coordinates (0–1)
function _canvasClickToNorm(e) {
    const imgRect = previewImage.getBoundingClientRect();
    const nx = (e.clientX - imgRect.left) / imgRect.width;
    const ny = (e.clientY - imgRect.top)  / imgRect.height;
    return { x: nx, y: ny, valid: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
}

// Maps normalized image coordinates to canvas internal pixels
function _normToCanvasXY(nx, ny) {
    const imgRect = previewImage.getBoundingClientRect();
    const canRect = _polyCanvas.getBoundingClientRect();
    const sx = _polyCanvas.width  / canRect.width;
    const sy = _polyCanvas.height / canRect.height;
    return {
        x: (imgRect.left - canRect.left + nx * imgRect.width)  * sx,
        y: (imgRect.top  - canRect.top  + ny * imgRect.height) * sy,
    };
}

function drawPolyCanvas() {
    if (!_polyCtx || !_polyCanvas) return;
    _polyCtx.clearRect(0, 0, _polyCanvas.width, _polyCanvas.height);
    if (_polyPoints.length === 0) return;

    const pts = _polyPoints.map(p => _normToCanvasXY(p.x, p.y));

    if (_polyClosed && pts.length >= 3) {
        // Darken everything outside the polygon
        _polyCtx.save();
        _polyCtx.fillStyle = 'rgba(0,0,0,0.42)';
        _polyCtx.fillRect(0, 0, _polyCanvas.width, _polyCanvas.height);
        _polyCtx.globalCompositeOperation = 'destination-out';
        _polyCtx.beginPath();
        _polyCtx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => _polyCtx.lineTo(p.x, p.y));
        _polyCtx.closePath();
        _polyCtx.fill();
        _polyCtx.restore();

        // Green polygon border
        _polyCtx.save();
        _polyCtx.strokeStyle = '#22c55e';
        _polyCtx.lineWidth   = 2.5;
        _polyCtx.lineJoin    = 'round';
        _polyCtx.beginPath();
        _polyCtx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => _polyCtx.lineTo(p.x, p.y));
        _polyCtx.closePath();
        _polyCtx.stroke();
        _polyCtx.restore();
        return;
    }

    // Drawing in progress: dashed line + preview line to cursor
    _polyCtx.save();
    _polyCtx.strokeStyle = '#22c55e';
    _polyCtx.lineWidth   = 2;
    _polyCtx.lineJoin    = 'round';
    _polyCtx.setLineDash([7, 4]);
    _polyCtx.beginPath();
    _polyCtx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => _polyCtx.lineTo(p.x, p.y));
    if (_polyMouse) _polyCtx.lineTo(_polyMouse.x, _polyMouse.y);
    _polyCtx.stroke();
    _polyCtx.restore();

    // Dots on each placed point
    pts.forEach((pt, i) => {
        _polyCtx.save();
        _polyCtx.beginPath();
        _polyCtx.arc(pt.x, pt.y, i === 0 ? 7 : 5, 0, Math.PI * 2);
        _polyCtx.fillStyle   = i === 0 ? '#15803d' : '#22c55e';
        _polyCtx.fill();
        _polyCtx.strokeStyle = '#fff';
        _polyCtx.lineWidth   = 1.5;
        _polyCtx.stroke();
        _polyCtx.restore();
    });

    // Highlight first point when mouse is near (close-hint glow)
    if (_polyPoints.length >= 3 && _polyMouse) {
        const fp   = pts[0];
        const dist = Math.hypot(_polyMouse.x - fp.x, _polyMouse.y - fp.y);
        if (dist < 28) {
            _polyCtx.save();
            _polyCtx.beginPath();
            _polyCtx.arc(fp.x, fp.y, 15, 0, Math.PI * 2);
            _polyCtx.fillStyle = 'rgba(34,197,94,0.28)';
            _polyCtx.fill();
            _polyCtx.restore();
        }
    }
}

// Returns annotated image data URL: original image with dark overlay outside polygon + green border
function getAnnotatedImageData() {
    if (!_polyClosed || _polyPoints.length < 3) return null;
    const img  = previewImage;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (!natW || !natH) return null;

    // Draw original image onto off-screen canvas
    const off = document.createElement('canvas');
    off.width = natW; off.height = natH;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, natW, natH);

    // Scale polygon from normalized → natural image pixels
    const pts = _polyPoints.map(p => ({ x: p.x * natW, y: p.y * natH }));

    // Overlay canvas: semi-transparent dark fill with polygon area cut out
    const ov    = document.createElement('canvas');
    ov.width = natW; ov.height = natH;
    const ovCtx = ov.getContext('2d');
    ovCtx.fillStyle = 'rgba(0,0,0,0.52)';
    ovCtx.fillRect(0, 0, natW, natH);
    ovCtx.globalCompositeOperation = 'destination-out';
    ovCtx.beginPath();
    ovCtx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ovCtx.lineTo(p.x, p.y));
    ovCtx.closePath();
    ovCtx.fillStyle = 'rgba(0,0,0,1)';
    ovCtx.fill();

    // Composite the overlay onto the original image
    ctx.drawImage(ov, 0, 0);

    // Draw green polygon border
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth   = Math.max(3, natW / 280);
    ctx.lineJoin    = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    return off.toDataURL('image/jpeg', 0.88);
}

// ── Sign-in gate ──────────────────────────────────────────────────────────────
function showSignInGate() {
    const section = document.getElementById('uploadSection');
    if (!section) return;
    section.innerHTML = `
        <div class="container">
            <div class="sign-in-gate">
                <div class="gate-icon">🔒</div>
                <h2>Sign In to Continue</h2>
                <p>Create a free account to upload your yard photo and get an AI landscape analysis.</p>
                <a href="login.html" class="gate-btn primary">Sign In</a>
                <a href="login.html?tab=register" class="gate-btn secondary">Create Free Account</a>
            </div>
        </div>
    `;
}

// ── Photo calibration (called after analysis results appear) ──────────────────
let _uCalibMode = false;
let _uCalibPts  = [];
let _uCalibDots = [];

function setupUploadCalibration() {
    const btn      = document.getElementById('uploadCalibBtn');
    const panel    = document.getElementById('uploadCalibPanel');
    const step1    = document.getElementById('uploadCalibStep1');
    const step2    = document.getElementById('uploadCalibStep2');
    const step3    = document.getElementById('uploadCalibStep3');
    const done     = document.getElementById('uploadCalibDone');
    const preset   = document.getElementById('uploadCalibPreset');
    const feetInp  = document.getElementById('uploadCalibFeet');
    const applyBtn = document.getElementById('uploadCalibApply');
    const cancelBtn= document.getElementById('uploadCalibCancel');
    if (!btn) return;

    btn.addEventListener('click', () => {
        _uCalibMode = true;
        _uCalibPts  = [];
        _uClearDots();
        panel.style.display = 'block';
        step1.style.display = 'block';
        step2.style.display = 'none';
        step3.style.display = 'none';
        done.style.display  = 'none';
        btn.textContent = 'Calibrating… click first point on photo';
        btn.style.background = '#fef3c7';
    });

    preset.addEventListener('change', () => { if (preset.value) feetInp.value = preset.value; });

    applyBtn.addEventListener('click', () => {
        const feet = parseFloat(feetInp.value);
        if (!feet || feet <= 0) { alert('Enter a valid distance in feet'); return; }
        _uApplyCalibration(feet);
        step3.style.display = 'none';
        done.style.display  = 'block';
        btn.textContent = 'Re-Calibrate Scale';
        btn.style.background = '#f0fdf4';
        _uCalibMode = false;
    });

    cancelBtn.addEventListener('click', () => {
        _uCalibMode = false;
        _uCalibPts  = [];
        _uClearDots();
        panel.style.display = 'none';
        btn.textContent = 'Click to Start Calibrating Scale';
        btn.style.background = '#fff';
    });

    // Wire clicks on the photo preview container
    photoPreview.addEventListener('click', _uHandleClick);
}

function _uHandleClick(e) {
    if (!_uCalibMode) return;
    const img  = document.getElementById('previewImage');
    const rect = img.getBoundingClientRect();
    // Only register clicks on the actual image
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Draw dot
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;width:12px;height:12px;background:#f59e0b;
        border:2px solid #fff;border-radius:50%;pointer-events:none;z-index:999;
        left:${rect.left - photoPreview.getBoundingClientRect().left + x - 6}px;
        top:${rect.top  - photoPreview.getBoundingClientRect().top  + y - 6}px;`;
    photoPreview.style.position = 'relative';
    photoPreview.appendChild(dot);
    _uCalibDots.push(dot);
    _uCalibPts.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, natX: (e.clientX - rect.left) / rect.width * img.naturalWidth, natY: (e.clientY - rect.top) / rect.height * img.naturalHeight });

    if (_uCalibPts.length === 1) {
        document.getElementById('uploadCalibStep1').style.display = 'none';
        document.getElementById('uploadCalibStep2').style.display = 'block';
    } else if (_uCalibPts.length === 2) {
        // Draw line
        const [p1, p2] = _uCalibPts;
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
        const pRect = photoPreview.getBoundingClientRect();
        const line = document.createElement('div');
        line.style.cssText = `position:absolute;height:2px;background:#f59e0b;pointer-events:none;z-index:998;
            left:${rect.left - pRect.left + p1.x}px;top:${rect.top - pRect.top + p1.y}px;
            width:${len}px;transform-origin:0 50%;transform:rotate(${ang}deg);`;
        photoPreview.appendChild(line);
        _uCalibDots.push(line);
        document.getElementById('uploadCalibStep2').style.display = 'none';
        document.getElementById('uploadCalibStep3').style.display = 'block';
    }
}

function _uClearDots() {
    _uCalibDots.forEach(el => el.remove());
    _uCalibDots = [];
}

function _uApplyCalibration(feet) {
    const [p1, p2] = _uCalibPts;
    // Points are already in natural pixel coords
    const naturalDist = Math.hypot(p2.natX - p1.natX, p2.natY - p1.natY);
    if (naturalDist < 5) { alert('Points too close — try again'); return; }
    const natPxPerFt = naturalDist / feet;
    const calibSqFtPerNatPx2 = 1 / (natPxPerFt * natPxPerFt);

    // Save into analysis data
    const analysis = window.GarDIYStorage?.getAnalysis() || {};
    analysis.calibrationSqFtPerNaturalPx2 = calibSqFtPerNatPx2;
    window.GarDIYStorage.saveAnalysis(analysis);

    // Update the displayed SF estimate to reflect calibrated scale
    const img = document.getElementById('previewImage');
    const natW = img.naturalWidth, natH = img.naturalHeight;
    const gf = parseFloat(analysis.groundFraction) || 1;
    const frameSF = calibSqFtPerNatPx2 * natW * natH;
    const groundSF = Math.round(frameSF * gf);
    const sqftVal = document.getElementById('sqftValue');
    if (sqftVal) sqftVal.textContent = groundSF + ' sq ft (calibrated)';
    console.log('[Calib] natPxPerFt:', natPxPerFt.toFixed(2), '| calibSqFtPerNatPx2:', calibSqFtPerNatPx2.toExponential(4), '| groundSF:', groundSF);
}

// ── Demo garden ───────────────────────────────────────────────────────────────
async function handleDemoGarden() {
    uploadSection.style.display   = 'none';
    analysisSection.style.display = 'block';
    window.scrollTo(0, 0);

    const demoData = {
        squareFeet:      1000,
        totalFrameSqFt:  1200,
        groundFraction:  0.85,
        dimensions:      '25 ft × 40 ft',
        sunlight:        '6-8 hours (Full Sun)',
        climate:         'Semi-arid Continental (Colorado), Zone 5-6',
        soilType:        'Sandy Loam',
        irrigation:      'Moderate',
        temperature:     '20°F to 95°F',
        confidence:      'Demo',
        scaleReference:  'Demo garden (1,000 sq ft)',
        recommendations: [
            'Great blank-slate space for a full landscape design',
            'Consider native Colorado plants for low water use',
            'Open area suits a mix of hardscape and greenery',
        ],
        recommendedPlants:    ['Blue Grama Grass', 'Colorado Blue Spruce', 'Prairie Gold Aspen', 'Russian Sage', 'Penstemon', 'Salvia'],
        notRecommendedPlants: ['Tropical palms', 'High-water tropicals'],
    };

    // Fetch the demo image and convert to data URL so it works exactly like an upload
    try {
        const resp    = await fetch('images/demo-garden.png');
        const blob    = await resp.blob();
        const dataUrl = await new Promise(res => {
            const reader = new FileReader();
            reader.onload = e => res(e.target.result);
            reader.readAsDataURL(blob);
        });
        previewImage.src = dataUrl;
        try { window.GarDIYStorage.saveImage(dataUrl); } catch(e) {}
    } catch(e) {
        // Fallback: use path directly
        previewImage.src = 'images/demo-garden.png';
        try { window.GarDIYStorage.saveImage('images/demo-garden.png'); } catch(e2) {}
    }

    try { window.GarDIYStorage.saveLocationContext({ zipCode: '80203', demo: true }); } catch(e) {}
    showAnalysisResults(demoData, { zipCode: '80203' });
}

console.log('✅ Upload script loaded');
