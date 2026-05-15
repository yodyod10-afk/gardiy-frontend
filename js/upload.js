// Upload & Analysis Page JavaScript - FIXED

// Variables for elements
let uploadArea, uploadBtn, fileInput, uploadSection, analysisSection;
let previewImage, photoPreview, scanOverlay;
let changePhotoBtn, backToUploadBtn, analysisLoading, analysisResults;
let startDesignBtn;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Upload page loaded');
    
    // Get all elements
    uploadArea = document.getElementById('uploadArea');
    uploadBtn = document.getElementById('uploadBtn');
    fileInput = document.getElementById('fileInput');
    uploadSection = document.getElementById('uploadSection');
    analysisSection = document.getElementById('analysisSection');
    previewImage = document.getElementById('previewImage');
    photoPreview = document.getElementById('photoPreview');
    scanOverlay = document.getElementById('scanOverlay');
    changePhotoBtn = document.getElementById('changePhotoBtn');
    backToUploadBtn = document.getElementById('backToUploadBtn');
    analysisLoading = document.getElementById('analysisLoading');
    analysisResults = document.getElementById('analysisResults');
    startDesignBtn = document.getElementById('startDesignBtn');
    
    console.log('Elements loaded');
    
    // Set up all event listeners
    setupEventListeners();
    
    // Check for saved data
    checkForSavedData();
});

// Setup event listeners
function setupEventListeners() {
    // Upload button click
    uploadBtn.addEventListener('click', function() {
        fileInput.click();
    });

    // Upload area click
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#059669';
        uploadArea.style.background = '#f0fdf4';
    });

    uploadArea.addEventListener('dragleave', function() {
        uploadArea.style.borderColor = '#10b981';
        uploadArea.style.background = 'white';
    });

    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#10b981';
        uploadArea.style.background = 'white';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Change photo button
    changePhotoBtn.addEventListener('click', function() {
        fileInput.click();
    });

    // Back to upload button
    backToUploadBtn.addEventListener('click', function() {
        analysisSection.style.display = 'none';
        uploadSection.style.display = 'block';
        
        // Reset loading steps
        const steps = document.querySelectorAll('.loading-step');
        steps.forEach(function(step) {
            step.classList.remove('active');
            step.querySelector('.step-dot').classList.remove('active');
        });
        
        window.scrollTo(0, 0);
    });

    // FIXED: Start Design button - save image BEFORE navigating
    if (startDesignBtn) {
        startDesignBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🎨 Start Design clicked');
            
            // Check if we have an image
            if (!previewImage || !previewImage.src || previewImage.src === '') {
                alert('⚠️ Please upload a photo first');
                return;
            }
            
            console.log('💾 Saving image before navigation...');
            
            // Make sure image is saved
            try {
                window.GarDIYStorage.saveImage(previewImage.src);
                console.log('✅ Image saved to GarDIYStorage');
            } catch (e) {
                console.error('Error saving image:', e);
            }
            
            // Give a brief moment for save to complete
            setTimeout(() => {
                console.log('➡️ Navigating to design page');
                window.location.href = 'design.html';
            }, 100);
        });
    }
}

// Handle file upload
function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
    }

    const reader = new FileReader();
    
    reader.onload = function(e) {
        const imageDataUrl = e.target.result;
        console.log('📷 Image loaded, size:', (imageDataUrl.length / 1024).toFixed(2), 'KB');
        
        // Save to GarDIYStorage
        try {
            window.GarDIYStorage.saveImage(imageDataUrl);
            console.log('✅ Image saved to GarDIYStorage');
        } catch (error) {
            console.error('Error saving image:', error);
        }
        
        // Show analysis section
        uploadSection.style.display = 'none';
        analysisSection.style.display = 'block';
        
        // Set image
        previewImage.src = imageDataUrl;
        console.log('🖼️ Image set to preview');
        
        // Wait for image to load
        previewImage.onload = function() {
            console.log('Image loaded, starting analysis...');
            simulateAIAnalysis();
        };
        
        window.scrollTo(0, 0);
    };
    
    reader.readAsDataURL(file);
}

