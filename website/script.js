// Breadcord Website JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile navigation toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close mobile menu when clicking on a link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', function() {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    let lastScrollTop = 0;

    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Add/remove background blur effect
        if (scrollTop > 50) {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.backdropFilter = 'blur(20px) saturate(180%)';
            navbar.style.borderBottom = '1px solid rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.8)';
            navbar.style.backdropFilter = 'blur(20px) saturate(180%)';
            navbar.style.borderBottom = '1px solid rgba(0, 0, 0, 0.05)';
        }

        lastScrollTop = scrollTop;
    });

    // Animate elements on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature, .download-card, .github-btn');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add download tracking (optional - for analytics)
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const platform = this.closest('.download-card').querySelector('h3').textContent;
            const architecture = this.querySelector('.arch')?.textContent || 'unknown';
            const format = this.querySelector('.format')?.textContent || 'unknown';
            
            // Track download event (you can integrate with analytics services)
            console.log(`Download clicked: ${platform} ${architecture} ${format}`);
            
            // You could send this data to Google Analytics or other tracking services
            // gtag('event', 'download', {
            //     'platform': platform,
            //     'architecture': architecture,
            //     'format': format
            // });
        });
    });

    // Add hover effect for hero logo
    const heroLogo = document.querySelector('.hero-logo');
    if (heroLogo) {
        heroLogo.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1) rotate(5deg)';
        });
        
        heroLogo.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1) rotate(0deg)';
        });
    }

    // Add bread crumb trail effect (decorative)
    function createBreadCrumb() {
        const breadCrumb = document.createElement('div');
        breadCrumb.innerHTML = '🍞';
        breadCrumb.style.position = 'fixed';
        breadCrumb.style.left = Math.random() * 100 + 'vw';
        breadCrumb.style.top = '-50px';
        breadCrumb.style.fontSize = '20px';
        breadCrumb.style.opacity = '0.3';
        breadCrumb.style.pointerEvents = 'none';
        breadCrumb.style.zIndex = '1';
        breadCrumb.style.transition = 'all 3s ease-in-out';
        
        document.body.appendChild(breadCrumb);
        
        // Animate falling
        setTimeout(() => {
            breadCrumb.style.top = '100vh';
            breadCrumb.style.transform = 'rotate(360deg)';
            breadCrumb.style.opacity = '0';
        }, 100);
        
        // Remove element after animation
        setTimeout(() => {
            if (breadCrumb.parentNode) {
                breadCrumb.parentNode.removeChild(breadCrumb);
            }
        }, 3000);
    }

    // Add occasional bread crumb animation (very subtle)
    let breadCrumbInterval;
    const startBreadCrumbAnimation = () => {
        breadCrumbInterval = setInterval(createBreadCrumb, 15000); // Every 15 seconds
    };

    // Start bread crumb animation after page load
    setTimeout(startBreadCrumbAnimation, 3000);

    // Pause animation when page is not visible
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            clearInterval(breadCrumbInterval);
        } else {
            startBreadCrumbAnimation();
        }
    });

    // Add loading effect for images
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('load', function() {
            this.style.opacity = '1';
        });
        
        // If image is already loaded
        if (img.complete) {
            img.style.opacity = '1';
        } else {
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.3s ease';
        }
    });

    // Add click effect to buttons
    document.querySelectorAll('.btn, .download-btn, .github-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            // Create ripple effect
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.style.position = 'absolute';
            ripple.style.borderRadius = '50%';
            ripple.style.background = 'rgba(255, 255, 255, 0.3)';
            ripple.style.transform = 'scale(0)';
            ripple.style.animation = 'ripple 0.6s linear';
            ripple.style.pointerEvents = 'none';
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => {
                if (ripple.parentNode) {
                    ripple.parentNode.removeChild(ripple);
                }
            }, 600);
        });
    });

    // Add CSS for ripple animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // Add keyboard navigation support
    document.addEventListener('keydown', function(e) {
        // Focus trap for mobile menu
        if (navMenu && navMenu.classList.contains('active')) {
            const focusableElements = navMenu.querySelectorAll('a');
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
            
            if (e.key === 'Escape') {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
                hamburger.focus();
            }
        }
    });

    console.log('🍞 Breadcord website loaded successfully!');
});