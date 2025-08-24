# Breadcord Website

A beautiful, bread-themed website for the Breadcord Discord client project.

## Features

- **Bread-themed design** with warm, cozy colors (browns, golds, wheat tones)
- **Responsive layout** that works on desktop, tablet, and mobile devices
- **Smooth animations** and interactive elements
- **Complete information** about Breadcord including:
  - Project overview and features
  - Download links for all platforms (Windows, macOS, Linux)
  - GitHub repository links
  - Build status badges

## Structure

```
website/
├── index.html          # Main HTML file
├── styles.css          # Bread-themed CSS styling
├── script.js           # Interactive JavaScript functionality
├── assets/
│   └── images/
│       └── breadcord-logo.png  # Project logo
└── README.md           # This file
```

## Running the Website

### Option 1: Simple HTTP Server (Recommended)
```bash
cd website
python3 -m http.server 8000
```
Then open http://localhost:8000 in your browser.

### Option 2: Open Directly
Simply open `index.html` in your web browser. Some features may not work due to CORS restrictions.

## Design Features

- **Color Palette**: Saddle brown, chocolate, goldenrod, wheat, and cream colors
- **Typography**: Clean, readable fonts with proper hierarchy
- **Icons**: Bread-themed emojis and platform-specific icons
- **Animations**: Floating logo, fade-in effects, and hover animations
- **Accessibility**: Keyboard navigation support and focus indicators

## Sections

1. **Hero Section**: Welcome banner with Breadcord logo and call-to-action buttons
2. **About Section**: Project description and key features
3. **Download Section**: Platform-specific download links with installation instructions
4. **GitHub Section**: Links to repository, issues, releases, and build status
5. **Footer**: Additional links and credits

## Browser Compatibility

- Modern browsers (Chrome 60+, Firefox 55+, Safari 12+, Edge 79+)
- Mobile browsers on iOS and Android
- Responsive design for screens from 320px to 4K

## Customization

To modify the bread theme colors, edit the CSS custom properties at the top of `styles.css`:

```css
:root {
    --primary-color: #8B4513;    /* Saddle Brown */
    --secondary-color: #D2691E;  /* Chocolate */
    --accent-color: #DAA520;     /* Goldenrod */
    /* ... other colors */
}
```

## Assets

The website uses the project's icon from `app/icon/icon.png` as the logo. GitHub badges are loaded from shields.io and may not display in offline environments.