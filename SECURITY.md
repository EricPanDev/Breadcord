# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions of Breadcord:

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | ✅ Yes             |
| 1.x     | ❌ No              |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security vulnerability in Breadcord, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by:

1. **Email**: Send details to [eric@ericpan.dev](mailto:eric@ericpan.dev)
2. **Subject**: Include "SECURITY" in the subject line
3. **Details**: Provide as much information as possible about the vulnerability

### What to Include

When reporting a security vulnerability, please include:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up questions

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Update**: Within 7 days with our assessment
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### What to Expect

1. **Acknowledgment**: We'll confirm receipt of your report
2. **Investigation**: We'll investigate and assess the vulnerability
3. **Coordination**: We'll work with you to understand the issue
4. **Resolution**: We'll develop and test a fix
5. **Disclosure**: We'll coordinate responsible disclosure
6. **Credit**: We'll acknowledge your contribution (if desired)

## Security Considerations

### For Users

- **Download only from official sources**: GitHub releases or official distribution channels
- **Keep Breadcord updated**: Install security updates promptly
- **Use strong Discord passwords**: Breadcord handles Discord authentication
- **Report suspicious behavior**: If you notice anything unusual

### For Contributors

- **Code review**: All code changes go through review
- **Dependency updates**: Keep dependencies current and secure
- **Input validation**: Validate all user inputs
- **Secure coding practices**: Follow OWASP guidelines

## Scope

This security policy covers:

- The main Breadcord application
- Official plugins and extensions
- Build and distribution infrastructure
- Documentation and setup scripts

This policy does not cover:

- Third-party plugins not officially maintained
- User-generated content
- Issues in Discord's platform itself
- Social engineering attacks

## Security Features

Breadcord includes several security measures:

- **Sandboxed renderer processes**: Using Electron's security best practices
- **Secure token handling**: Discord tokens are stored securely using keytar
- **Content Security Policy**: Preventing XSS attacks
- **Node.js isolation**: Limited Node.js access in renderer processes

## Responsible Disclosure

We believe in responsible disclosure and will:

- Work with security researchers to understand and fix issues
- Provide credit to researchers who report vulnerabilities responsibly
- Coordinate timing of public disclosure
- Maintain transparency about security issues and fixes

## Contact

For security-related matters:
- **Email**: eric@ericpan.dev
- **Subject**: Include "SECURITY" in the subject line

For general questions about security:
- Open a GitHub issue with the "security" label
- Reference this security policy

Thank you for helping keep Breadcord and its users safe! 🔒