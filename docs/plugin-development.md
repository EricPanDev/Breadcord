# Plugin Development Guide

Learn how to create powerful plugins for Breadcord using the BreadAPI.

## 🚀 Getting Started

### What are Breadcord Plugins?

Breadcord plugins are JavaScript modules that extend the functionality of the Discord client. They can:

- **Modify the UI**: Add new interface elements or modify existing ones
- **Enhance Features**: Add new functionality to Discord features
- **Automate Tasks**: Create custom automation and workflows
- **Integrate Services**: Connect with external APIs and services

### Prerequisites

- **Basic JavaScript**: Understanding of JavaScript and DOM manipulation
- **Breadcord Installation**: Development or release version of Breadcord
- **Text Editor**: Any code editor (VS Code, Atom, etc.)

## 📁 Plugin Structure

### Basic Plugin Layout

A Breadcord plugin consists of these files:

```
my-plugin/
├── plugin.json     # Plugin metadata and configuration
├── plugin.js       # Main plugin code
├── style.css       # Optional: Plugin styles
└── README.md       # Optional: Plugin documentation
```

### plugin.json

The `plugin.json` file contains metadata about your plugin:

```json
{
  "name": "my-plugin",
  "displayName": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "A plugin that does awesome things",
  "author": "Your Name",
  "deps": ["breadcore"],
  "permissions": ["ui", "messages"]
}
```

**Required Fields:**
- `name`: Unique plugin identifier (lowercase, no spaces)
- `displayName`: Human-readable plugin name
- `version`: Plugin version (semantic versioning)
- `description`: Brief description of plugin functionality
- `author`: Plugin author name

**Optional Fields:**
- `deps`: Array of plugin dependencies
- `permissions`: Array of required permissions
- `main`: Custom entry point (default: "plugin.js")

### plugin.js

The main plugin file contains your plugin code:

```javascript
// Basic plugin structure
(function() {
    'use strict';
    
    // Plugin initialization
    console.log('My Plugin loaded!');
    
    // Use BreadAPI to interact with Breadcord
    BreadAPI.info('Plugin initialized successfully');
    
    // Your plugin code here
    
})();
```

## 🛠️ BreadAPI Reference

### Core Functions

#### Logging

```javascript
// Different log levels
BreadAPI.info('Information message');
BreadAPI.warn('Warning message');
BreadAPI.error('Error message');
BreadAPI.debug('Debug message');
```

#### Plugin Information

```javascript
// Get list of loaded plugins
const plugins = BreadAPI.plugins;
console.log('Loaded plugins:', plugins);

// Check if plugin is loaded
if (BreadAPI.plugins.includes('some-plugin')) {
    // Plugin is available
}
```

#### Ready State

```javascript
// Wait for BreadAPI to be ready
BreadAPI.ready.then(() => {
    console.log('BreadAPI is ready!');
    // Initialize your plugin here
});
```

### UI Manipulation

#### DOM Access

```javascript
// Access Discord's DOM elements
const messageContainer = document.querySelector('[data-list-id="chat-messages"]');
const sidebar = document.querySelector('[class*="sidebar"]');

// Create new elements
const button = document.createElement('button');
button.textContent = 'My Plugin Button';
button.onclick = () => {
    BreadAPI.info('Button clicked!');
};
```

#### CSS Injection

```javascript
// Inject custom CSS
const style = document.createElement('style');
style.textContent = `
    .my-plugin-button {
        background: #7289da;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
    }
`;
document.head.appendChild(style);
```

### Event Handling

```javascript
// Listen for Discord events (example implementation)
document.addEventListener('click', (event) => {
    if (event.target.matches('[class*="message"]')) {
        BreadAPI.info('Message clicked');
    }
});

// Custom plugin events
window.addEventListener('breadcord:plugin-loaded', (event) => {
    console.log('Plugin loaded:', event.detail.pluginName);
});
```

## 🔌 Plugin Examples

### Example 1: Simple UI Enhancement

```javascript
// Add a custom button to the UI
(function() {
    'use strict';
    
    BreadAPI.ready.then(() => {
        const toolbar = document.querySelector('[class*="toolbar"]');
        if (toolbar) {
            const button = document.createElement('button');
            button.textContent = '🍞';
            button.title = 'Breadcord Plugin';
            button.className = 'breadcord-custom-btn';
            button.onclick = () => {
                alert('Hello from Breadcord!');
            };
            
            toolbar.appendChild(button);
            BreadAPI.info('Custom button added');
        }
    });
})();
```

### Example 2: Message Enhancement

