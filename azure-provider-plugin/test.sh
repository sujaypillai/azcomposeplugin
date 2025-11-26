#!/bin/bash

# Test script for Azure Provider Plugin

echo "=========================================="
echo "Azure Provider Plugin Test Suite"
echo "=========================================="
echo ""

# Check if plugin is installed
echo "1. Checking plugin installation..."
PLUGIN_PATH=$(which docker-azure)

if [ -z "$PLUGIN_PATH" ]; then
    echo "❌ Error: docker-azure not found in PATH"
    echo "Run ./install.sh first"
    exit 1
fi

echo "✅ Plugin found at: $PLUGIN_PATH"
echo ""

# Test version command
echo "2. Testing version command..."
VERSION=$(docker-azure --version)
if [ $? -ne 0 ]; then
    echo "❌ Error: version command failed"
    exit 1
fi

echo "✅ Version: $VERSION"
echo ""

# Test metadata command
echo "3. Testing metadata command..."
METADATA=$(docker-azure metadata)
if [ $? -ne 0 ]; then
    echo "❌ Error: metadata command failed"
    exit 1
fi

echo "✅ Metadata retrieved:"
echo "$METADATA" | head -n 20
echo ""

# Test compose command structure
echo "4. Testing compose command structure..."
docker-azure compose --help > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Error: compose command not found"
    exit 1
fi

echo "✅ Compose command structure valid"
echo ""

# Check Azure credentials
echo "5. Checking Azure credentials..."

if [ -z "$AZURE_SUBSCRIPTION_ID" ]; then
    echo "⚠️  Warning: AZURE_SUBSCRIPTION_ID not set"
    echo ""
    echo "To test provisioning, you need to set:"
    echo "  export AZURE_SUBSCRIPTION_ID='your-subscription-id'"
    echo ""
    echo "And authenticate with Azure:"
    echo "  az login"
    echo ""
    echo "Basic tests passed! ✅"
    exit 0
fi

echo "✅ AZURE_SUBSCRIPTION_ID is set"
echo ""

# Check Azure CLI authentication
echo "6. Checking Azure CLI authentication..."
az account show > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Not authenticated with Azure CLI"
    echo "Run 'az login' to authenticate"
    echo ""
    echo "Basic tests passed! ✅"
    exit 0
fi

echo "✅ Azure CLI authenticated"
ACCOUNT_INFO=$(az account show --query "[name,id]" -o tsv)
echo "   Account: $ACCOUNT_INFO"
echo ""

echo "=========================================="
echo "All Tests Passed! ✅"
echo "=========================================="
echo ""
echo "To actually provision resources with Docker Compose:"
echo ""
echo "docker compose up"
echo ""
echo "Or manually test the plugin:"
echo ""
echo "docker-azure compose up database --server_name test-server --database_name testdb"
echo ""

