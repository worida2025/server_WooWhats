#!/bin/bash

# WooWhats Server - Git Setup Script
# This script initializes a git repository for deployment to Render

echo "🚀 Setting up WooWhats Server for Git deployment..."

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    exit 1
fi

# Initialize git repository if not already initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
else
    echo "✅ Git repository already exists"
fi

# Create .env from example if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration before deploying"
else
    echo "✅ .env file already exists"
fi

# Stage all files
echo "📤 Staging files for commit..."
git add .

# Commit if there are changes
if git diff --staged --quiet; then
    echo "✅ No changes to commit"
else
    echo "💾 Committing initial files..."
    git commit -m "Initial commit: WooWhats Server for Render deployment"
fi

echo ""
echo "🎉 Repository is ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Create a repository on GitHub"
echo "2. Add your GitHub repository as remote:"
echo "   git remote add origin https://github.com/yourusername/your-repo-name.git"
echo "3. Push to GitHub:"
echo "   git branch -M main"
echo "   git push -u origin main"
echo "4. Deploy to Render using the deployment-guide.md instructions"
echo ""
echo "📖 See deployment-guide.md for detailed instructions"
