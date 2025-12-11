# Contributing to Basher

Thank you for your interest in contributing to Basher! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a branch for your changes
5. Make your changes and test them
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/basher.git
cd basher

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Testing Your Changes

```bash
# Run the test suite
npm test

# Run linting
npm run lint

# Build to verify TypeScript compiles
npm run build
```

## How to Contribute

### Types of Contributions

- **Bug fixes**: Fix issues reported in GitHub Issues
- **Features**: Implement new features (please discuss first)
- **Documentation**: Improve README, add examples, fix typos
- **Tests**: Add test coverage
- **Performance**: Optimize existing code

### Before You Start

1. Check existing issues and PRs to avoid duplicates
2. For significant changes, open an issue first to discuss
3. For security issues, see [SECURITY.md](SECURITY.md)

## Pull Request Process

1. **Branch naming**: Use descriptive names like `fix/race-condition` or `feature/new-parser`

2. **Commit messages**: Write clear, concise commit messages
   - Use present tense ("Add feature" not "Added feature")
   - Reference issues when applicable ("Fix #123")

3. **Before submitting**:
   - Ensure all tests pass (`npm test`)
   - Run linting (`npm run lint`)
   - Update documentation if needed
   - Add tests for new features

4. **PR description**: Include:
   - Summary of changes
   - Related issue numbers
   - Screenshots/examples if applicable
   - Breaking changes (if any)

5. **Review process**:
   - Maintainers will review your PR
   - Address any requested changes
   - Once approved, your PR will be merged

## Code Style

### TypeScript Guidelines

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use explicit types for function parameters
- Use descriptive variable names
- Add JSDoc comments for public APIs

### File Organization

```
src/
├── index.ts          # Main entry point
├── services/         # Core business logic
├── utils/            # Helper utilities
└── types/            # TypeScript type definitions
```

### Example Code Style

```typescript
/**
 * Execute a command with the given options
 * @param command - The shell command to execute
 * @param options - Execution options
 * @returns Command execution result
 */
export async function executeCommand(
  command: string,
  options?: ExecuteOptions
): Promise<CommandResult> {
  // Implementation
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node test-server.mjs
node test-advanced-features.mjs
```

### Writing Tests

- Test new features and bug fixes
- Include both positive and negative test cases
- Mock external dependencies when appropriate

## Reporting Bugs

### Before Reporting

1. Check if the issue already exists
2. Try to reproduce with the latest version
3. Gather relevant information

### Bug Report Template

When opening an issue, include:

- **Description**: Clear description of the bug
- **Steps to reproduce**: Numbered steps to reproduce
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: OS, Node.js version, Basher version
- **Logs**: Relevant error messages or logs

## Suggesting Features

### Feature Request Guidelines

1. Check existing issues for similar requests
2. Describe the use case clearly
3. Explain why this would be valuable
4. Consider potential implementation approaches

### Feature Request Template

- **Problem**: What problem does this solve?
- **Solution**: What's your proposed solution?
- **Alternatives**: What alternatives have you considered?
- **Additional context**: Any other relevant information

## Questions?

If you have questions about contributing, feel free to:

- Open a GitHub issue with the "question" label
- Check existing documentation and issues

Thank you for contributing to Basher!
