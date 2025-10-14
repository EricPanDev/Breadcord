# Message Options API

The Breadcord Message Renderer now supports customizable message option buttons that appear when hovering over messages.

## Built-in Buttons

Three buttons are included by default:
- **Reply** (↩️ icon): Reply to the message (placeholder for now)
- **React** (😊 icon): Add reactions to messages (placeholder for now)
- **Delete** (🗑️ icon): Delete the message with confirmation

## Adding Custom Buttons

Other plugins can register their own message option buttons using the API:

### Register a Button

```javascript
const unregister = BreadcordMessageRenderer.registerMessageOptionButton({
  id: 'my-button',
  label: 'My Action',
  icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
  order: 10,
  onClick: (message, event, options) => {
    console.log('Button clicked for message:', message.id);
    // Your custom logic here
  }
});
```

### Button Configuration

- **id** (string): Unique identifier for the button
- **label** (string): Tooltip text shown on hover
- **icon** (string): SVG string (recommended) or emoji/text to display as the button icon
- **order** (number, optional): Display order (lower numbers appear first, default: 100)
- **onClick** (function): Handler called when button is clicked
  - `message`: The full message object
  - `event`: The click event
  - `options`: Render options passed to renderMessage

### Icon Format

Icons should be SVG strings for best results:

```javascript
// Good: SVG icon
icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="..."/></svg>'

// Also works: Emoji or text
icon: '⭐'
```

SVG icons will automatically inherit the button's text color and respond to hover states.

### Remove a Button

Using the unregister function returned from registration:

```javascript
unregister(); // Remove this specific button
```

Or by ID:

```javascript
BreadcordMessageRenderer.unregisterMessageOptionButton('my-button');
```

## Example Plugin Integration

```javascript
// In your plugin.js
(function() {
  let unregisterButton = null;

  function onLoad() {
    // Register your custom button
    unregisterButton = BreadcordMessageRenderer.registerMessageOptionButton({
      id: 'my-plugin-action',
      label: 'Do Something Cool',
      icon: '🚀',
      order: 5,
      onClick: async (message, event) => {
        console.log('Doing something cool with:', message.id);
        
        // Example: Make an API request
        try {
          const result = await BreadAPI.rest.request({
            method: 'POST',
            path: `/channels/${message.channel_id}/messages/${message.id}/some-action`,
            body: { data: 'value' }
          });
          
          if (result.ok) {
            console.log('Action succeeded!');
          }
        } catch (err) {
          console.error('Action failed:', err);
        }
      }
    });
  }

  function onUnload() {
    // Clean up when plugin is disabled
    if (unregisterButton) {
      unregisterButton();
    }
  }

  window.MyPlugin = { onLoad, onUnload };
})();
```

## Styling

The toolbar automatically inherits theme colors from CSS variables:
- `--toolbar-bg`: Toolbar background
- `--toolbar-border`: Toolbar border color
- `--btn-bg`: Button background
- `--btn-hover-bg`: Button hover background
- `--btn-focus`: Button focus outline color

Buttons can be styled further using the class `.breadcord-message__option-btn[data-option-id="your-id"]`.
