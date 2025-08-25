# API Reference

Complete reference for the BreadAPI and Breadcord plugin development.

## 📖 Overview

The BreadAPI provides a safe and standardized way for plugins to interact with Breadcord and Discord functionality. All API functions are available through the global `BreadAPI` object.

## 🔄 Core API

### BreadAPI Object

The main API object available to all plugins:

```javascript
// Global BreadAPI object
window.BreadAPI
```

### Ready State

#### `BreadAPI.ready`

A Promise that resolves when the BreadAPI is fully initialized.

```javascript
// Type: Promise<void>
BreadAPI.ready.then(() => {
    console.log('BreadAPI is ready!');
    // Initialize your plugin here
});

// Or with async/await
async function initPlugin() {
    await BreadAPI.ready;
    // Plugin initialization code
}
```

### Plugin Management

#### `BreadAPI.plugins`

Array of currently loaded plugin names.

```javascript
// Type: string[]
console.log('Loaded plugins:', BreadAPI.plugins);

// Check if specific plugin is loaded
if (BreadAPI.plugins.includes('breadcore')) {
    console.log('breadcore is loaded');
}
```

## 📝 Logging API

### Log Levels

#### `BreadAPI.info(message, ...args)`

Log informational messages.

```javascript
BreadAPI.info('Plugin loaded successfully');
BreadAPI.info('User action:', action, user);
```

#### `BreadAPI.warn(message, ...args)`

Log warning messages.

```javascript
BreadAPI.warn('Deprecated function used');
BreadAPI.warn('Plugin conflict detected:', conflictingPlugin);
```

#### `BreadAPI.error(message, ...args)`

Log error messages.

```javascript
BreadAPI.error('Failed to load resource');
BreadAPI.error('API call failed:', error);
```

#### `BreadAPI.debug(message, ...args)`

Log debug messages (only shown in development mode).

```javascript
BreadAPI.debug('Debug information:', debugData);
```

### Parameters

- `message` (string): The main log message
- `...args` (any): Additional arguments to log

### Example Usage

```javascript
// Basic logging
BreadAPI.info('Hello from my plugin!');

// Logging with additional data
BreadAPI.warn('Configuration issue', {
    setting: 'theme',
    value: 'invalid-theme'
});

// Error logging
try {
    riskyOperation();
} catch (error) {
    BreadAPI.error('Operation failed:', error);
}
```

## 🌐 DOM and UI API

### Element Selection

While not part of BreadAPI directly, these are common patterns for Discord element selection:

```javascript
// Common Discord selectors
const selectors = {
    // Chat and Messages
    messageContainer: '[data-list-id="chat-messages"]',
    messageContent: '[class*="messageContent"]',
    messageInput: '[class*="textArea"] [class*="textInput"]',
    
    // Navigation
    sidebar: '[class*="sidebar"]',
    channelList: '[class*="channels"]',
    serverList: '[class*="guilds"]',
    
    // User Interface
    toolbar: '[class*="toolbar"]',
    titleBar: '[class*="titleBar"]',
    userArea: '[class*="panels"]'
};

// Example usage
const messageInput = document.querySelector(selectors.messageInput);
if (messageInput) {
    // Interact with message input
}
```

### Style Injection

Inject custom CSS into the document:

```javascript
function injectCSS(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    return style;
}

// Example usage
const customStyle = injectCSS(`
    .my-plugin-element {
        background: #7289da;
        color: white;
        padding: 8px;
        border-radius: 4px;
    }
`);
```

## 🔌 Plugin System API

### Plugin Loading

#### Load Order Resolution

Plugins are loaded based on their dependencies. The system:

1. **Reads plugin.json**: Extracts dependency information
2. **Resolves dependencies**: Creates dependency graph
3. **Topological sort**: Determines load order
4. **Sequential loading**: Loads plugins one by one

#### Dependency Declaration

In `plugin.json`:

```json
{
    "name": "my-plugin",
    "deps": ["breadcore", "other-plugin"]
}
```

#### Required Plugins

Some plugins are always loaded:

```javascript
const REQUIRED_PLUGINS = ["breadcore"];
```

### Plugin Communication

#### Global Variables

Plugins can expose functionality through global variables:

```javascript
// Plugin A: Expose API
window.myPluginAPI = {
    version: '1.0.0',
    doSomething: function(param) {
        BreadAPI.info('Doing something with:', param);
        return result;
    }
};

// Plugin B: Use API
if (window.myPluginAPI) {
    const result = window.myPluginAPI.doSomething('test');
}
```

#### Custom Events

Use custom events for plugin communication:

```javascript
// Plugin A: Dispatch event
const event = new CustomEvent('my-plugin:action', {
    detail: { data: 'some data' }
});
window.dispatchEvent(event);

// Plugin B: Listen for event
window.addEventListener('my-plugin:action', (event) => {
    console.log('Received data:', event.detail.data);
});
```

## 🔧 Utility Functions

### Common Utility Patterns

