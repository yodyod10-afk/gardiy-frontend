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

// LocalStorage helper functions for passing data between pages
const Storage = {
    // Save uploaded image
    saveImage: function(imageDataUrl) {
        localStorage.setItem('gardiy_uploaded_image', imageDataUrl);
    },
    
    // Get uploaded image
    getImage: function() {
        return localStorage.getItem('gardiy_uploaded_image');
    },
    
    // Save AI analysis results
    saveAnalysis: function(analysisData) {
        localStorage.setItem('gardiy_analysis', JSON.stringify(analysisData));
    },
    
    // Get AI analysis results
    getAnalysis: function() {
        const data = localStorage.getItem('gardiy_analysis');
        return data ? JSON.parse(data) : null;
    },
    
    // Save selected design items
    saveDesign: function(items) {
        localStorage.setItem('gardiy_design_items', JSON.stringify(items));
    },
    
    // Get selected design items
    getDesign: function() {
        const data = localStorage.getItem('gardiy_design_items');
        return data ? JSON.parse(data) : [];
    },
    
    // Save location context (ZIP, direction, time of day)
    saveLocationContext: function(data) {
        localStorage.setItem('gardiy_location_context', JSON.stringify(data));
    },
    getLocationContext: function() {
        const data = localStorage.getItem('gardiy_location_context');
        return data ? JSON.parse(data) : null;
    },

    // Save plant recommendations from AI analysis
    saveRecommendations: function(data) {
        localStorage.setItem('gardiy_plant_recommendations', JSON.stringify(data));
    },
    getRecommendations: function() {
        const data = localStorage.getItem('gardiy_plant_recommendations');
        return data ? JSON.parse(data) : null;
    },

    // Clear all project data
    clearProject: function() {
        localStorage.removeItem('gardiy_uploaded_image');
        localStorage.removeItem('gardiy_analysis');
        localStorage.removeItem('gardiy_design_items');
        localStorage.removeItem('gardiy_location_context');
        localStorage.removeItem('gardiy_plant_recommendations');
    }
};

// Make Storage available globally
window.GarDIYStorage = Storage;