// Real Claude AI analysis
async function simulateAIAnalysis() {
    console.log('🤖 Sending image to Claude for analysis...');

    analysisLoading.style.display = 'block';
    analysisResults.style.display = 'none';

    if (photoPreview && scanOverlay) {
        photoPreview.classList.add('scanning');
        scanOverlay.style.display = 'block';
    }

    // Animate loading steps while waiting for Claude
    const steps = document.querySelectorAll('.loading-step');
    steps[0].classList.add('active');
    steps[0].querySelector('.step-dot').classList.add('active');
    const stepTimers = [
        setTimeout(() => { steps[1].classList.add('active'); steps[1].querySelector('.step-dot').classList.add('active'); }, 1500),
        setTimeout(() => { steps[2].classList.add('active'); steps[2].querySelector('.step-dot').classList.add('active'); }, 3000),
        setTimeout(() => { steps[3].classList.add('active'); steps[3].querySelector('.step-dot').classList.add('active'); }, 4500),
    ];

    try {
        const imageData = previewImage.src;
        const session = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const authHeader = session.token ? { 'Authorization': `Bearer ${session.token}` } : {};
        const res  = await fetch('http://localhost:5000/api/analyze-image', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body:    JSON.stringify({ imageData })
        });
        const data = await res.json();

        stepTimers.forEach(clearTimeout);

        if (photoPreview && scanOverlay) {
            photoPreview.classList.remove('scanning');
            scanOverlay.style.display = 'none';
        }

        if (!data.success) throw new Error(data.message || 'Analysis failed');

        showAnalysisResults(data.analysis);

    } catch (err) {
        console.error('❌ Claude analysis failed:', err.message);
        stepTimers.forEach(clearTimeout);
        if (photoPreview && scanOverlay) {
            photoPreview.classList.remove('scanning');
            scanOverlay.style.display = 'none';
        }
        // Fall back to placeholder so the user can still proceed
        alert('⚠️ AI analysis unavailable: ' + err.message + '\n\nShowing estimated values.');
        showAnalysisResults(null);
    }
}

// Show results — accepts real Claude data or falls back to placeholders
function showAnalysisResults(claude) {
    analysisLoading.style.display = 'none';
    analysisResults.style.display = 'block';

    // Use Claude data or sensible fallback
    const analysisData = {
        squareFeet:  claude?.squareFeet   || '—',
        dimensions:  claude?.dimensions   || '— ft × — ft',
        sunlight:    claude?.sunlight     || '—',
        climate:     claude?.climate      || '—',
        soilType:    claude?.soilType     || '—',
        irrigation:  claude?.irrigation   || '—',
        temperature: claude?.temperature  || '—',
        confidence:  claude?.confidence   || '—',
        scaleReference: claude?.scaleReference || '—',
        recommendations: claude?.recommendations || [],
    };

    try { window.GarDIYStorage.saveAnalysis(analysisData); } catch (e) {}

    // Populate the existing result cards
    document.getElementById('dimensions').textContent  = analysisData.dimensions;
    document.getElementById('sunlight').textContent    = analysisData.sunlight;
    document.getElementById('climate').textContent     = analysisData.climate;
    document.getElementById('soilType').textContent    = analysisData.soilType;
    document.getElementById('irrigation').textContent  = analysisData.irrigation;
    document.getElementById('temperature').textContent = analysisData.temperature;

    // Inject the square footage hero card if not already present
    let sqftCard = document.getElementById('sqftCard');
    if (!sqftCard) {
        sqftCard = document.createElement('div');
        sqftCard.id = 'sqftCard';
        sqftCard.className = 'result-card sqft-hero';
        sqftCard.innerHTML = `
            <div class="result-icon">📐</div>
            <div class="result-info">
                <span class="result-label">Estimated Area</span>
                <span class="result-value sqft-value" id="sqftValue">—</span>
                <span class="result-sub" id="sqftConfidence"></span>
                <span class="result-sub" id="sqftRef"></span>
            </div>`;
        const grid = document.querySelector('.results-grid');
        if (grid) grid.prepend(sqftCard);
    }

    document.getElementById('sqftValue').textContent =
        analysisData.squareFeet !== '—' ? analysisData.squareFeet + ' sq ft' : '—';
    document.getElementById('sqftConfidence').textContent =
        analysisData.confidence !== '—' ? 'Confidence: ' + analysisData.confidence : '';
    document.getElementById('sqftRef').textContent =
        analysisData.scaleReference && analysisData.scaleReference !== 'No clear reference found' && analysisData.scaleReference !== '—'
            ? 'Scale ref: ' + analysisData.scaleReference : '';

    generateRecommendations(analysisData);
}

// Generate recommendations — uses Claude's list if available
function generateRecommendations(data) {
    const list = document.getElementById('recommendationsList');
    if (!list) return;

    // Use Claude's recommendations if present
    if (Array.isArray(data.recommendations) && data.recommendations.length) {
        list.innerHTML = data.recommendations.map(r => '<li>' + r + '</li>').join('');
        return;
    }

    // Generic fallback
    const recs = ['Upload your photo and let Claude analyze for personalized recommendations.'];
    list.innerHTML = recs.map(r => '<li>' + r + '</li>').join('');
}

// Check for saved data
function checkForSavedData() {
    const savedImage = window.GarDIYStorage.getImage();
    const savedAnalysis = window.GarDIYStorage.getAnalysis();
    
    console.log('🔍 Checking for saved data...');
    console.log('Saved image:', savedImage ? 'Yes (' + (savedImage.length / 1024).toFixed(2) + ' KB)' : 'No');
    console.log('Saved analysis:', savedAnalysis ? 'Yes' : 'No');
    
    if (savedImage && savedAnalysis) {
        uploadSection.style.display = 'none';
        analysisSection.style.display = 'block';
        previewImage.src = savedImage;
        
        analysisLoading.style.display = 'none';
        showAnalysisResults(savedAnalysis);
        
        console.log('✅ Restored previous session');
    }
}

console.log('✅ Upload script loaded');
