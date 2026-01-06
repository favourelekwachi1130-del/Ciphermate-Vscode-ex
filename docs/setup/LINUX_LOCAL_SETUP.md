# Quick Setup: DeepSeek Coder on Local Linux

Fastest way to get DeepSeek Coder running on your Linux machine.

## ✅ Prerequisites

- Linux machine (Ubuntu, Debian, Arch, Fedora, etc.)
- 8GB+ RAM (for 6.7b model)
- 10GB+ free disk space
- Internet connection

---

## 🚀 Installation (5 minutes)

### 1. Install Ollama

**Ubuntu/Debian:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Arch Linux:**
```bash
yay -S ollama
# or
paru -S ollama
```

**Fedora/RHEL:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Any Linux (manual):**
```bash
wget https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64
chmod +x ollama-linux-amd64
sudo mv ollama-linux-amd64 /usr/local/bin/ollama
```

### 2. Start Ollama

```bash
# Start Ollama (runs in foreground - keep terminal open)
ollama serve

# OR run as background service
ollama serve &
```

### 3. Download DeepSeek Coder

Open a **new terminal** (keep Ollama running in the first one):

```bash
# Download recommended model (6.7b - 3.8GB)
ollama pull deepseek-coder:6.7b

# This takes 5-15 minutes depending on your connection
```

### 4. Verify Installation

```bash
# List downloaded models
ollama list

# Test the model
ollama run deepseek-coder:6.7b "Write hello world in Python"
```

---

## ⚙️ Configure CipherMate

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "CipherMate"
3. Configure:
   - **AI Provider:** `ollama`
   - **Ollama > Api Url:** `http://localhost:11434`
   - **Ollama > Model:** `deepseek-coder:6.7b`
   - **Ollama > Timeout:** `120000`

---

## 🎯 Test It!

1. Open CipherMate chat (`Cmd+Shift+P` → "CipherMate")
2. Type: `"Hello, test connection"`
3. You should get a response! 🎉

---

## 🔧 Run as System Service (Optional)

To run Ollama automatically on boot:

```bash
# Create systemd service
sudo tee /etc/systemd/system/ollama.service > /dev/null <<EOF
[Unit]
Description=Ollama Service
After=network.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=$USER
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama

# Check status
sudo systemctl status ollama
```

---

## 🐛 Troubleshooting

### Ollama won't start
```bash
# Check if port 11434 is in use
sudo lsof -i :11434

# Kill process if needed
sudo kill -9 <PID>

# Try starting again
ollama serve
```

### Model download fails
```bash
# Check disk space
df -h

# Check internet connection
ping ollama.ai

# Try downloading again
ollama pull deepseek-coder:6.7b
```

### Out of memory
```bash
# Check RAM usage
free -h

# Use smaller model instead
ollama pull deepseek-coder:1.3b
```

---

## 📊 Model Sizes

| Model | Size | RAM Needed | Speed |
|-------|------|------------|-------|
| 1.3b  | 776MB | 2GB | Very Fast |
| 6.7b  | 3.8GB | 8GB | Fast ⭐ Recommended |
| 33b   | 19GB | 40GB+ | Slow |

---

## ✅ Done!

You're now running DeepSeek Coder locally on Linux. No VPS needed!

**Next:** Try scanning your code with CipherMate!

