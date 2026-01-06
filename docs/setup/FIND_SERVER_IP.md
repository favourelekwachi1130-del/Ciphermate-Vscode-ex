# How to Find Your Server IP Address

Quick guide to find the IP address for your Ollama server.

---

## 🔍 Find IP Address

### On Linux Server:

```bash
# Method 1: Using hostname (Simplest)
hostname -I

# Method 2: Using ip command
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### On macOS (Your Local Machine):

```bash
# Method 1: Using ifconfig (Most common)
ifconfig | grep "inet " | grep -v 127.0.0.1

# Method 2: Using networksetup
networksetup -getinfo "Wi-Fi" | grep "IP address"
# or for Ethernet
networksetup -getinfo "Ethernet" | grep "IP address"

# Method 3: Using ipconfig (if available)
ipconfig getifaddr en0  # For Wi-Fi
ipconfig getifaddr en1  # For Ethernet

# Method 4: Quick one-liner
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
```

**Output example:**
```
inet 192.168.1.100 netmask 0xffffff00 broadcast 192.168.1.255
```

### Method 2: Using `ip` command (Modern)

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

**Output example:**
```
inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
inet 10.0.0.5/16 scope global eth1
```

### Method 3: Using `ifconfig` (Traditional)

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Output example:**
```
inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255
inet 10.0.0.5  netmask 255.255.0.0  broadcast 10.0.255.255
```

### Method 4: Public IP (For VPS)

```bash
# Get public IP address
curl ifconfig.me
# or
curl ipinfo.io/ip
# or
curl icanhazip.com
```

**Output example:**
```
157.230.123.45
```

---

## 🎯 Which IP to Use?

### Scenario 1: VS Code on Same Machine as Ollama

**Use:**
```
http://localhost:11434
```
or
```
http://127.0.0.1:11434
```

### Scenario 2: VS Code on Different Machine, Same Network

**Use the local network IP:**
```
http://192.168.1.100:11434
```
or
```
http://10.0.0.5:11434
```

**Find it with:**
```bash
hostname -I | awk '{print $1}'
```

### Scenario 3: VPS/Remote Server

**Use the public IP:**
```
http://157.230.123.45:11434
```

**Find it with:**
```bash
curl ifconfig.me
```

**⚠️ Important:** Make sure port 11434 is open in firewall!

---

## 🔒 Security: Using SSH Tunnel (Recommended)

Instead of exposing port 11434 publicly, use SSH tunnel:

### On Your Local Machine (where VS Code runs):

```bash
ssh -L 11434:localhost:11434 user@YOUR_SERVER_IP
```

**Then in CipherMate settings, use:**
```
http://localhost:11434
```

This is more secure - no need to expose port 11434 publicly!

---

## ✅ Quick Test

After finding your IP, test if Ollama is accessible:

```bash
# From your local machine (or VS Code machine)
curl http://YOUR_SERVER_IP:11434/api/tags
```

**Should return:**
```json
{"models":[]}
```

If you get a response, the IP is correct! ✅

---

## 📋 Common IP Addresses

| Type | IP Range | Example | Use Case |
|------|----------|---------|----------|
| **Localhost** | 127.0.0.1 | `localhost` | Same machine |
| **Private** | 192.168.x.x | `192.168.1.100` | Same network |
| **Private** | 10.x.x.x | `10.0.0.5` | Same network |
| **Public** | Any | `157.230.123.45` | VPS/Internet |

---

## 🐛 Troubleshooting

### Can't connect to server IP

**Check firewall:**
```bash
# On server
sudo ufw status
sudo ufw allow 11434/tcp
```

**Check Ollama is running:**
```bash
# On server
curl http://localhost:11434/api/tags
```

**Check network connectivity:**
```bash
# From local machine
ping YOUR_SERVER_IP
```

### Connection refused

- Ollama might not be running
- Firewall might be blocking port 11434
- Wrong IP address

**Solution:**
```bash
# On server, verify Ollama is running
ps aux | grep ollama

# Check firewall
sudo ufw status

# Test locally first
curl http://localhost:11434/api/tags
```

---

## 💡 Pro Tip

**For VPS:** Use SSH tunnel instead of exposing port publicly:

```bash
# Keep this running in a terminal
ssh -L 11434:localhost:11434 root@YOUR_SERVER_IP

# Then use localhost in CipherMate
http://localhost:11434
```

This is more secure and doesn't require firewall changes!

---

## ✅ Summary

1. **Find IP:** Run `hostname -I` or `curl ifconfig.me` on server
2. **Test connection:** `curl http://IP:11434/api/tags`
3. **Configure CipherMate:** Use `http://IP:11434` in settings
4. **Or use SSH tunnel:** More secure, use `localhost:11434`

