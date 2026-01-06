# Ollama DeepSeek Coder - Quick Start Guide

Quick reference for setting up DeepSeek Coder on a VPS and using it with CipherMate.

##      Quick Setup (5 Minutes)

### Step 1: Get a VPS

**Recommended**: DigitalOcean ($6-24/month)
- Go to: https://www.digitalocean.com
- Create Droplet: Ubuntu 22.04, 4GB RAM, 2 vCPU
- Copy your server IP address

### Step 2: Run Setup Script

SSH into your server:
```bash
ssh root@YOUR_SERVER_IP
```

Download and run setup script:
```bash
wget https://raw.githubusercontent.com/your-repo/ciphermate/main/scripts/setup-ollama-vps.sh
chmod +x setup-ollama-vps.sh
./setup-ollama-vps.sh
```

Or install manually:
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull model (choose one)
ollama pull deepseek-coder:1.3b    # Fastest (~776MB)
ollama pull deepseek-coder:6.7b    # Recommended (~3.8GB)
ollama pull deepseek-coder:33b     # Best quality (~19GB, needs GPU)

# Configure to listen on all interfaces
systemctl edit ollama
# Add: Environment="OLLAMA_HOST=0.0.0.0:11434"
systemctl restart ollama

# Open firewall
ufw allow 11434/tcp
```

### Step 3: Configure CipherMate

**Option A: Via VS Code Settings UI**
1. Open Settings (Cmd/Ctrl + ,)
2. Search "CipherMate"
3. Set `Use Cloud AI` to `false`
4. Set `LM Studio URL` to `http://YOUR_SERVER_IP:11434/v1/chat/completions`

**Option B: Via Command Palette**
1. Press Cmd/Ctrl + Shift + P
2. Type: "CipherMate: Switch AI Agent"
3. Select "Ollama (Remote VPS)"
4. Enter: `http://YOUR_SERVER_IP:11434`

**Option C: Edit settings.json**
```json
{
  "ciphermate.useCloudAI": false,
  "ciphermate.lmStudioUrl": "http://YOUR_SERVER_IP:11434/v1/chat/completions"
}
```

### Step 4: Test It!

1. Open CipherMate Chat
2. Type: "Hello, test connection"
3. Should get a response from DeepSeek Coder!

##      Model Comparison

| Model | Size | RAM Needed | Speed | Quality | Cost/Month |
|-------|------|------------|-------|---------|------------|
| 1.3B  | 776MB | 4GB |           |  ­  ­  | $6 |
| 6.7B  | 3.8GB | 16GB |        |  ­  ­  ­  ­  | $24 |
| 33B   | 19GB | 64GB+GPU |     |  ­  ­  ­  ­  ­  | $200+ |

**Recommendation**: Start with **6.7B** for best balance.

##      Security (Optional but Recommended)

### Add Authentication

```bash
# Install Nginx
apt install -y nginx apache2-utils

# Create password file
htpasswd -c /etc/nginx/.htpasswd YOUR_USERNAME

# Create Nginx config
cat > /etc/nginx/sites-available/ollama << EOF
server {
    listen 80;
    server_name YOUR_SERVER_IP;
    
    auth_basic "Ollama API";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
```

Then use in CipherMate:
```
http://USERNAME:PASSWORD@YOUR_SERVER_IP/v1/chat/completions
```

##    ª Test Your Setup

```bash
# From your local machine
curl http://YOUR_SERVER_IP:11434/api/tags

# Test generation
curl http://YOUR_SERVER_IP:11434/api/generate -d '{
  "model": "deepseek-coder",
  "prompt": "Hello!",
  "stream": false
}'
```

##      Cost Breakdown

**Monthly Costs:**
- VPS (4GB RAM): $6-10
- VPS (16GB RAM): $20-40
- **Total**: $6-40/month (vs $50-200/month for cloud APIs)

**Break-even**: ~100K tokens/month

##      Troubleshooting

**Can't connect?**
1. Check firewall: `ufw status`
2. Check Ollama: `systemctl status ollama`
3. Test locally: `curl http://localhost:11434/api/tags`
4. Check IP is correct in CipherMate settings

**Slow responses?**
- Use smaller model (1.3B instead of 6.7B)
- Upgrade VPS RAM/CPU
- Check network latency

**Out of memory?**
- Use 1.3B model
- Upgrade VPS RAM
- Check: `free -h`

##      Full Documentation

See `OLLAMA_VPS_SETUP.md` for complete guide with:
- Detailed VPS provider comparison
- Security hardening
- Performance optimization
- Production deployment tips

##      Next Steps

1.     VPS setup complete
2.     Ollama installed
3.     CipherMate configured
4.      Start scanning code!

---

**Need Help?**
- Check logs: `journalctl -u ollama -f`
- Test API: `curl http://YOUR_SERVER_IP:11434/api/tags`
- Verify settings in VS Code

