# Ollama DeepSeek Coder VPS Setup Guide

Complete guide to deploy DeepSeek Coder via Ollama on a VPS server and integrate with CipherMate.

## Table of Contents
1. [VPS Requirements & Recommendations](#vps-requirements--recommendations)
2. [VPS Provider Options](#vps-provider-options)
3. [Server Setup](#server-setup)
4. [Ollama Installation](#ollama-installation)
5. [DeepSeek Coder Setup](#deepseek-coder-setup)
6. [Security & Access Control](#security--access-control)
7. [CipherMate Integration](#ciphermate-integration)
8. [Testing & Troubleshooting](#testing--troubleshooting)

---

## VPS Requirements & Recommendations

### Minimum Requirements

**For DeepSeek Coder 1.3B (Recommended for most users):**
- **CPU**: 2+ cores
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 20GB SSD
- **Network**: 100Mbps+
- **Cost**: ~$5-10/month

**For DeepSeek Coder 6.7B (Better performance):**
- **CPU**: 4+ cores
- **RAM**: 16GB minimum (32GB recommended)
- **Storage**: 50GB SSD
- **Network**: 100Mbps+
- **Cost**: ~$20-40/month

**For DeepSeek Coder 33B (Best quality, requires GPU):**
- **CPU**: 8+ cores
- **RAM**: 64GB+
- **GPU**: NVIDIA GPU with 24GB+ VRAM (or use cloud GPU)
- **Storage**: 100GB SSD
- **Network**: 1Gbps+
- **Cost**: ~$100-300/month (or use GPU cloud like RunPod, Vast.ai)

### Recommended Specifications

**Best Value (6.7B model):**
- **CPU**: 4-8 cores (AMD Ryzen or Intel Xeon)
- **RAM**: 16-32GB
- **Storage**: 50GB NVMe SSD
- **OS**: Ubuntu 22.04 LTS
- **Location**: Choose closest to your users

---

## VPS Provider Options

### Budget-Friendly Options ($5-20/month)

#### 1. **DigitalOcean** (Recommended)
- **Pros**: Simple, reliable, good docs
- **Pricing**: $6/month (1GB RAM) to $24/month (4GB RAM)
- **Link**: https://www.digitalocean.com
- **Best for**: DeepSeek Coder 1.3B

#### 2. **Linode (Akamai)**
- **Pros**: Good performance, competitive pricing
- **Pricing**: $5/month (1GB) to $24/month (4GB)
- **Link**: https://www.linode.com
- **Best for**: Small to medium deployments

#### 3. **Vultr**
- **Pros**: Global locations, hourly billing
- **Pricing**: $6/month (1GB) to $24/month (4GB)
- **Link**: https://www.vultr.com
- **Best for**: Testing and development

#### 4. **Hetzner**
- **Pros**: Excellent value, European data centers
- **Pricing**:  ‚¬4.15/month (2GB) to  ‚¬8.31/month (4GB)
- **Link**: https://www.hetzner.com
- **Best for**: European users

### Mid-Range Options ($20-60/month)

#### 5. **AWS EC2**
- **Instance**: t3.xlarge (4 vCPU, 16GB RAM) ~$120/month
- **Or**: t3.large (2 vCPU, 8GB RAM) ~$60/month
- **Link**: https://aws.amazon.com/ec2
- **Best for**: Enterprise, need AWS integration

#### 6. **Google Cloud Platform**
- **Instance**: e2-standard-4 (4 vCPU, 16GB RAM) ~$100/month
- **Link**: https://cloud.google.com
- **Best for**: Google ecosystem integration

#### 7. **Azure**
- **Instance**: Standard_B4ms (4 vCPU, 16GB RAM) ~$100/month
- **Link**: https://azure.microsoft.com
- **Best for**: Microsoft ecosystem

### GPU Options (For 33B model)

#### 8. **RunPod**
- **GPU**: RTX 3090 (24GB VRAM) ~$0.29/hour (~$200/month)
- **Link**: https://www.runpod.io
- **Best for**: Running large models

#### 9. **Vast.ai**
- **GPU**: Various GPUs, competitive pricing
- **Link**: https://vast.ai
- **Best for**: Cost-effective GPU access

#### 10. **Lambda Labs**
- **GPU**: A100 (40GB) ~$1.10/hour
- **Link**: https://lambdalabs.com
- **Best for**: High-performance needs

---

## Server Setup

### Step 1: Create VPS Instance

1. **Choose Provider** (DigitalOcean recommended for beginners)
2. **Select Plan**:
   - For 1.3B: 4GB RAM, 2 vCPU
   - For 6.7B: 16GB RAM, 4 vCPU
3. **Choose OS**: Ubuntu 22.04 LTS
4. **Select Region**: Closest to your users
5. **Create Droplet/Instance**

### Step 2: Initial Server Configuration

SSH into your server:
```bash
ssh root@your-server-ip
```

Update system:
```bash
apt update && apt upgrade -y
```

Install essential tools:
```bash
apt install -y curl wget git build-essential
```

### Step 3: Create Non-Root User (Security Best Practice)

```bash
# Create user
adduser ollama
usermod -aG sudo ollama

# Switch to new user
su - ollama
```

---

## Ollama Installation

### Method 1: Official Install Script (Recommended)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Method 2: Manual Installation

```bash
# Download and install
curl -L https://ollama.com/download/ollama-linux-amd64 -o /usr/local/bin/ollama
chmod +x /usr/local/bin/ollama

# Create systemd service
cat > /etc/systemd/system/ollama.service << EOF
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
Environment="OLLAMA_HOST=0.0.0.0:11434"

[Install]
WantedBy=default.target
EOF

# Start service
systemctl daemon-reload
systemctl enable ollama
systemctl start ollama
```

### Verify Installation

```bash
# Check if Ollama is running
systemctl status ollama

# Test locally
curl http://localhost:11434/api/tags
```

---

## DeepSeek Coder Setup

### Pull DeepSeek Coder Model

Choose your model size:

**Option 1: 1.3B (Fastest, smallest)**
```bash
ollama pull deepseek-coder:1.3b
```

**Option 2: 6.7B (Recommended balance)**
```bash
ollama pull deepseek-coder:6.7b
```

**Option 3: 33B (Best quality, requires GPU)**
```bash
ollama pull deepseek-coder:33b
```

**Option 4: Latest (defaults to 1.3B)**
```bash
ollama pull deepseek-coder
```

### Test the Model

```bash
# Test via CLI
ollama run deepseek-coder "Write a Python function to reverse a string"

# Test via API
curl http://localhost:11434/api/generate -d '{
  "model": "deepseek-coder",
  "prompt": "Write a hello world in Python",
  "stream": false
}'
```

---

## Security & Access Control

### Step 1: Configure Firewall

```bash
# Install UFW
apt install -y ufw

# Allow SSH
ufw allow 22/tcp

# Allow Ollama (only from your IP - REPLACE with your IP)
ufw allow from YOUR_IP_ADDRESS to any port 11434

# Or allow from anywhere (less secure, use with authentication)
# ufw allow 11434/tcp

# Enable firewall
ufw enable
```

### Step 2: Set Up Reverse Proxy with Authentication (Recommended)

Install Nginx:
```bash
apt install -y nginx
```

Create Nginx config:
```bash
cat > /etc/nginx/sites-available/ollama << EOF
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or IP

    # Basic authentication
    auth_basic "Ollama API";
    auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
```

Create authentication file:
```bash
# Install htpasswd
apt install -y apache2-utils

# Create user (replace USERNAME with your choice)
htpasswd -c /etc/nginx/.htpasswd USERNAME
# Enter password when prompted

# Test config
nginx -t

# Restart Nginx
systemctl restart nginx
```

### Step 3: SSL Certificate (Optional but Recommended)

Install Certbot:
```bash
apt install -y certbot python3-certbot-nginx
```

Get SSL certificate:
```bash
certbot --nginx -d your-domain.com
```

### Step 4: Rate Limiting (Prevent Abuse)

Add to Nginx config:
```bash
# Add inside server block
limit_req_zone $binary_remote_addr zone=ollama_limit:10m rate=10r/s;

location / {
    limit_req zone=ollama_limit burst=20 nodelay;
    # ... rest of config
}
```

---

## CipherMate Integration

### Option 1: Direct Integration (No Authentication)

1. **Open VS Code Settings** (Cmd/Ctrl + ,)
2. **Search**: "CipherMate"
3. **Set**: `Use Cloud AI` to `false`
4. **Set**: `LM Studio URL` to `http://YOUR_SERVER_IP:11434/v1/chat/completions`

Or edit `settings.json`:
```json
{
  "ciphermate.useCloudAI": false,
  "ciphermate.lmStudioUrl": "http://YOUR_SERVER_IP:11434/v1/chat/completions"
}
```

### Option 2: With Authentication (Recommended)

If you set up Nginx with authentication, use this format:
```
http://USERNAME:PASSWORD@YOUR_SERVER_IP/v1/chat/completions
```

**       Security Note**: Store credentials securely. Consider using VS Code's secret storage.

### Option 3: Using Custom Provider

Configure as custom provider in CipherMate:

1. **Settings**  †  **CipherMate**  †  **AI Provider**  †  `custom`
2. **Set API URL**: `http://YOUR_SERVER_IP:11434/v1/chat/completions`
3. **Set Model**: `deepseek-coder` (or `deepseek-coder:6.7b`)

Or in `settings.json`:
```json
{
  "ciphermate.ai.provider": "custom",
  "ciphermate.ai.custom": {
    "apiUrl": "http://YOUR_SERVER_IP:11434/v1/chat/completions",
    "model": "deepseek-coder:6.7b",
    "timeout": 60000
  }
}
```

### Option 4: Programmatic Configuration

Update `agentic-core.ts` to support Ollama endpoints:

The code already supports custom endpoints via `lmStudioUrl` configuration. Just set:
```json
{
  "ciphermate.useCloudAI": false,
  "ciphermate.lmStudioUrl": "http://YOUR_SERVER_IP:11434/v1/chat/completions"
}
```

---

## Testing & Troubleshooting

### Test Connection from Your Machine

```bash
# Test basic connection
curl http://YOUR_SERVER_IP:11434/api/tags

# Test model generation
curl http://YOUR_SERVER_IP:11434/api/generate -d '{
  "model": "deepseek-coder",
  "prompt": "Hello, can you hear me?",
  "stream": false
}'
```

### Common Issues

#### Issue 1: Connection Refused
**Solution**: Check firewall and Ollama service
```bash
# Check Ollama is running
systemctl status ollama

# Check if listening on correct port
netstat -tlnp | grep 11434

# Check firewall
ufw status
```

#### Issue 2: Model Not Found
**Solution**: Pull the model again
```bash
ollama pull deepseek-coder:6.7b
```

#### Issue 3: Out of Memory
**Solution**: Use smaller model or upgrade VPS
```bash
# Check memory usage
free -h

# Use smaller model
ollama pull deepseek-coder:1.3b
```

#### Issue 4: Slow Responses
**Solutions**:
- Use smaller model (1.3B instead of 6.7B)
- Upgrade VPS RAM/CPU
- Check network latency
- Enable model caching

#### Issue 5: CipherMate Can't Connect
**Solutions**:
1. Verify URL format: `http://IP:11434/v1/chat/completions`
2. Check firewall allows your IP
3. Test with curl first
4. Check VS Code settings are saved
5. Restart VS Code

### Performance Optimization

#### Enable Model Caching
```bash
# Set cache directory (if you have fast storage)
export OLLAMA_MODELS=/path/to/fast/storage
```

#### Monitor Resource Usage
```bash
# Install monitoring tools
apt install -y htop

# Monitor Ollama
htop -p $(pgrep ollama)
```

#### Optimize for Production
```bash
# Edit Ollama service to limit resources
nano /etc/systemd/system/ollama.service

# Add resource limits
[Service]
...
MemoryLimit=8G
CPUQuota=200%
```

---

## Cost Estimation

### Monthly Costs (Approximate)

**Small Setup (1.3B model):**
- VPS: $6-10/month
- **Total: ~$6-10/month**

**Medium Setup (6.7B model):**
- VPS: $20-40/month
- **Total: ~$20-40/month**

**Large Setup (33B model with GPU):**
- GPU VPS: $200-300/month
- **Total: ~$200-300/month**

### Comparison to Cloud APIs

- **OpenAI GPT-4**: ~$0.03-0.06 per 1K tokens
- **DeepSeek Coder (self-hosted)**: $0 after VPS cost
- **Break-even**: ~100K tokens/month for small setup

---

## Next Steps

1.     Set up VPS
2.     Install Ollama
3.     Pull DeepSeek Coder model
4.     Configure security
5.     Test connection
6.     Configure CipherMate
7.     Start using!

---

## Additional Resources

- [Ollama Documentation](https://github.com/ollama/ollama)
- [DeepSeek Coder Models](https://ollama.com/library/deepseek-coder)
- [DigitalOcean Tutorials](https://www.digitalocean.com/community/tags/ollama)
- [Nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)

---

## Support

If you encounter issues:
1. Check Ollama logs: `journalctl -u ollama -f`
2. Check Nginx logs: `tail -f /var/log/nginx/error.log`
3. Test API directly with curl
4. Verify firewall rules
5. Check model is pulled: `ollama list`

