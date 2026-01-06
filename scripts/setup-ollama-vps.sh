#!/bin/bash

# Ollama DeepSeek Coder VPS Setup Script
# Run this on your VPS server (Ubuntu 22.04)

set -e

echo "🚀 Setting up Ollama with DeepSeek Coder on VPS..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

# Update system
echo -e "${GREEN}[1/8] Updating system packages...${NC}"
apt update && apt upgrade -y

# Install dependencies
echo -e "${GREEN}[2/8] Installing dependencies...${NC}"
apt install -y curl wget git build-essential ufw nginx apache2-utils

# Install Ollama
echo -e "${GREEN}[3/8] Installing Ollama...${NC}"
curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama to listen on all interfaces
echo -e "${GREEN}[4/8] Configuring Ollama service...${NC}"
systemctl stop ollama
cat > /etc/systemd/system/ollama.service << 'EOF'
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

systemctl daemon-reload
systemctl enable ollama
systemctl start ollama

# Wait for Ollama to start
echo "Waiting for Ollama to start..."
sleep 5

# Pull DeepSeek Coder model
echo -e "${GREEN}[5/8] Pulling DeepSeek Coder model (this may take a while)...${NC}"
echo "Choose model size:"
echo "1) deepseek-coder:1.3b (Fastest, ~776MB)"
echo "2) deepseek-coder:6.7b (Recommended, ~3.8GB)"
echo "3) deepseek-coder:33b (Best quality, ~19GB, requires GPU)"
read -p "Enter choice [1-3] (default: 1): " model_choice

case $model_choice in
    2)
        MODEL="deepseek-coder:6.7b"
        ;;
    3)
        MODEL="deepseek-coder:33b"
        ;;
    *)
        MODEL="deepseek-coder:1.3b"
        ;;
esac

echo "Pulling $MODEL..."
ollama pull $MODEL

# Configure firewall
echo -e "${GREEN}[6/8] Configuring firewall...${NC}"
ufw allow 22/tcp
read -p "Enter your IP address for Ollama access (or press Enter to allow all): " user_ip

if [ -z "$user_ip" ]; then
    echo -e "${YELLOW}Warning: Allowing Ollama access from all IPs. Consider restricting this!${NC}"
    ufw allow 11434/tcp
else
    ufw allow from $user_ip to any port 11434
fi

ufw --force enable

# Setup Nginx reverse proxy with authentication
echo -e "${GREEN}[7/8] Setting up Nginx reverse proxy...${NC}"
read -p "Do you want to set up Nginx with authentication? (y/n) [y]: " setup_nginx

if [ "$setup_nginx" != "n" ]; then
    read -p "Enter username for Ollama API: " ollama_user
    read -sp "Enter password: " ollama_pass
    echo ""
    
    # Create htpasswd file
    htpasswd -b -c /etc/nginx/.htpasswd $ollama_user "$ollama_pass"
    
    # Get server IP or domain
    SERVER_IP=$(curl -s ifconfig.me)
    read -p "Enter your domain name (or press Enter to use IP $SERVER_IP): " domain_name
    DOMAIN=${domain_name:-$SERVER_IP}
    
    # Create Nginx config
    cat > /etc/nginx/sites-available/ollama << EOF
server {
    listen 80;
    server_name $DOMAIN;

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
        
        # Timeouts for long requests
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test and restart Nginx
    nginx -t
    systemctl restart nginx
    
    echo -e "${GREEN}Nginx configured! Access URL: http://$DOMAIN${NC}"
    echo -e "${YELLOW}Username: $ollama_user${NC}"
else
    echo -e "${YELLOW}Skipping Nginx setup. Ollama accessible directly on port 11434${NC}"
fi

# Test Ollama
echo -e "${GREEN}[8/8] Testing Ollama installation...${NC}"
sleep 2

if curl -s http://localhost:11434/api/tags > /dev/null; then
    echo -e "${GREEN}✅ Ollama is running!${NC}"
else
    echo -e "${RED}❌ Ollama test failed. Check logs: journalctl -u ollama -f${NC}"
fi

# Display connection info
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "Connection Information:"
if [ "$setup_nginx" != "n" ]; then
    echo "  URL: http://$DOMAIN/v1/chat/completions"
    echo "  Username: $ollama_user"
    echo "  Password: [the password you entered]"
else
    SERVER_IP=$(curl -s ifconfig.me)
    echo "  URL: http://$SERVER_IP:11434/v1/chat/completions"
fi
echo "  Model: $MODEL"
echo ""
echo "CipherMate Configuration:"
echo "  Set 'ciphermate.useCloudAI' to false"
echo "  Set 'ciphermate.lmStudioUrl' to the URL above"
if [ "$setup_nginx" != "n" ]; then
    echo "  Format: http://$ollama_user:PASSWORD@$DOMAIN/v1/chat/completions"
fi
echo ""
echo "Test connection:"
if [ "$setup_nginx" != "n" ]; then
    echo "  curl http://$DOMAIN/api/tags"
else
    echo "  curl http://$SERVER_IP:11434/api/tags"
fi
echo ""
echo -e "${YELLOW}⚠️  Security Notes:${NC}"
echo "  - Keep your server updated: apt update && apt upgrade"
echo "  - Monitor logs: journalctl -u ollama -f"
echo "  - Check firewall: ufw status"
echo ""