```javascript
// Enhance messages with custom formatting
(function() {
    'use strict';
    
    function enhanceMessages() {
        const messages = document.querySelectorAll('[class*="messageContent"] span');
        messages.forEach(span => {
            if (span.textContent.includes('🍞')) {
                span.style.background = 'linear-gradient(45deg, #ffd700, #ff8c00)';
                span.style.padding = '2px 4px';
                span.style.borderRadius = '3px';
            }
        });
    }
    
    BreadAPI.ready.then(() => {
        // Initial enhancement
        enhanceMessages();
        
        // Watch for new messages
        const observer = new MutationObserver(enhanceMessages);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        BreadAPI.info('Message enhancement active');
    });
})();
```

### Example 3: Plugin with Dependencies

```javascript
// Plugin that depends on another plugin
(function() {
    'use strict';
    
    // Check for required dependencies
    if (!BreadAPI.plugins.includes('breadcore')) {
        BreadAPI.error('This plugin requires breadcore');
        return;
    }
    
    BreadAPI.ready.then(() => {
        // Plugin functionality here
        BreadAPI.info('Dependent plugin loaded successfully');
    });
})();
```

## 📦 Plugin Management

### Loading Order

Plugins are loaded in dependency order:

1. **Dependency Resolution**: Breadcord analyzes `plugin.json` dependencies
2. **Topological Sort**: Plugins are sorted to respect dependencies
3. **Sequential Loading**: Plugins load one after another
4. **Error Handling**: Failed plugins don't block others

### Error Handling

```javascript
(function() {
    'use strict';
    
    try {
        // Your plugin code
        BreadAPI.ready.then(() => {
            // Initialize plugin
        });
    } catch (error) {
        BreadAPI.error('Plugin failed to load:', error);
    }
})();
```

### Plugin Communication

```javascript
// Plugin A: Expose functionality
window.myPluginAPI = {
    doSomething: function() {
        BreadAPI.info('Doing something...');
    }
};

// Plugin B: Use Plugin A's functionality
if (window.myPluginAPI) {
    window.myPluginAPI.doSomething();
}
```

## 🔒 Security Guidelines

### Best Practices

1. **Validate Input**: Always validate user input and external data
2. **Avoid eval()**: Never use `eval()` or similar dangerous functions
3. **Sanitize HTML**: Sanitize any HTML content you inject
4. **Respect Privacy**: Don't access or store sensitive user data
5. **Use HTTPS**: Always use secure connections for external requests

### Permissions System

Declare required permissions in `plugin.json`:

```json
{
    "permissions": [
        "ui",           // Modify user interface
        "messages",     // Access message content
        "network",      // Make network requests
        "storage",      // Local storage access
        "notifications" // Show notifications
    ]
}
```

## 📋 Testing and Debugging

### Development Setup

1. **Create Plugin Folder**: In `app/src/plugins/`
2. **Add to Plugin List**: Breadcord will automatically detect it
3. **Restart Breadcord**: Restart to load new plugins
4. **Check Console**: Use Developer Tools (F12) to debug

### Debugging Tips

```javascript
// Enable debug logging
BreadAPI.debug('Debug information');

// Check plugin load order
console.log('Load order:', BreadAPI.plugins);

// Monitor events
window.addEventListener('error', (e) => {
    BreadAPI.error('JavaScript error:', e.error);
});
```

### Testing Checklist

- [ ] Plugin loads without errors
- [ ] Dependencies are correctly resolved
- [ ] UI changes work as expected
- [ ] No conflicts with other plugins
- [ ] Error handling works properly
- [ ] Plugin can be safely disabled

## 📤 Publishing Plugins

### Distribution

1. **GitHub Repository**: Host your plugin on GitHub
2. **Documentation**: Include comprehensive README
3. **Examples**: Provide usage examples
4. **Versioning**: Use semantic versioning

### Plugin Store (Future)

A centralized plugin store is planned for future releases, which will allow:
- Easy plugin discovery
- One-click installation
- Automatic updates
- User ratings and reviews

## 🆘 Getting Help

### Resources

- **[API Reference](api-reference.md)**: Complete BreadAPI documentation
- **[GitHub Issues](https://github.com/EricPanDev/Breadcord/issues)**: Report bugs or ask questions
- **Community Plugins**: Study existing plugin code for examples

### Common Issues

**Plugin Not Loading**
- Check `plugin.json` syntax
- Verify file names and structure
- Check browser console for errors

**Dependencies Not Found**
- Ensure dependency names match exactly
- Check dependency load order
- Verify dependencies are installed

**API Functions Not Working**
- Ensure BreadAPI is ready
- Check for typos in function names
- Verify you're using the correct API version

---

**Next Steps**: 
- [API Reference →](api-reference.md)
- [View Example Plugins](https://github.com/EricPanDev/Breadcord/tree/main/examples)
- [Troubleshooting →](troubleshooting.md)