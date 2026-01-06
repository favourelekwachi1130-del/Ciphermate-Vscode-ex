# DeepSeek Coder Setup Guide

Complete guide to setting up DeepSeek Coder with CipherMate using Ollama.

## 🖥️ Setup Options

### Option 1: Local Linux Machine (Recommended for Development)
Run Ollama directly on your Linux machine - fastest and easiest!

### Option 2: VPS/Remote Server (Recommended for Production)
Run Ollama on a remote server - better for team use and always-on availability.

---

## 🎯 Which Model Should You Choose?

### **Recommended: `deepseek-coder:6.7b`** ⭐

**Why 6.7b?**
- ✅ **Best balance** of quality and speed
- ✅ **3.8GB** download size (manageable)
- ✅ **Fast inference** (~2-5 seconds per response)
- ✅ **Excellent code understanding** and generation
- ✅ **16K context window** (handles large codebases)

### Model Comparison

| Model | Size | RAM Needed | Speed | Quality | Use Case |
|-------|------|------------|-------|---------|----------|
| **1.3b** | 776MB | 2GB | ⚡⚡⚡ Very Fast | ⭐⭐ Good | Quick responses, simple tasks |
| **6.7b** | 3.8GB | 8GB | ⚡⚡ Fast | ⭐⭐⭐⭐ Excellent | **Recommended for most users** |
| **33b** | 19GB | 40GB+ | ⚡ Slow | ⭐⭐⭐⭐⭐ Best | Maximum quality, complex code |

**Recommendation:** Start with **6.7b**. Upgrade to 33b only if you need maximum quality and have powerful hardware.

---

## 🖥️ VPS/Server Requirements

### Minimum Requirements (for 6.7b model)

```
CPU: 4+ cores (8+ recommended)
RAM: 8GB minimum (16GB recommended)
Storage: 20GB+ SSD
OS: Ubuntu 22.04 LTS or newer
Network: Good bandwidth for model download
```

### Recommended VPS Providers

1. **DigitalOcean** ($48/month)
   - 8GB RAM, 4 vCPU, 160GB SSD
   - Easy setup, good documentation

2. **Hetzner** ($30/month) ⭐ Best Value
   - 16GB RAM, 4 vCPU, 160GB SSD
   - Excellent performance/price ratio

3. **AWS EC2** (Variable pricing)
   - t3.xlarge or t3.2xlarge instances
   - Pay-as-you-go, scalable

4. **Linode** ($48/month)
   - 8GB RAM, 4 vCPU, 160GB SSD
   - Good support

### For 33b Model (if needed)

```
CPU: 8+ cores
RAM: 40GB+ (48GB recommended)
Storage: 50GB+ SSD
GPU: Optional but recommended (NVIDIA GPU with 24GB+ VRAM)
```

---

## 🚀 Quick Start: Local Linux Setup (Easiest!)

If you're running Linux locally, you can skip the VPS setup entirely!

### Step 1: Install Ollama on Linux

```bash
# Ubuntu/Debian
curl -fsSL https://ollama.ai/install.sh | sh

# Or download manually
wget https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64
chmod +x ollama-linux-amd64
sudo mv ollama-linux-amd64 /usr/local/bin/ollama

# Arch Linux (AUR)
yay -S ollama
# or
paru -S ollama

# Fedora/RHEL
curl -fsSL https://ollama.ai/install.sh | sh
```

### Step 2: Start Ollama

```bash
# Start Ollama service
ollama serve

# Or run as systemd service (recommended)
sudo systemctl enable ollama
sudo systemctl start ollama

# Verify it's running
curl http://64.225.56.89:11434/api/tags
```

### Step 3: Download DeepSeek Coder

```bash
# Download the 6.7b model (recommended)
ollama pull deepseek-coder:6.7b

# Verify
ollama list
```

### Step 4: Configure CipherMate

In VS Code Settings:
- **AI Provider:** `ollama`
- **Ollama > Api Url:** `http://localhost:11434`
- **Ollama > Model:** `deepseek-coder:6.7b`
- **Ollama > Timeout:** `120000`

**That's it!** You're ready to use DeepSeek Coder locally. 🎉

---

## 📦 Step 1: Set Up Your VPS (For Remote Server)

### 1.1 Create VPS Instance