```javascript
// Wait for element to exist
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        
        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element ${selector} not found within ${timeout}ms`));
        }, timeout);
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
```

## 📊 Error Handling

### Error Types

```javascript
// Plugin loading errors
try {
    // Plugin initialization
} catch (error) {
    BreadAPI.error('Plugin initialization failed:', error);
}

// Async operation errors
async function asyncOperation() {
    try {
        await someAsyncTask();
    } catch (error) {
        BreadAPI.error('Async operation failed:', error);
    }
}

// DOM operation errors
function safeDOMOperation() {
    try {
        const element = document.querySelector('.some-element');
        if (!element) {
            throw new Error('Required element not found');
        }
        // Perform operation
    } catch (error) {
        BreadAPI.warn('DOM operation failed:', error);
    }
}
```

### Best Practices

1. **Always use try-catch**: Wrap risky operations
2. **Check element existence**: Verify DOM elements exist before using
3. **Handle async errors**: Use proper error handling for promises
4. **Log appropriately**: Use correct log levels for different errors
5. **Graceful degradation**: Continue functioning when non-critical operations fail

## 🔒 Security Considerations

### Safe Practices

```javascript
// ✅ Good: Safe DOM manipulation
function addButton(text, onclick) {
    const button = document.createElement('button');
    button.textContent = text; // Safe: no HTML injection
    button.addEventListener('click', onclick); // Safe: direct event binding
    return button;
}

// ❌ Bad: Unsafe HTML injection
function addButtonUnsafe(html) {
    const div = document.createElement('div');
    div.innerHTML = html; // Dangerous: potential XSS
    return div.firstChild;
}
```

### Input Validation

```javascript
// Validate user input
function processUserInput(input) {
    if (typeof input !== 'string') {
        BreadAPI.warn('Invalid input type:', typeof input);
        return null;
    }
    
    if (input.length > 1000) {
        BreadAPI.warn('Input too long:', input.length);
        return null;
    }
    
    // Sanitize input
    const sanitized = input.replace(/[<>]/g, '');
    return sanitized;
}
```

## 📋 Complete Example

Here's a complete plugin example demonstrating API usage:

```javascript
// complete-example-plugin.js
(function() {
    'use strict';
    
    // Plugin metadata (from plugin.json)
    const PLUGIN_NAME = 'complete-example';
    const PLUGIN_VERSION = '1.0.0';
    
    // Wait for BreadAPI to be ready
    BreadAPI.ready.then(() => {
        initializePlugin();
    }).catch(error => {
        BreadAPI.error('Failed to initialize plugin:', error);
    });
    
    function initializePlugin() {
        BreadAPI.info(`${PLUGIN_NAME} v${PLUGIN_VERSION} initializing...`);
        
        // Check dependencies
        if (!BreadAPI.plugins.includes('breadcore')) {
            BreadAPI.error('Required dependency "breadcore" not found');
            return;
        }
        
        // Add custom CSS
        injectStyles();
        
        // Add UI elements
        addCustomButton();
        
        // Set up event listeners
        setupEventListeners();
        
        BreadAPI.info(`${PLUGIN_NAME} initialized successfully`);
    }
    
    function injectStyles() {
        const css = `
            .${PLUGIN_NAME}-button {
                background: #7289da;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin: 4px;
            }
            
            .${PLUGIN_NAME}-button:hover {
                background: #5a6fb8;
            }
        `;
        
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }
    
    async function addCustomButton() {
        try {
            // Wait for toolbar to exist
            const toolbar = await waitForElement('[class*="toolbar"]');
            
            const button = document.createElement('button');
            button.textContent = '🍞 Example';
            button.className = `${PLUGIN_NAME}-button`;
            button.title = `${PLUGIN_NAME} v${PLUGIN_VERSION}`;
            
            button.addEventListener('click', handleButtonClick);
            
            toolbar.appendChild(button);
            BreadAPI.info('Custom button added to toolbar');
            
        } catch (error) {
            BreadAPI.warn('Could not add button:', error);
        }
    }
    
    function setupEventListeners() {
        // Listen for custom events
        window.addEventListener(`${PLUGIN_NAME}:custom-event`, (event) => {
            BreadAPI.info('Custom event received:', event.detail);
        });
        
        // Monitor DOM changes
        const observer = new MutationObserver(debounce(handleDOMChanges, 100));
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    function handleButtonClick() {
        BreadAPI.info('Example button clicked!');
        
        // Dispatch custom event
        const event = new CustomEvent(`${PLUGIN_NAME}:button-clicked`, {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }
    
    function handleDOMChanges() {
        // Handle dynamic content changes
        BreadAPI.debug('DOM changes detected');
    }
    
    // Utility function
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found`));
            }, timeout);
        });
    }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
})();
```

---

**Related Documentation**:
- [Plugin Development Guide](plugin-development.md)
- [User Guide](user-guide.md)
- [Troubleshooting](troubleshooting.md)