# Breadcord Plugin Manager

## Overview

The Plugin Manager allows you to enable or disable plugins in Breadcord. This gives you full control over which features are loaded when the application starts.

## Opening the Plugin Manager

There are two ways to open the Plugin Manager:

1. **Keyboard Shortcut**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) from anywhere in the app
2. **Direct Access**: Open `src/plugins.html` in a browser window

## Features

### Plugin Management
- **Enable/Disable Plugins**: Click the toggle switch on any plugin card to enable or disable it
- **Search**: Use the search box to filter plugins by name, ID, or description
- **Statistics**: View the total number of plugins and how many are currently enabled
- **Dependency Management**: The manager automatically handles plugin dependencies

### Safety Features

1. **Core Plugin Protection**: Core plugins (like `breadcore` and `breadcache`) cannot be disabled
2. **Dependency Validation**: 
   - You cannot enable a plugin if its dependencies are disabled
   - You cannot disable a plugin if other enabled plugins depend on it
3. **Required Plugin Indicator**: Plugins that are required by others are marked with a "REQUIRED" badge

### Plugin Information

Each plugin card displays:
- **Plugin Name**: The human-readable name
- **Plugin ID**: The technical identifier (used in code)
- **Version**: Current version number
- **Description**: What the plugin does
- **Dependencies**: List of other plugins this one depends on
- **Status Badges**: Core or Required indicators

## How to Use

1. **Browse Plugins**: Scroll through the plugin grid to see all available plugins
2. **Search**: Type in the search box to find specific plugins
3. **Toggle Plugins**: Click the toggle switch to enable or disable a plugin
4. **Save Changes**: Click "Save & Restart" to apply your changes
5. **Reset Changes**: Click "Reset" to undo any unsaved changes

## Configuration

Plugin configuration is stored in your application data directory:
- **macOS**: `~/Library/Application Support/Breadcord/plugin-config.json`
- **Windows**: `%APPDATA%/Breadcord/plugin-config.json`
- **Linux**: `~/.config/Breadcord/plugin-config.json`

The configuration file contains a list of enabled plugin IDs:

```json
{
  "enabled": [
    "breadcore",
    "breadcache",
    "breadcord_ui",
    "breadcord_messagerenderer",
    "breadcord_messagecomposer"
  ]
}
```

## Plugin Dependencies

Plugins can depend on other plugins. The plugin manager uses a topological sort to ensure plugins are loaded in the correct order, with dependencies loaded first.

For example, `breadcord_ui` depends on:
- `breadcore`
- `breadcache`
- `breadcord_messagerenderer`

If you try to enable `breadcord_ui` without these dependencies, the manager will show an error.

## Troubleshooting

### Plugin Won't Disable
- Check if other enabled plugins depend on it
- Core plugins cannot be disabled

### Plugin Won't Enable
- Check if all its dependencies are enabled
- Look for error messages in the alert bar

### Changes Not Taking Effect
- Make sure you clicked "Save & Restart"
- Check that the application actually restarted

### Reset to Default
If you want to reset to all plugins enabled:
1. Close Breadcord
2. Delete the `plugin-config.json` file from your application data directory
3. Restart Breadcord

## Available Plugins

### Core Plugins
- **breadcore**: Essential core functionality (cannot be disabled)
- **breadcache**: Caching system for Discord data (cannot be disabled)

### UI Plugins
- **breadcord_ui**: Main user interface
- **breadcord_messagerenderer**: Message display and rendering
- **breadcord_messagecomposer**: Message input and composition

### Feature Plugins
- **breadcord_spotify**: Spotify integration
- **breadcord_ui_spotify**: Spotify UI components
- **breadcord_voice**: Voice channel support

## Developer Notes

### Adding Plugins to the System

1. Place your plugin folder in `src/plugins/`
2. Include a `plugin.json` with metadata:

```json
{
  "id": "my_plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What my plugin does",
  "dependencies": ["breadcore"]
}
```

3. Create your `plugin.js` with the plugin code
4. The plugin will automatically appear in the Plugin Manager

### Plugin Load Order

The loader uses dependency information to determine load order automatically. You don't need to manually specify the order - just list your dependencies in `plugin.json`.

### Making a Plugin Optional

By default, plugins can be disabled unless:
1. They're marked as core (`breadcore`, `breadcache`)
2. Other enabled plugins depend on them

To make a plugin truly optional, ensure no other plugins list it as a dependency.