1. Sign up with your chosen provider
2. Create a new droplet/server:
   - **OS:** Ubuntu 22.04 LTS (or any modern Linux distro)
   - **Size:** 8GB RAM minimum (16GB recommended)
   - **Region:** Choose closest to you
3. Note your server IP address

### 1.2 Connect to Your Server

```bash
# Connect via SSH
ssh root@YOUR_SERVER_IP

# Or if using a non-root user
ssh username@YOUR_SERVER_IP
```

---

## 🚀 Step 2: Install Ollama on Linux

### 2.1 Download and Install Ollama

**On Ubuntu/Debian:**
```bash
# Download Ollama installer
curl -fsSL https://ollama.ai/install.sh | sh

# Verify installation
ollama --version
```

**On Arch Linux:**
```bash
# Using AUR helper
yay -S ollama
# or
paru -S ollama

# Or manually from GitHub
wget https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64
chmod +x ollama-linux-amd64
sudo mv ollama-linux-amd64 /usr/local/bin/ollama
```

**On Fedora/RHEL:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**On any Linux (manual):**
```bash
# Download latest release
wget https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64
chmod +x ollama-linux-amd64
sudo mv ollama-linux-amd64 /usr/local/bin/ollama

# Verify
ollama --version
```

### 2.2 Start Ollama Service

**Option A: Run directly (for testing)**
```bash
# Start Ollama (runs on port 11434 by default)
ollama serve

# Keep terminal open, or run in background:
nohup ollama serve > /dev/null 2>&1 &
```

**Option B: Run as systemd service (recommended)**
```bash
# Create systemd service file
sudo tee /etc/systemd/system/ollama.service > /dev/null <<EOF
[Unit]
Description=Ollama Service
After=network.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Create ollama user (if doesn't exist)
sudo useradd -r -s /bin/false ollama || true

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama

# Check status
sudo systemctl status ollama
```

### 2.3 Verify Ollama is Running

```bash
# Check if Ollama is listening
curl http://localhost:11434/api/tags

# Should return: {"models":[]}
```

---

## 📥 Step 3: Download DeepSeek Coder Model

### 3.1 Pull the Model

```bash
# Recommended: 6.7b model
ollama pull deepseek-coder:6.7b

# This will take 5-15 minutes depending on your connection
# Download size: ~3.8GB
```

### 3.2 Verify Model Download

```bash
# List downloaded models
ollama list

# Should show:
# deepseek-coder:6.7b
```

### 3.3 Test the Model

```bash
# Test with a simple prompt
ollama run deepseek-coder:6.7b "Write a hello world function in Python"
```

---

## 🔒 Step 4: Secure Your Ollama Server (Important!)

### 4.1 Configure Firewall

```bash
# Allow SSH (port 22)
sudo ufw allow 22/tcp

# Allow Ollama (port 11434) - ONLY from your IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 11434

# Enable firewall
sudo ufw enable
```

### 4.2 Optional: Set Up Authentication

For production, consider using:
- **Nginx reverse proxy** with authentication
- **VPN** to access your server
- **SSH tunnel** (see below)

---

## 🔌 Step 5: Configure CipherMate Extension

### 5.1 Find Your Server IP Address

**On your Linux server, run:**

```bash
# Method 1: Using hostname (shows IP)
hostname -I

# Method 2: Using ip command
ip addr show | grep "inet " | grep -v 127.0.0.1

# Method 3: Using ifconfig (if installed)
ifconfig | grep "inet " | grep -v 127.0.0.1

# Method 4: Check public IP (if VPS)
curl ifconfig.me
curl ipinfo.io/ip
```

**You'll see something like:**
- `192.168.1.100` (local network IP)
- `10.0.0.5` (private IP)
- `157.230.123.45` (public IP - for VPS)

**Use the IP address that matches:**
- **Local Linux machine:** Use `localhost` or `127.0.0.1` (if VS Code is on same machine)
- **VPS/Remote server:** Use the public IP address shown
- **Same network:** Use the local network IP (192.168.x.x or 10.x.x.x)

### 5.2 Open VS Code Settings

1. Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
2. Search for "CipherMate"
3. Or use Command Palette: `Cmd+Shift+P` → "Preferences: Open Settings (UI)"

### 5.3 Configure Ollama Provider

Find these settings:

