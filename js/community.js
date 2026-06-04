// Community Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    checkUserStatus();

    // Filter functionality
    const filterButtons = document.querySelectorAll('.filter-btn');
    const projectCards = document.querySelectorAll('.project-card');

    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            const filter = this.dataset.filter;

            // Filter projects
            projectCards.forEach(card => {
                if (filter === 'all' || card.dataset.category === filter) {
                    card.style.display = 'block';
                    setTimeout(() => {
                        card.style.animation = 'fadeIn 0.5s ease';
                    }, 10);
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // Sort functionality
    const sortSelect = document.getElementById('sortSelect');
    sortSelect.addEventListener('change', function() {
        const sortValue = this.value;
        console.log('Sorting by:', sortValue);
        // In a real app, this would re-fetch and re-render sorted data
        showMessage(`Sorted by ${sortValue}`, 'info');
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.querySelector('.search-btn');

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    function performSearch() {
        const query = searchInput.value.toLowerCase().trim();
        if (!query) return;

        projectCards.forEach(card => {
            const title = card.querySelector('h3').textContent.toLowerCase();
            const description = card.querySelector('.project-description').textContent.toLowerCase();
            
            if (title.includes(query) || description.includes(query)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });

        showMessage(`Found projects matching "${query}"`, 'success');
    }

    // Like functionality
    const likeButtons = document.querySelectorAll('.like-btn');
    likeButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            
            const heart = this.querySelector('.heart');
            const likeCount = this.querySelector('.like-count');
            let likes = parseInt(this.dataset.likes);

            if (this.classList.contains('liked')) {
                // Unlike
                this.classList.remove('liked');
                heart.textContent = '🤍';
                likes--;
            } else {
                // Like
                this.classList.add('liked');
                heart.textContent = '❤️';
                likes++;
                
                // Add animation
                heart.style.animation = 'heartBeat 0.5s ease';
                setTimeout(() => {
                    heart.style.animation = '';
                }, 500);
            }

            this.dataset.likes = likes;
            likeCount.textContent = likes;
        });
    });

    // View project functionality
    const viewButtons = document.querySelectorAll('.view-btn');
    viewButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.project-card');
            const title = card.querySelector('h3').textContent;
            console.log('Viewing project:', title);
            // In a real app, this would open a detailed view
            showMessage('Opening project details...', 'info');
        });
    });

    // Load more functionality
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    loadMoreBtn.addEventListener('click', function() {
        this.textContent = 'Loading...';
        this.disabled = true;
        
        // Simulate loading
        setTimeout(() => {
            this.textContent = 'Load More Projects';
            this.disabled = false;
            showMessage('No more projects to load', 'info');
        }, 1000);
    });
});

// Check user login status
function checkUserStatus() {
    const user = JSON.parse(localStorage.getItem('gardiyUser'));
    const shareBtn = document.getElementById('shareProjectBtn');
    const navActions = document.querySelector('.nav-actions');
    const signInBtn = navActions.querySelector('a[href="login.html"]');
    
    if (user && user.loggedIn) {
        // User is logged in
        if (signInBtn) {
            signInBtn.textContent = user.name || 'Profile';
            signInBtn.href = '#';
            signInBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showUserMenu(user);
            });
        }
    }
}

// Show user menu
function showUserMenu(user) {
    const menu = document.createElement('div');
    menu.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
        padding: 16px;
        min-width: 200px;
        z-index: 1000;
        animation: fadeIn 0.3s ease;
    `;
    
    menu.innerHTML = `
        <div style="padding: 12px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px;">
            <div style="font-weight: 600; color: #2d3748;">${user.name}</div>
            <div style="font-size: 13px; color: #718096;">${user.email}</div>
        </div>
        <a href="#" style="display: block; padding: 12px; color: #4a5568; text-decoration: none; border-radius: 8px; transition: all 0.3s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">My Projects</a>
        <a href="#" style="display: block; padding: 12px; color: #4a5568; text-decoration: none; border-radius: 8px; transition: all 0.3s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">Settings</a>
        <a href="#" id="logoutBtn" style="display: flex; align-items: center; gap: 8px; padding: 12px; color: #f56565; text-decoration: none; border-radius: 8px; transition: all 0.3s; margin-top: 8px; border-top: 1px solid #e2e8f0;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='transparent'"><img src="images/icon-logout.png" style="width:16px;height:16px;object-fit:contain;opacity:0.8;">Logout</a>
    `;
    
    document.body.appendChild(menu);
    
    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
    
    // Logout functionality
    menu.querySelector('#logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        localStorage.removeItem('gardiyUser');
        showMessage('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    });
}

// Helper function to show messages
function showMessage(message, type) {
    const existingMessage = document.querySelector('.message-toast');
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-toast';
    messageDiv.textContent = message;
    
    messageDiv.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 12px;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    `;

    if (type === 'success') {
        messageDiv.style.background = '#48bb78';
        messageDiv.style.color = 'white';
    } else if (type === 'error') {
        messageDiv.style.background = '#f56565';
        messageDiv.style.color = 'white';
    } else {
        messageDiv.style.background = '#4299e1';
        messageDiv.style.color = 'white';
    }

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }

    @keyframes heartBeat {
        0%, 100% { transform: scale(1); }
        25% { transform: scale(1.3); }
        50% { transform: scale(1.1); }
        75% { transform: scale(1.2); }
    }
`;
document.head.appendChild(style);
