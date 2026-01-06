# Ollama Troubleshooting Guide

Common issues and solutions when setting up Ollama.

---

## ✅ "Address already in use" - Ollama is Already Running!

**This is GOOD news!** Ollama is already running on your server.

### Verify Ollama is Working

```bash
# Test if Ollama is responding
curl http://localhost:11434/api/tags

# Should return: {"models":[]} or list of models
```

### Check Ollama Status

```bash
# Check if Ollama process is running
ps aux | grep ollama

# Check if port 11434 is in use
sudo lsof -i :11434
# or
sudo netstat -tlnp | grep 11434
```

### If You Want to Restart Ollama

**Option 1: If running as systemd service**
```bash
sudo systemctl restart ollama
sudo systemctl status ollama
```

**Option 2: If running manually**
```bash
# Find the process
ps aux | grep ollama

# Kill it (replace PID with actual process ID)
kill <PID>
# or force kill
kill -9 <PID>

# Start again
ollama serve
```

**Option 3: Kill all Ollama processes**
```bash
pkill ollama
# Wait a moment, then start again
ollama serve
```

---

## 🔍 Check What's Using Port 11434

```bash
# Method 1: Using lsof
sudo lsof -i :11434

# Method 2: Using netstat
sudo netstat -tlnp | grep 11434

# Method 3: Using ss
sudo ss -tlnp | grep 11434

# Method 4: Using fuser
sudo fuser 11434/tcp
```

---

## ✅ Next Steps (Ollama is Running)

Since Ollama is already running, you can:

1. **Download the model** (in a new terminal or SSH session):
   ```bash
   ollama pull deepseek-coder:6.7b
   ```

2. **Verify models**:
   ```bash
   ollama list
   ```

3. **Test the model**:
   ```bash
   ollama run deepseek-coder:6.7b "Hello"
   ```

4. **Configure CipherMate**:
   - AI Provider: `ollama`
   - Api Url: `http://YOUR_SERVER_IP:11434` (or `http://localhost:11434` if local)
   - Model: `deepseek-coder:6.7b`

---

## 🐛 Other Common Issues

### Problem: "Connection refused"

**Solution:**
```bash
# Check if Ollama is running
sudo systemctl status ollama

# If not running, start it
sudo systemctl start ollama

# Or start manually
ollama serve
```

### Problem: "Model not found"

**Solution:**
```bash
# List downloaded models
ollama list

# If model not listed, pull it
ollama pull deepseek-coder:6.7b

# Verify download
ollama list
```

### Problem: "Permission denied"

**Solution:**
```bash
# Check Ollama user permissions
ls -la ~/.ollama

# Fix permissions if needed
chmod 755 ~/.ollama
chmod 644 ~/.ollama/*

# Or run with sudo (not recommended for production)
sudo ollama serve
```

### Problem: "Out of memory"

**Solution:**
```bash
# Check RAM usage
free -h

# Use smaller model
ollama pull deepseek-coder:1.3b

# Or upgrade server RAM
```

### Problem: "Request timeout"

**Solution:**
- Increase timeout in CipherMate settings to 180000 (3 minutes)
- Check server resources: `htop`
- Use smaller/faster model (1.3b instead of 6.7b)

---

## 🔧 Useful Commands

```bash
# List all models
ollama list

# Remove a model
ollama rm deepseek-coder:6.7b

# Show model info
ollama show deepseek-coder:6.7b

# Run a model interactively
ollama run deepseek-coder:6.7b

# Test API endpoint
curl http://localhost:11434/api/tags

# Check Ollama logs (if systemd service)
sudo journalctl -u ollama -f

# Check Ollama logs (if running manually)
# Logs are in: ~/.ollama/logs/
```

---

## 📊 Check System Resources

```bash
# Check RAM
free -h

# Check disk space
df -h

# Check CPU usage
htop
# or
top

# Check network
ifconfig
# or
ip addr
```

---

## 🔒 Security Notes

- **Don't expose port 11434 publicly** without authentication
- Use **SSH tunnel** for remote access:
  ```bash
  ssh -L 11434:localhost:11434 user@your-server
  ```
- Or use **firewall rules** to restrict access:
  ```bash
  sudo ufw allow from YOUR_IP to any port 11434
  ```

---

## ✅ Quick Health Check

Run these commands to verify everything is working:

```bash
# 1. Check Ollama is running
curl http://localhost:11434/api/tags

# 2. List models
ollama list

# 3. Test a model
ollama run deepseek-coder:6.7b "Say hello"

# 4. Check system resources
free -h && df -h
```

If all commands succeed, Ollama is ready to use! 🎉

