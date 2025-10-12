# Troubleshooting Guide

Common issues and solutions for Breadcord users and developers.

## 🚨 Common Issues

### Installation Problems

#### Windows: SmartScreen Warning

**Problem**: Windows shows "Windows protected your PC" warning.

**Solution**: 
1. Click "More info"
2. Click "Run anyway"
3. This is normal for unsigned applications

**Alternative**: 
- Download from official GitHub releases only
- Verify file hash if provided

#### macOS: "App is damaged"

**Problem**: macOS shows "Breadcord is damaged and can't be opened".

**Solutions**:

**Option 1 - Automatic Installer (Recommended)**:
```bash
curl -fs https://breadcord.ericpan.dev/macos_setup.sh | bash
```

**Option 2 - Manual Fix**:
```bash
sudo xattr -rd com.apple.quarantine /Applications/Breadcord.app
```

**Option 3 - Security Settings**:
1. Open System Preferences → Security & Privacy
2. Click "Open Anyway" if you see the Breadcord option

#### Linux: Permission Denied

**Problem**: Cannot execute AppImage file.

**Solution**:
```bash
chmod +x Breadcord-linux-*.AppImage
./Breadcord-linux-*.AppImage
```

#### Linux: Missing Dependencies

**Problem**: Error about missing libraries or dependencies.

**Solutions**:

**For .deb packages**:
```bash
sudo apt-get install -f
```

**For missing system libraries**:
```bash
# Common missing dependencies
sudo apt-get update
sudo apt-get install libgtk-3-0 libxss1 libnss3 libasound2
```

**For older distributions**:
- Use AppImage instead of .deb
- AppImage includes all dependencies

## 🔑 Login Issues

### Cannot Login to Discord

**Problem**: Login page doesn't load or login fails.

