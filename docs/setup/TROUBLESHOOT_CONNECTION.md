# Troubleshoot: Connection Refused Error

If you see: `connect ECONNREFUSED 64.225.56.89:11434`

This means VS Code can't connect to your Ollama server. Here's how to fix it.

---

## 🔍 Step 1: Check if Ollama is Running on Server

**SSH into your server and check:**

```bash
# Check if Ollama process is running
ps aux | grep ollama

# Check if port 11434 is listening
sudo lsof -i :11434
# or
sudo netstat -tlnp | grep 11434

# Test Ollama locally on server
curl http://localhost:11434/api/tags
```

**If Ollama isn't running:**

```bash
# Start Ollama
ollama serve

# Or if it's a systemd service
sudo systemctl start ollama
sudo systemctl status ollama
```

---

## 🔥 Step 2: Check Firewall

**On your server, check firewall:**

```bash
# Check firewall status
sudo ufw status

# If firewall is active, allow port 11434
sudo ufw allow 11434/tcp

# Or allow from your Mac's IP only (more secure)
sudo ufw allow from YOUR_MAC_IP to any port 11434
```

**Find your Mac's IP:**
```bash
# On your Mac
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
```

---

## 🌐 Step 3: Test Connection from Your Mac

**From your Mac terminal, test if server is reachable:**

```bash
# Test if server responds
ping 64.225.56.89

# Test if port 11434 is accessible
curl http://64.225.56.89:11434/api/tags

# Or use telnet/nc
nc -zv 64.225.56.89 11434
```

**If curl fails:**
- Firewall is blocking (see Step 2)
- Ollama isn't running (see Step 1)
- Wrong IP address

---

## 🔒 Step 4: Use SSH Tunnel (Recommended & More Secure)

Instead of exposing port 11434, use SSH tunnel:

**On your Mac, run:**

```bash
ssh -L 11434:localhost:11434 root@64.225.56.89
```

**Keep this terminal open!**

**Then update VS Code settings:**

```json
{
  "ciphermate.ai.ollama.apiUrl": "http://localhost:11434"
}
```

This is more secure and doesn't require firewall changes.

---

## ✅ Step 5: Verify Everything Works

**On server:**
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Should return: {"models":[]} or list of models
```

**From Mac (if using direct connection):**
```bash
curl http://64.225.56.89:11434/api/tags
```

**From Mac (if using SSH tunnel):**
```bash
curl http://localhost:11434/api/tags
```

---

## 🐛 Common Issues

### Issue: "Connection refused" but Ollama is running

**Solution:**
- Ollama might be bound to localhost only
- Check: `sudo lsof -i :11434`
- Should show: `0.0.0.0:11434` (not `127.0.0.1:11434`)

**Fix:**
```bash
# Restart Ollama to bind to all interfaces
pkill ollama
ollama serve
```

### Issue: Firewall blocking

**Solution:**
```bash
# Allow port 11434
sudo ufw allow 11434/tcp
sudo ufw reload
```

### Issue: Wrong IP address

**Solution:**
```bash
# On server, get current IP
curl ifconfig.me
# or
hostname -I
```

Update VS Code settings with correct IP.

---

## 🔧 Quick Fix Checklist

- [ ] Ollama is running on server (`ps aux | grep ollama`)
- [ ] Port 11434 is listening (`sudo lsof -i :11434`)
- [ ] Firewall allows port 11434 (`sudo ufw allow 11434/tcp`)
- [ ] Can ping server from Mac (`ping 64.225.56.89`)
- [ ] Can curl from Mac (`curl http://64.225.56.89:11434/api/tags`)
- [ ] VS Code settings are correct
- [ ] Reloaded VS Code after changing settings

---

## 💡 Pro Tip: Use SSH Tunnel

**Always use SSH tunnel for security:**

```bash
# On Mac, create tunnel
ssh -L 11434:localhost:11434 root@64.225.56.89

# Keep terminal open
# Use localhost in VS Code settings
```

This way:
- ✅ No firewall changes needed
- ✅ More secure (encrypted)
- ✅ Works even if firewall blocks port 11434

---

## 📞 Still Not Working?

1. **Check server logs:**
   ```bash
   # On server
   sudo journalctl -u ollama -f
   # or if running manually
   tail -f ~/.ollama/logs/*
   ```

2. **Check VS Code logs:**
   - Open Output panel (`View` → `Output`)
   - Select "CipherMate" from dropdown
   - Look for connection errors

3. **Test with curl:**
   ```bash
   # From Mac
   curl -v http://64.225.56.89:11434/api/tags
   ```
   The `-v` flag shows detailed connection info.

