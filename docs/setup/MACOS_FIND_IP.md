# Find IP Address on macOS

Quick guide to find your IP address on macOS (MacBook).

---

## 🔍 Find Your Mac's IP Address

### Method 1: Using `ifconfig` (Easiest)

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Output example:**
```
inet 192.168.1.100 netmask 0xffffff00 broadcast 192.168.1.255
inet 10.0.0.5 netmask 0xffff0000 broadcast 10.255.255.255
```

**Get just the IP:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}'
```

### Method 2: Using `ipconfig` (Simple)

```bash
# For Wi-Fi
ipconfig getifaddr en0

# For Ethernet
ipconfig getifaddr en1

# Or try both
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

### Method 3: Using `networksetup`

```bash
# For Wi-Fi
networksetup -getinfo "Wi-Fi" | grep "IP address"

# For Ethernet
networksetup -getinfo "Ethernet" | grep "IP address"
```

### Method 4: One-Liner (Quickest)

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
```

---

## 🎯 Find Your Server's IP (If Different Machine)

### If Your Server is Linux:

**SSH into your server and run:**
```bash
hostname -I
# or
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### If Your Server is a VPS:

**On the server, run:**
```bash
curl ifconfig.me
# or
curl ipinfo.io/ip
```

---

## 🔌 For CipherMate Configuration

### Scenario 1: Ollama on Same Mac

**Use:**
```
http://localhost:11434
```

### Scenario 2: Ollama on Different Machine (Same Network)

**Find your Mac's IP:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1
```

**Then use in CipherMate:**
```
http://YOUR_MAC_IP:11434
```

**But wait!** If Ollama is on a **different machine**, you need the **server's IP**, not your Mac's IP!

### Scenario 3: Ollama on VPS/Remote Server

**Use the server's public IP:**
```
http://SERVER_PUBLIC_IP:11434
```

---

## ✅ Quick Test

Test if you can reach Ollama:

```bash
# If Ollama is on same Mac
curl http://localhost:11434/api/tags

# If Ollama is on different machine
curl http://SERVER_IP:11434/api/tags
```

**Should return:**
```json
{"models":[]}
```

---

## 🔒 Recommended: SSH Tunnel (Most Secure)

If Ollama is on a remote server, use SSH tunnel:

```bash
# On your Mac, create SSH tunnel
ssh -L 11434:localhost:11434 user@YOUR_SERVER_IP

# Keep this terminal open
# Then in CipherMate, use:
http://localhost:11434
```

---

## 📋 Common Network Interfaces on macOS

| Interface | Type | Command |
|-----------|------|---------|
| `en0` | Wi-Fi | `ipconfig getifaddr en0` |
| `en1` | Ethernet | `ipconfig getifaddr en1` |
| `lo0` | Loopback | `127.0.0.1` (localhost) |

---

## 🐛 Troubleshooting

### Can't find IP address

**Check all interfaces:**
```bash
ifconfig -a | grep "inet "
```

**Check active connections:**
```bash
netstat -rn | grep default
```

### Connection refused

- Make sure Ollama is running on the server
- Check firewall settings
- Verify you're using the correct IP

---

## 💡 Pro Tip

**If Ollama is on a remote server**, always use SSH tunnel for security:

```bash
ssh -L 11434:localhost:11434 root@YOUR_SERVER_IP
```

Then use `localhost:11434` in CipherMate - no need to expose port 11434 publicly!

