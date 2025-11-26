#!/bin/bash

# Installation script for Azure Provider Plugin

echo "=========================================="
echo "Azure Provider Plugin Installation"
echo "=========================================="
echo ""

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 18 or later from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"
echo ""

# Check npm
echo "Checking npm..."
NPM_VERSION=$(npm --version 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ Error: npm is not installed"
    exit 1
fi

echo "✅ npm version: $NPM_VERSION"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Make executable
echo "Making plugin executable..."
chmod +x index.js

echo "✅ Plugin is executable"
echo ""

# Link globally
echo "Linking plugin globally..."
npm link

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to link plugin"
    echo "You may need to run with sudo: sudo npm link"
    exit 1
fi

echo "✅ Plugin linked globally"
echo ""

# Create 'azure' wrapper for Docker Compose
echo "Creating 'azure' wrapper for Docker Compose..."
chmod +x azure

# Try to link to /usr/local/bin (may need sudo)
if [ -w /usr/local/bin ]; then
    ln -sf "$(pwd)/azure" /usr/local/bin/azure
    echo "✅ 'azure' command linked to /usr/local/bin"
else
    echo "⚠️  Linking 'azure' to /usr/local/bin requires sudo"
    echo "   Run: sudo ln -sf $(pwd)/azure /usr/local/bin/azure"
    echo "   Or add $(pwd) to your PATH"
    echo ""
    echo "   Adding to PATH now..."
    echo "export PATH=\"$(pwd):\$PATH\"" >> ~/.zshrc
    export PATH="$(pwd):$PATH"
    echo "✅ Added to PATH in ~/.zshrc"
fi

echo ""

# Verify installation
echo "Verifying installation..."
PLUGIN_PATH=$(which docker-azure)

if [ -z "$PLUGIN_PATH" ]; then
    echo "⚠️  Warning: docker-azure not found in PATH"
    echo "You may need to restart your terminal or add npm global bin to PATH"
else
    echo "✅ docker-azure installed at: $PLUGIN_PATH"
fi

# Verify azure wrapper
AZURE_PATH=$(which azure)
if [ -z "$AZURE_PATH" ]; then
    echo "⚠️  Warning: azure not found in PATH"
    echo "Run: export PATH=\"$(pwd):\$PATH\""
    echo "Or: sudo ln -sf $(pwd)/azure /usr/local/bin/azure"
else
    echo "✅ azure wrapper installed at: $AZURE_PATH"
fi

echo ""

echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Configure Azure credentials:"
echo "   - Run 'az login' for Azure CLI authentication, OR"
echo "   - Set environment variables: AZURE_SUBSCRIPTION_ID, AZURE_TENANT_ID, etc."
echo ""
echo "2. Copy .env.example to .env and configure:"
echo "   cp .env.example .env"
echo "   # Edit .env with your Azure subscription details"
echo ""
echo "3. Update docker-compose.yml to use the 'azure' provider type"
echo ""
echo "4. Run: docker compose up"
echo ""
