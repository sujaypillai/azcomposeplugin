# Docker Compose with Azure Provider - Quick Start

## The Issue You Encountered

```
exec: "azure": executable file not found in $PATH
```

**Why?** When you use `provider: type: azure`, Docker Compose looks for an executable named `azure` in your PATH.

## Quick Fix (2 Steps)

### Step 1: Add to PATH

From the `dc` directory:

```bash
source setup-path.sh
```

This adds the azure provider plugin to your PATH for the current terminal session.

### Step 2: Run Docker Compose

```bash
docker compose up
```

## Make it Permanent

To avoid running `source setup-path.sh` every time:

```bash
# For zsh (macOS default)
echo 'export PATH="/Users/sujaypillai/dev/dockerdemos/dc/azure-provider-plugin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# For bash
echo 'export PATH="/Users/sujaypillai/dev/dockerdemos/dc/azure-provider-plugin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Or Use Symlink (Alternative)

```bash
cd azure-provider-plugin
sudo ln -sf "$(pwd)/azure" /usr/local/bin/azure
```

## Verify Setup

```bash
which azure
# Should output: /Users/sujaypillai/dev/dockerdemos/dc/azure-provider-plugin/azure

which docker-azure
# Should output: /usr/local/bin/docker-azure (or similar)

azure --help
# Should show: Usage: docker-azure compose...
```

## Complete Workflow

```bash
# 1. Setup (one time)
cd /Users/sujaypillai/dev/dockerdemos/dc
source setup-path.sh

# 2. Configure Azure
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
az login

# 3. Start application
docker compose up
```

## What Happens When You Run docker compose up

```
1. Docker Compose reads docker-compose.yml
2. Sees provider: type: azure
3. Looks for 'azure' executable in PATH
4. Finds /path/to/azure-provider-plugin/azure
5. Executes: azure compose up postgres --server_name myapp-postgres ...
6. The 'azure' script delegates to: docker-azure compose up ...
7. docker-azure provisions Azure PostgreSQL
8. Returns environment variables via JSON messages
9. Docker Compose injects variables into dependent services
10. Starts web and worker services with DATABASE_* variables
```

## Troubleshooting

### Still getting "executable file not found"?

```bash
# Debug: Check PATH
echo $PATH | grep azure-provider-plugin

# If not found, run:
export PATH="/Users/sujaypillai/dev/dockerdemos/dc/azure-provider-plugin:$PATH"

# Verify
which azure
```

### Provider works but containers fail?

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for:
- Azure authentication issues
- Docker image pull problems
- Connection issues

## Next Steps

Once PATH is configured:

1. **Test the plugin:**
   ```bash
   azure --help
   docker-azure metadata
   ```

2. **Configure Azure:**
   ```bash
   export AZURE_SUBSCRIPTION_ID="your-sub-id"
   az login
   ```

3. **Run your app:**
   ```bash
   docker compose up
   ```

4. **Check injected variables:**
   ```bash
   docker compose exec web env | grep POSTGRES_
   ```

## Files in This Directory

- **docker-compose.yml** - Main compose file with Azure provider
- **setup-path.sh** - Quick PATH setup script (run with `source`)
- **azure-provider-plugin/** - The provider plugin
- **app/** - Sample Node.js application
- **TROUBLESHOOTING.md** - Detailed troubleshooting guide
- **README.md** - Original project documentation

## For More Details

- [azure-provider-plugin/README.md](azure-provider-plugin/README.md) - Full plugin documentation
- [azure-provider-plugin/QUICKSTART.md](azure-provider-plugin/QUICKSTART.md) - 5-minute setup guide
- [azure-provider-plugin/PROTOCOL.md](azure-provider-plugin/PROTOCOL.md) - Protocol specification
- [azure-provider-plugin/EXAMPLES.md](azure-provider-plugin/EXAMPLES.md) - Working examples
