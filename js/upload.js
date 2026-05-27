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

    if (startDesignBtn) {
        startDesignBtn.addEventListener('click', e => {
            e.preventDefault();
            if (!previewImage?.src) { alert('⚠️ Please upload a photo first'); return; }
            try { window.GarDIYStorage.saveImage(previewImage.src); } catch (err) {}
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
            GarDIYSubscriptions.showUpgradeModal(
                `You've used all ${check.limit} scan${check.limit === 1 ? '' : 's'} on your <strong>${check.planLabel}</strong> plan. Upgrade to keep scanning your yard.`
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
        const imageData  = previewImage.src;
        const session    = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const authHeader = session.token ? { 'Authorization': `Bearer ${session.token}` } : {};

        const body = {
            imageData,
            imageWidth:  previewImage.naturalWidth  || 0,
            imageHeight: previewImage.naturalHeight || 0,
            ...(locationData.zipCode && { zipCode: locationData.zipCode }),
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

console.log('✅ Upload script loaded');