**Solutions**:
1. **Check Internet Connection**: Ensure stable internet
2. **Clear Cache**: Delete application data and restart
3. **Disable VPN**: Try without VPN/proxy
4. **Try Different Network**: Use mobile hotspot to test
5. **Check Discord Status**: Visit [Discord Status](https://discordstatus.com)

### Token Issues

**Problem**: "Invalid token" or frequent re-login required.

**Solutions**:
1. **Re-login**: Log out and log back in
2. **Clear Stored Tokens**: 
   - Windows: Check Windows Credential Manager
   - macOS: Check Keychain Access
   - Linux: Clear stored credentials manually
3. **Disable 2FA temporarily**: Test without two-factor authentication
4. **Check Account Status**: Ensure Discord account isn't restricted

### Keychain/Keytar Issues

**Problem**: Token storage fails or "keytar" errors.

**Solutions**:

**Windows**:
```bash
# Reinstall with npm (in app directory)
cd app
npm uninstall keytar
npm install keytar
```

**macOS**:
- Ensure Keychain Access permissions are granted
- Try running with `sudo` once to grant permissions

**Linux**:
```bash
# Install keyring dependencies
sudo apt-get install libsecret-1-dev gnome-keyring
# Or for different desktops:
sudo apt-get install kde-cli-tools  # For KDE
```

## 🔌 Plugin Issues

### Plugin Not Loading

**Problem**: Plugin doesn't appear or load.

**Debugging Steps**:

1. **Check File Structure**:
   ```
   plugins/your-plugin/
   ├── plugin.json  ✓ Required
   ├── plugin.js    ✓ Required
   └── README.md    ○ Optional
   ```

2. **Validate plugin.json**:
   ```json
   {
     "name": "your-plugin",
     "displayName": "Your Plugin",
     "version": "1.0.0",
     "description": "Plugin description",
     "author": "Your Name"
   }
   ```

3. **Check Console**: Open Developer Tools (F12) and look for errors

4. **Verify Dependencies**: Ensure all required plugins are loaded

### Plugin Dependency Errors

**Problem**: "Circular dependency" or "Missing dependency" errors.

**Solutions**:

1. **Check dependency chain**: Review `deps` in plugin.json
2. **Fix circular references**: Plugin A depends on B, B depends on A
3. **Install missing dependencies**: Ensure all required plugins exist

**Example Fix**:
```json
// Before (circular)
// Plugin A depends on B, Plugin B depends on A

// After (fixed)
// Plugin A depends on Base, Plugin B depends on Base
{
  "name": "plugin-a",
  "deps": ["base-plugin"]
}
```

### Plugin Conflicts

**Problem**: Plugins interfere with each other.

**Solutions**:
1. **Disable plugins one by one**: Identify the conflicting plugin
2. **Check CSS conflicts**: Look for overlapping styles
3. **Review event listeners**: Ensure plugins don't block each other
4. **Use namespaces**: Prefix CSS classes and IDs with plugin name

## ⚡ Performance Issues

### Slow Startup

**Problem**: Breadcord takes a long time to start.

**Solutions**:
1. **Disable unused plugins**: Remove plugins you don't need
2. **Clear cache**: Delete application cache and data
3. **Check disk space**: Ensure sufficient free space
4. **Antivirus exclusion**: Add Breadcord to antivirus exceptions
5. **Update Breadcord**: Use the latest version

### High Memory Usage

**Problem**: Breadcord uses too much RAM.

**Solutions**:
1. **Restart regularly**: Close and reopen Breadcord periodically
2. **Limit plugins**: Disable memory-heavy plugins
3. **Close unnecessary tabs**: If using developer tools
4. **Check for memory leaks**: Monitor memory usage in Task Manager

### Connection Issues

**Problem**: Frequent disconnections or connection errors.

**Solutions**:
1. **Check network stability**: Test with other applications
2. **Disable proxy/VPN**: Try direct connection
3. **Change DNS**: Use 8.8.8.8 or 1.1.1.1
4. **Firewall settings**: Ensure Breadcord isn't blocked
5. **Router issues**: Restart router/modem

## 🛠️ Development Issues

### Build Errors

**Problem**: `npm run build` fails.

**Solutions**:

1. **Clean install**:
   ```bash
   cd app
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node.js version**: Use Node.js 16+ (recommended 18+)
   ```bash
   node --version
   npm --version
   ```

3. **Platform-specific build**:
   ```bash
   # Build for specific platform
   npm run build -- --win
   npm run build -- --mac
   npm run build -- --linux
   ```

### Development Mode Issues

**Problem**: `npm start` fails or app doesn't load.

**Solutions**:

1. **Check port conflicts**: Ensure no other apps use the same port
2. **Clear Electron cache**:
   ```bash
   # Clear Electron cache
   rm -rf ~/.cache/electron
   # Or on Windows
   del /s /q %APPDATA%\electron
   ```

3. **Reinstall Electron**:
   ```bash
   cd app
   npm uninstall electron
   npm install electron
   ```

### Plugin Development Issues

**Problem**: Plugin development environment not working.

**Solutions**:

1. **Enable Developer Tools**: Press F12 to open console
2. **Check plugin path**: Ensure plugin is in correct directory
3. **Restart after changes**: Restart Breadcord after plugin modifications
4. **Use debug logging**: Add `BreadAPI.debug()` calls
5. **Test individually**: Disable other plugins to isolate issues

## 🔍 Diagnostic Tools

### Developer Console

Access with F12 or `Ctrl+Shift+I`:

**Useful Console Commands**:
```javascript
// Check loaded plugins
console.log(BreadAPI.plugins);

// Check BreadAPI status
console.log(BreadAPI.ready);

// Monitor network requests
// Go to Network tab and reload

// Check for JavaScript errors
// Look in Console tab for red error messages
```

### Log Files

**Location of logs**:
- **Windows**: `%APPDATA%\Breadcord\logs\`
- **macOS**: `~/Library/Logs/Breadcord/`
- **Linux**: `~/.config/Breadcord/logs/`

**What to look for**:
- Error messages
- Plugin loading issues
- Network connection problems
- Authentication failures

### System Information

When reporting issues, include:

1. **Operating System**: Version and architecture
2. **Breadcord Version**: Check Help → About
3. **Node.js Version**: `node --version`
4. **Electron Version**: Check package.json
5. **Installed Plugins**: List of active plugins
6. **Error Messages**: Complete error text and stack traces

## 📞 Getting Help

### Before Reporting Issues

1. **Search existing issues**: Check GitHub Issues
2. **Update Breadcord**: Try the latest version
3. **Minimal reproduction**: Try with plugins disabled
4. **Gather information**: Collect system info and error messages

### How to Report Issues

1. **Go to GitHub Issues**: [Breadcord Issues](https://github.com/EricPanDev/Breadcord/issues)
2. **Use issue templates**: Fill out the provided template
3. **Include details**:
   - Operating System and version
   - Breadcord version
   - Steps to reproduce
   - Expected vs actual behavior
   - Error messages or screenshots
   - Installed plugins

### Community Resources

- **GitHub Discussions**: Community Q&A
- **Plugin Repository**: Community plugins and examples
- **Documentation**: This documentation and guides

## 🚀 Quick Fixes

### Reset Everything

If all else fails, try a complete reset:

1. **Backup settings**: Save any important configurations
2. **Uninstall Breadcord**: Remove application
3. **Clear data directories**:
   - Windows: `%APPDATA%\Breadcord`
   - macOS: `~/Library/Application Support/Breadcord`
   - Linux: `~/.config/Breadcord`
4. **Reinstall**: Download and install fresh copy
5. **Test basic functionality**: Before adding plugins

### Emergency Fixes

**Can't start Breadcord**:
```bash
# Try safe mode (if implemented)
Breadcord --safe-mode

# Or clear cache
rm -rf ~/.cache/electron  # Linux/macOS
del /s /q %APPDATA%\electron  # Windows
```

**Corrupted installation**:
1. Download fresh copy from GitHub releases
2. Verify file integrity (check file size)
3. Reinstall completely

---

**Still need help?** [Open an issue on GitHub](https://github.com/EricPanDev/Breadcord/issues) with detailed information about your problem.