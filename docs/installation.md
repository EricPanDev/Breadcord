# Installation Guide

This guide covers how to install Breadcord on different operating systems.

## 📋 System Requirements

- **Operating System**: Windows 10+, macOS 10.14+, or Linux
- **Architecture**: x64 (amd64) or ARM64
- **Memory**: 4GB RAM recommended
- **Storage**: 500MB free space
- **Network**: Internet connection for Discord functionality

## 🚀 Quick Installation

### Automatic Installation (Recommended)

#### macOS
For macOS users, we provide an automated installer that handles everything:

```bash
curl -fs https://breadcord.ericpan.dev/macos_setup.sh | bash
```

This script will:
- Download the latest version
- Install to Applications folder
- Fix macOS "damaged app" warnings
- Create desktop shortcuts

### Manual Installation

#### Windows

1. **Download** the latest Windows build:
   - [Windows x64 (.exe)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-windows-amd64.exe)
   - [Windows ARM64 (.exe)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-windows-arm64.exe)

2. **Run** the downloaded `.exe` file

3. **Security Warning**: Windows may show a SmartScreen warning because the app isn't signed with a paid certificate. Click "More info" → "Run anyway" to proceed safely.

4. **Installation**: Follow the installation wizard prompts

#### macOS

1. **Download** the latest macOS build:
   - [macOS Intel (.dmg)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-macos-amd64.dmg)
   - [macOS Apple Silicon (.dmg)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-macos-arm64.dmg)

2. **Mount** the `.dmg` file and drag Breadcord to Applications

3. **Security Settings**: macOS may show "damaged" warnings. To fix:
   ```bash
   sudo xattr -rd com.apple.quarantine /Applications/Breadcord.app
   ```

4. **Alternative**: Use the automatic installer script (recommended)

#### Linux

**AppImage (Universal)**
1. **Download** the AppImage:
   - [Linux x64 (.AppImage)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-linux-amd64.AppImage)
   - [Linux ARM64 (.AppImage)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-linux-arm64.AppImage)

2. **Make executable**:
   ```bash
   chmod +x Breadcord-linux-*.AppImage
   ```

3. **Run**:
   ```bash
   ./Breadcord-linux-*.AppImage
   ```

**Debian/Ubuntu (.deb)**
1. **Download** the .deb package:
   - [Linux x64 (.deb)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-linux-amd64.deb)
   - [Linux ARM64 (.deb)](https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-linux-arm64.deb)

2. **Install**:
   ```bash
   sudo dpkg -i Breadcord-linux-*.deb
   sudo apt-get install -f  # Fix any dependencies
   ```

## 🔧 Development Setup

If you want to run Breadcord from source:

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [Git](https://git-scm.com/)

### Setup Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/EricPanDev/Breadcord.git
   cd Breadcord
   ```

2. **Install dependencies**:
   ```bash
   cd app
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm start
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

## 🛠️ Post-Installation

After installation:

1. **Launch Breadcord**
2. **Login**: Use your Discord credentials
3. **Explore**: Check out the [User Guide](user-guide.md)
4. **Customize**: Install plugins from the plugin manager

## ❓ Troubleshooting

### Common Issues

**"App is damaged" (macOS)**
- Use the automatic installer script, or
- Run: `sudo xattr -rd com.apple.quarantine /Applications/Breadcord.app`

**SmartScreen warning (Windows)**
- Click "More info" → "Run anyway"
- This is normal for unsigned applications

**Permission denied (Linux)**
- Make sure the AppImage is executable: `chmod +x Breadcord-*.AppImage`

**Dependencies missing (Linux .deb)**
- Run: `sudo apt-get install -f`

For more help, see our [Troubleshooting Guide](troubleshooting.md) or [open an issue](https://github.com/EricPanDev/Breadcord/issues).

---

**Next Steps**: [User Guide →](user-guide.md)