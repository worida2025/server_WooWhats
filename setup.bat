@echo off
REM WooWhats Server - Git Setup Script for Windows
REM This script initializes a git repository for deployment to Render

echo 🚀 Setting up WooWhats Server for Git deployment...

REM Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git is not installed. Please install Git first.
    pause
    exit /b 1
)

REM Initialize git repository if not already initialized
if not exist ".git" (
    echo 📦 Initializing Git repository...
    git init
) else (
    echo ✅ Git repository already exists
)

REM Create .env from example if it doesn't exist
if not exist ".env" (
    echo 📝 Creating .env file from example...
    copy ".env.example" ".env"
    echo ⚠️  Please edit .env file with your configuration before deploying
) else (
    echo ✅ .env file already exists
)

REM Stage all files
echo 📤 Staging files for commit...
git add .

REM Check if there are changes to commit
git diff --staged --quiet
if %errorlevel% equ 0 (
    echo ✅ No changes to commit
) else (
    echo 💾 Committing initial files...
    git commit -m "Initial commit: WooWhats Server for Render deployment"
)

echo.
echo 🎉 Repository is ready for deployment!
echo.
echo Next steps:
echo 1. Create a repository on GitHub
echo 2. Add your GitHub repository as remote:
echo    git remote add origin https://github.com/yourusername/your-repo-name.git
echo 3. Push to GitHub:
echo    git branch -M main
echo    git push -u origin main
echo 4. Deploy to Render using the deployment-guide.md instructions
echo.
echo 📖 See deployment-guide.md for detailed instructions
echo.
pause
