# Contributing to Breadcord

Thank you for your interest in contributing to Breadcord! This document provides guidelines for contributing to this project.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/Breadcord.git
   cd Breadcord
   ```
3. **Install dependencies**:
   ```bash
   cd app
   npm install
   ```
4. **Run the application** to test your setup:
   ```bash
   npm start
   ```

## Development Workflow

1. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes** following the coding standards below
3. **Test your changes** thoroughly
4. **Commit your changes** with a clear commit message:
   ```bash
   git commit -m "Add: brief description of your changes"
   ```
5. **Push to your fork** and **create a pull request**

## Coding Standards

- Follow existing code style and formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Keep commits focused and atomic
- Write clear commit messages

## Project Structure

- `app/` - Main Electron application
  - `index.js` - Main process entry point
  - `preload.js` - Preload script for renderer process
  - `src/` - Renderer process files (HTML, CSS, JS)
  - `icon/` - Application icons
- `docs/` - Documentation and setup scripts
- `.github/` - GitHub workflows and templates

## Building

The project uses Electron Builder for packaging:

```bash
cd app
npm run build
```

This will create platform-specific builds in the `dist/` directory.

## Reporting Issues

- Use the issue templates provided
- Include detailed steps to reproduce
- Provide your operating system and version
- Include relevant log output if applicable

## Pull Request Guidelines

- Ensure your PR has a clear title and description
- Reference any related issues using `#issue-number`
- Make sure all checks pass
- Be prepared to address feedback and make changes

## Plugin Development

Breadcord features a plugin system. Plugins should:
- Use the BreadAPI for interaction with the client
- Follow security best practices
- Be well-documented
- Include examples of usage

## Code of Conduct

Be respectful and professional in all interactions. We're building something fun but we take the development process seriously.

## Questions?

If you have questions about contributing, feel free to:
- Open an issue with the "question" label
- Check existing discussions and issues
- Review the project documentation

Thank you for contributing to Breadcord! 🍞