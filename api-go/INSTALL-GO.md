# Go Installation Guide for Windows

## 🔽 Step 1: Download Go

1. **Go to the official Go website**: https://golang.org/dl/
2. **Download the Windows installer**:
   - Look for the latest version (Go 1.21 or higher)
   - Click on the Windows `.msi` file (e.g., `go1.21.3.windows-amd64.msi`)

## 💾 Step 2: Install Go

1. **Run the downloaded `.msi` file**
2. **Follow the installation wizard**:
   - Accept the license agreement
   - Use the default installation path (`C:\Program Files\Go`)
   - Complete the installation

## 🔄 Step 3: Restart Your Terminal

**Important**: Close and reopen your PowerShell/Terminal after installation.

## ✅ Step 4: Verify Installation

Open a new PowerShell window and run:
```powershell
go version
```

You should see output like:
```
go version go1.21.3 windows/amd64
```

## 🚀 Step 5: Run the API

Once Go is installed and verified:
```powershell
cd C:\Workspaces\personal-finance\api-go
.\run.ps1
```

## 🌐 Alternative: Docker Method (No Go Installation Required)

If you prefer not to install Go directly, you can use Docker:

1. **Make sure Docker is installed** (Docker Desktop for Windows)
2. **Run with Docker Compose**:
   ```powershell
   cd C:\Workspaces\personal-finance\api-go
   docker-compose up --build api
   ```

This will build and run the Go API in a container without needing Go installed locally.

## 🔧 Troubleshooting

### Go Command Not Found After Installation
- Restart your computer (not just the terminal)
- Check if Go is in your PATH by running: `$env:PATH -split ';' | Select-String "Go"`
- Manually add Go to PATH if needed:
  ```powershell
  $env:PATH += ";C:\Program Files\Go\bin"
  ```

### Permission Issues
- Run PowerShell as Administrator
- Or use Command Prompt instead of PowerShell

### Firewall/Antivirus Blocking
- Temporarily disable antivirus during installation
- Add Go installation directory to antivirus exceptions

---

## 📞 Need Help?

If you encounter any issues:
1. Check the [official Go installation docs](https://golang.org/doc/install)
2. Verify your Windows version compatibility
3. Try the Docker alternative method above

Once Go is installed, the health check API will work perfectly!