```
CipherMate: AI Provider
→ Select: "ollama"

CipherMate: AI > Ollama > Api Url
→ Enter: http://YOUR_SERVER_IP:11434
→ Examples:
   - Local: http://localhost:11434
   - VPS: http://157.230.123.45:11434
   - Same network: http://192.168.1.100:11434

CipherMate: AI > Ollama > Model
→ Enter: deepseek-coder:6.7b

CipherMate: AI > Ollama > Timeout
→ Enter: 120000 (120 seconds - local models may be slower)
```

### 5.3 Alternative: Use SSH Tunnel (More Secure)

If you don't want to expose port 11434 publicly:

```bash
# On your local machine, create SSH tunnel
ssh -L 11434:localhost:11434 root@YOUR_SERVER_IP

# Keep this terminal open
# Then in VS Code settings, use:
# Api Url: http://localhost:11434
```

---

## ✅ Step 6: Test the Connection

### 6.1 Test in CipherMate

1. Open CipherMate chat (`Cmd+Shift+P` → "CipherMate")
2. Type: `"Hello, test connection"`
3. You should get a response from DeepSeek Coder!

### 6.2 Check Logs

If it doesn't work:
1. Open Output panel (`View` → `Output`)
2. Select "CipherMate" from dropdown
3. Look for connection errors

---

## 🐛 Troubleshooting

### Problem: "Address already in use" or "bind: address already in use"

**This means Ollama is already running!** ✅

**Solution:**
```bash
# Check if Ollama is running
ps aux | grep ollama

# Or check if port 11434 is in use
sudo lsof -i :11434
# or
sudo netstat -tlnp | grep 11434

# If Ollama is running, you're good! Just verify:
curl http://localhost:11434/api/tags

# If you want to restart Ollama:
# Find the process
ps aux | grep ollama

# Kill it (replace PID with actual process ID)
kill <PID>

# Or if it's a systemd service:
sudo systemctl restart ollama

# Then start again
ollama serve
```

**You don't need to run `ollama serve` again if it's already running!** Just proceed to download the model.

### Problem: "Connection refused"

**Solution:**
```bash
# On server, check if Ollama is running
sudo systemctl status ollama

# If not running:
sudo systemctl start ollama

# Check firewall
sudo ufw status
```

### Problem: "Model not found"

**Solution:**
```bash
# On server, verify model is downloaded
ollama list

# If not listed, pull it again:
ollama pull deepseek-coder:6.7b
```

### Problem: "Request timeout"

**Solution:**
- Increase timeout in settings to 180000 (3 minutes)
- Check server resources: `htop` or `free -h`
- Consider using smaller model (1.3b) for faster responses

### Problem: "Out of memory"

**Solution:**
- Use smaller model: `deepseek-coder:1.3b`
- Or upgrade VPS RAM
- Close other applications on server

---

## 📊 Performance Tips

### Optimize Response Speed

1. **Use smaller model** for quick tasks (1.3b)
2. **Use larger model** for complex code analysis (6.7b or 33b)
3. **Keep server close** to reduce latency
4. **Monitor resources** with `htop`

### Monitor Usage

```bash
# Check Ollama logs
sudo journalctl -u ollama -f

# Check resource usage
htop
```

---

## 🔄 Updating the Model

```bash
# Pull latest version
ollama pull deepseek-coder:6.7b

# Remove old version (optional)
ollama rm deepseek-coder:6.7b
```

---

## 🎉 You're Done!

Your CipherMate extension is now using DeepSeek Coder running on your own server!

**Next Steps:**
- Test code scanning: `"Scan my repository"`
- Try code fixes: `"Fix vulnerabilities in my code"`
- Ask questions: `"Explain this security issue"`

---

## 📚 Additional Resources

- **Ollama Documentation:** https://ollama.ai/docs
- **DeepSeek Coder:** https://huggingface.co/deepseek-ai/deepseek-coder-6.7b-instruct
- **Ollama Models:** https://ollama.ai/library
- **CipherMate Settings:** `Cmd+Shift+P` → "CipherMate: Advanced Settings"

---

## 💡 Pro Tips

1. **Use SSH tunnel** for better security (no exposed ports)
2. **Monitor server** with tools like `htop` and `nethogs`
3. **Set up auto-restart** for Ollama service
4. **Keep models updated** for latest improvements
5. **Use 6.7b** as default, switch to 33b for complex tasks

---

**Questions?** Check the CipherMate documentation or open an issue on GitHub.

