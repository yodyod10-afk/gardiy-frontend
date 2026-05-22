// Common JavaScript functions used across all pages

// Smooth scroll to section
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Add smooth scrolling to all anchor links
document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            scrollToSection(targetId);
        });
    });

    // Highlight active nav link based on scroll position
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');

    function highlightNav() {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', highlightNav);
});

// Returns a user-specific suffix so storage is isolated per account
function _userStorageSuffix() {
    try {
        const user = JSON.parse(localStorage.getItem('gardiyUser') || '{}');
        const uid  = user.id || user.email;
        if (!uid) return '';
        // Sanitise to safe key characters
        return '_' + String(uid).replace(/[^a-zA-Z0-9@._-]/g, '_');
    } catch { return ''; }
}

// Migrate a key from the old global form to the new user-scoped form (one-time, on first read)
function _migrateKey(base) {
    const suffix = _userStorageSuffix();
    if (!suffix) return; // not logged in — nothing to migrate
    const newKey = base + suffix;
    if (localStorage.getItem(newKey)) return; // already migrated
    const oldVal = localStorage.getItem(base);
    if (oldVal) {
        localStorage.setItem(newKey, oldVal);
        localStorage.removeItem(base);
    }
}

// LocalStorage helper functions for passing data between pages
const Storage = {
    saveImage: function(imageDataUrl) {
        localStorage.setItem('gardiy_uploaded_image' + _userStorageSuffix(), imageDataUrl);
    },
    getImage: function() {
        _migrateKey('gardiy_uploaded_image');
        return localStorage.getItem('gardiy_uploaded_image' + _userStorageSuffix());
    },

    saveAnalysis: function(analysisData) {
        localStorage.setItem('gardiy_analysis' + _userStorageSuffix(), JSON.stringify(analysisData));
    },
    getAnalysis: function() {
        _migrateKey('gardiy_analysis');
        const data = localStorage.getItem('gardiy_analysis' + _userStorageSuffix());
        return data ? JSON.parse(data) : null;
    },

    saveDesign: function(items) {
        localStorage.setItem('gardiy_design_items' + _userStorageSuffix(), JSON.stringify(items));
    },
    getDesign: function() {
        _migrateKey('gardiy_design_items');
        const data = localStorage.getItem('gardiy_design_items' + _userStorageSuffix());
        return data ? JSON.parse(data) : [];
    },

    saveLocationContext: function(data) {
        localStorage.setItem('gardiy_location_context' + _userStorageSuffix(), JSON.stringify(data));
    },
    getLocationContext: function() {
        _migrateKey('gardiy_location_context');
        const data = localStorage.getItem('gardiy_location_context' + _userStorageSuffix());
        return data ? JSON.parse(data) : null;
    },

    saveRecommendations: function(data) {
        localStorage.setItem('gardiy_plant_recommendations' + _userStorageSuffix(), JSON.stringify(data));
    },
    getRecommendations: function() {
        _migrateKey('gardiy_plant_recommendations');
        const data = localStorage.getItem('gardiy_plant_recommendations' + _userStorageSuffix());
        return data ? JSON.parse(data) : null;
    },

    clearProject: function() {
        const p = _userStorageSuffix();
        ['gardiy_uploaded_image','gardiy_analysis','gardiy_design_items',
         'gardiy_location_context','gardiy_plant_recommendations'].forEach(k => {
            localStorage.removeItem(k + p);
        });
    }
};

// Make Storage available globally
window.GarDIYStorage = Storage;
