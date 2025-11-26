# Troubleshooting Guide

## Docker Image Pull Issues

### Symptom
```
unable to get image 'node:18-alpine': Error response from daemon: 
Failed to serve the request due to timeout 3m0s
```

### Quick Fixes

**1. Use the updated docker-compose.yml (already fixed)**
   - Changed from `node:18-alpine` to `node:20-slim`
   - Slim images are more reliable than alpine for pulling

**2. Pre-pull the image manually:**
```bash
docker pull node:20-slim
docker compose up
```

**3. Check Docker daemon:**
```bash
# Restart Docker
# macOS: Restart Docker Desktop app
# Linux: sudo systemctl restart docker

# Check status
docker info
```

**4. Test network connectivity:**
```bash
# Test Docker Hub
curl -I https://hub.docker.com

# Test image pull directly
docker pull hello-world
```

**5. Increase Docker timeout settings:**

**macOS/Windows (Docker Desktop):**
- Open Docker Desktop
- Go to Settings → Docker Engine
- Add or modify:
```json
{
  "max-concurrent-downloads": 3,
  "max-download-attempts": 5
}
```
- Click "Apply & Restart"

**Linux (/etc/docker/daemon.json):**
```json
{
  "max-concurrent-downloads": 3,
  "max-download-attempts": 5
}
```
```bash
sudo systemctl restart docker
```

**6. Use alternative registry:**
```yaml
services:
  web:
    image: ghcr.io/library/node:20-slim
```

**7. Build locally instead:**
```yaml
services:
  web:
    build:
      context: ./app
      dockerfile: Dockerfile
```

Then create `app/Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
```

## Azure Provider Plugin Issues

### Issue: "exec: 'azure': executable file not found in $PATH"

This is the most common issue! Docker Compose looks for an executable named `azure` (matching the provider type).

**Fix:**
```bash
cd azure-provider-plugin

# Option 1: Add to PATH (recommended)
export PATH="$(pwd):$PATH"
echo 'export PATH="'$(pwd)':$PATH"' >> ~/.zshrc
source ~/.zshrc

# Option 2: Link to /usr/local/bin (requires sudo)
sudo ln -sf "$(pwd)/azure" /usr/local/bin/azure

# Verify
which azure
azure --help
```

Then retry:
```bash
docker compose up
```

### Issue: "AZURE_SUBSCRIPTION_ID not set"

**Fix:**
```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"

# Get your subscription ID:
az account show --query id -o tsv
```

### Issue: "Authentication failed"

**Fix:**
```bash
# Option 1: Azure CLI (recommended for local development)
az login

# Option 2: Service Principal
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
```

### Issue: "Plugin not found"

**Fix:**
```bash
# Check if plugin is installed
which docker-azure

# If not found, reinstall
cd azure-provider-plugin
./install.sh

# Verify installation
docker-azure --version
docker-azure metadata
```

### Issue: "Server name already exists"

**Fix:**
Server names must be globally unique across all Azure. Use a unique prefix:
```yaml
server_name: ${USER}-myapp-postgres  # Uses your username
# Or
server_name: mycompany-myapp-postgres-dev
```

### Issue: Provisioning takes too long

**Expected:** PostgreSQL Flexible Server provisioning takes 5-10 minutes on first run.

**Check status:**
```bash
az postgres flexible-server show \
  --name your-server-name \
  --resource-group docker-compose-rg \
  --query provisioningState
```

### Issue: Connection refused from app

**Fixes:**

1. **Check firewall rules:**
```bash
az postgres flexible-server firewall-rule list \
  --name your-server-name \
  --resource-group docker-compose-rg
```

2. **Verify environment variables:**
```bash
docker compose exec web env | grep POSTGRES_
```

3. **Test connection directly:**
```bash
docker compose exec web sh -c 'apt-get update && apt-get install -y postgresql-client'
docker compose exec web psql "$POSTGRES_URL"
```

## Common Docker Compose Issues

### Issue: "Service 'postgres' failed to build"

Provider services don't build - they provision. This error shouldn't occur.

**Check:**
```bash
# Validate compose file
docker compose config

# Check for syntax errors
docker compose config --quiet
```

### Issue: Environment variables not injected

**Debug:**
```bash
# Check if provider is running
docker compose ps

# Check logs
docker compose logs postgres

# Manually test plugin
docker-azure compose up postgres \
  --resource postgres \
  --server_name test-server
```

## Network Issues

### Docker can't reach Azure

**Test:**
```bash
# Test Azure connectivity
curl -I https://management.azure.com

# Test from within Docker
docker run --rm curlimages/curl curl -I https://management.azure.com
```

### DNS resolution issues

**Fix:**
```bash
# macOS/Windows: Restart Docker Desktop

# Linux: Check DNS settings
cat /etc/resolv.conf

# Add DNS to Docker daemon
# /etc/docker/daemon.json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

## Quick Diagnostic Commands

```bash
# 1. Check Docker
docker version
docker info
docker ps

# 2. Check plugin
docker-azure --version
docker-azure metadata

# 3. Check Azure CLI
az --version
az account show

# 4. Check environment
env | grep AZURE_

# 5. Test compose file
docker compose config
docker compose ps
docker compose logs

# 6. Clean slate
docker compose down -v
docker system prune -af
docker compose up
```

## Getting Help

1. **Check logs:**
   ```bash
   docker compose logs
   docker compose logs postgres
   docker compose logs web
   ```

2. **Enable verbose mode:**
   ```bash
   docker compose --verbose up
   ```

3. **Check Azure Portal:**
   - Go to portal.azure.com
   - Search for your resource group
   - Check server status

4. **Review documentation:**
   - `azure-provider-plugin/README.md`
   - `azure-provider-plugin/PROTOCOL.md`
   - `azure-provider-plugin/EXAMPLES.md`

## Still Having Issues?

Provide these details when seeking help:

```bash
# System info
uname -a
docker version
docker compose version

# Plugin info
which docker-azure
docker-azure --version

# Azure info
az --version
az account show

# Compose validation
docker compose config

# Error logs
docker compose logs 2>&1 | tail -50
```
