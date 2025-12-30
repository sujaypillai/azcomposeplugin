# Copilot Instructions for Azure Compose Plugin Repository

## Repository Overview

This repository demonstrates a **Docker Compose provider plugin for Azure services**, specifically Azure Database for PostgreSQL Flexible Server. The plugin extends Docker Compose to provision and manage Azure cloud resources declaratively through `docker-compose.yml` files.

**Project Type:** Docker Compose provider plugin (Node.js)
**Languages:** JavaScript (Node.js 18+)
**Target Platforms:** Docker Compose 2.36.0+, Azure Cloud
**Repository Size:** Small (~50 source files, mostly documentation)

## High-Level Architecture

### Core Components

1. **azure-provider-plugin/** - The Docker Compose provider plugin
   - `index.js` - Main plugin implementation (Azure SDK integration)
   - `azure` - Wrapper script that forwards commands to `docker-azure`
   - `package.json` - Plugin dependencies and configuration
   - `install.sh` - Installation and setup script

2. **app/** - Sample Node.js application demonstrating plugin usage
   - `index.js` - Express web server that connects to Azure PostgreSQL
   - `worker.js` - Background worker for analytics processing
   - `package.json` - Application dependencies (express, pg)
   - `public/` - Frontend static files

3. **Configuration Files**
   - `docker-compose.yml` - Main compose file with Azure provider service
   - `docker-compose-minimal.yml` - Minimal example configuration
   - `.gitignore` - Excludes node_modules, .env files, logs

### How It Works

When you run `docker compose up`:
1. Docker Compose detects `provider: type: azure` in the compose file
2. Searches for executable named `azure` in PATH
3. Executes: `docker-azure compose up <service> --server_name=... --resource=postgres ...`
4. Plugin provisions Azure PostgreSQL Flexible Server (5-10 minutes)
5. Plugin sends JSON messages via stdout with connection details
6. Docker Compose injects environment variables (POSTGRES_HOST, POSTGRES_PASSWORD, etc.) into dependent services
7. Application services start with database credentials automatically configured

## Build and Installation Instructions

### Prerequisites

**ALWAYS verify these versions before making changes:**

- **Node.js**: 18.0.0 or later (tested with 20.19.6)
  - Check: `node --version`
- **npm**: 8.0.0 or later (tested with 10.8.2)
  - Check: `npm --version`
- **Docker**: 20.10.0 or later (tested with 28.0.4)
  - Check: `docker --version`
- **Docker Compose**: 2.36.0 or later (tested with 2.38.2)
  - Check: `docker compose version`

### Installation Steps (CRITICAL - Follow in Order)

**ALWAYS install dependencies in this exact order to avoid errors:**

1. **Install plugin dependencies:**
   ```bash
   cd azure-provider-plugin
   npm install
   ```
   - Expected time: 5-10 seconds
   - Should install ~50 packages
   - No vulnerabilities expected

2. **Make plugin executable and link globally:**
   ```bash
   chmod +x index.js
   npm link
   ```
   - This makes `docker-azure` available globally
   - May require sudo depending on npm configuration

3. **Setup the `azure` wrapper (REQUIRED for Docker Compose):**
   ```bash
   chmod +x azure
   export PATH="$(pwd):$PATH"
   ```
   - The `azure` executable MUST be in PATH for Docker Compose to find it
   - Add to shell profile for persistence: `echo 'export PATH="$PATH:/path/to/azure-provider-plugin"' >> ~/.zshrc`

4. **Verify plugin installation:**
   ```bash
   which docker-azure    # Should show path to linked binary
   which azure           # Should show path to wrapper script
   docker-azure metadata # Should output JSON metadata
   ```

5. **Install sample app dependencies:**
   ```bash
   cd ../app
   npm install
   ```
   - Expected time: 5-10 seconds
   - Should install ~83 packages

### Alternative: Use install.sh Script

The repository includes an automated installation script:
```bash
cd azure-provider-plugin
./install.sh
```

This script performs all installation steps automatically but may require sudo for linking to `/usr/local/bin`.

### Environment Setup (Azure Authentication)

**CRITICAL: Plugin WILL FAIL without proper Azure authentication**

**Option A: Azure CLI (Recommended for local development):**
```bash
az login
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
```

**Option B: Service Principal (For CI/CD):**
```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
```

**To get your subscription ID:**
```bash
az account show --query id -o tsv
```

## Testing and Validation

### Test Plugin Metadata

```bash
cd azure-provider-plugin
docker-azure metadata
```
- Should output JSON with parameter definitions
- No Azure credentials required for this test

### Test Plugin Installation

```bash
cd azure-provider-plugin
./test.sh
```
- Verifies `docker-azure` and `azure` are in PATH
- Tests metadata command
- Does NOT provision real Azure resources

### Running the Full Example (Provisions Real Azure Resources)

**WARNING: This creates billable Azure resources (~$12-15/month for Standard_B1ms)**

```bash
# Ensure Azure credentials are configured
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
az login

# Start the application
docker compose up
```

**Expected behavior:**
- First run: Takes 5-10 minutes to provision PostgreSQL Flexible Server
- Plugin outputs JSON messages showing progress
- After provisioning, web and worker containers start
- Web server available at http://localhost:4000
- Subsequent runs: Faster (uses existing server)

**To verify environment variables were injected:**
```bash
docker compose exec web env | grep POSTGRES_
```

**To test the application:**
```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/stats
```

**To cleanup (deprovisions Azure resources):**
```bash
docker compose down
```

Note: Automatic deprovisioning on `docker compose down` may not be fully implemented. To manually cleanup:
```bash
az postgres flexible-server delete --name <server-name> --resource-group docker-compose-rg --yes
```

## Project Layout

### Root Directory Structure

```
.
├── .git/                          # Git repository metadata
├── .gitignore                     # Ignores: node_modules, .env*, *.log, .DS_Store
├── README.md                      # Main project documentation
├── START-HERE.md                  # Quick start guide for PATH setup
├── TROUBLESHOOTING.md             # Common issues and solutions
├── LIFECYCLE.md                   # Detailed provider lifecycle documentation
├── docker-compose.yml             # Main compose file with Azure provider
├── docker-compose-minimal.yml     # Minimal example
├── app/                           # Sample Node.js application
│   ├── index.js                   # Express web server
│   ├── worker.js                  # Background worker
│   ├── package.json               # Dependencies: express, pg
│   ├── public/                    # Static frontend files
│   └── node_modules/              # Installed dependencies (gitignored)
└── azure-provider-plugin/         # Docker Compose provider plugin
    ├── index.js                   # Main plugin code
    ├── azure                      # Wrapper script (forwards to docker-azure)
    ├── package.json               # Dependencies: @azure/*, commander
    ├── install.sh                 # Installation automation script
    ├── test.sh                    # Plugin verification script
    ├── README.md                  # Plugin documentation
    ├── QUICKSTART.md              # 5-minute setup guide
    ├── PROTOCOL.md                # Docker Compose provider protocol spec
    ├── EXAMPLES.md                # Usage examples
    ├── IMPLEMENTATION.md          # Implementation details
    ├── .env.example               # Environment variable template
    └── node_modules/              # Installed dependencies (gitignored)
```

### Key Configuration Files

- **azure-provider-plugin/package.json**: Plugin metadata, specifies Node 18+ requirement
- **app/package.json**: App dependencies (express ^4.18.2, pg ^8.11.3)
- **.gitignore**: Prevents committing node_modules, .env files, logs
- **docker-compose.yml**: Defines provider service and dependent app services

### No GitHub Workflows

This repository does NOT have `.github/workflows/` directory. There are no CI/CD pipelines, automated tests, or build checks.

**When making changes:**
- Manual testing is required
- No automated validation will run
- Plugin must be tested locally before committing

## Common Issues and Workarounds

### Issue: "exec: 'azure': executable file not found in $PATH"

**Cause:** Docker Compose cannot find the `azure` wrapper script

**Fix:**
```bash
cd azure-provider-plugin
export PATH="$(pwd):$PATH"
# Or: sudo ln -sf $(pwd)/azure /usr/local/bin/azure
```

**Always verify:**
```bash
which azure  # Should output a path
```

### Issue: "AZURE_SUBSCRIPTION_ID not set"

**Cause:** Plugin requires Azure credentials

**Fix:**
```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
az login
```

### Issue: Docker image pull timeout

**Cause:** Network issues or Docker Hub rate limiting

**Fix:**
```bash
# Pre-pull images manually
docker pull node:20-slim

# Or use docker-compose-minimal.yml which has no app services
docker compose -f docker-compose-minimal.yml config
```

### Issue: PostgreSQL provisioning takes too long

**Expected behavior:** First-time provisioning takes 5-10 minutes

**This is NORMAL.** Azure PostgreSQL Flexible Server creation is slow.

**To check status:**
```bash
az postgres flexible-server show \
  --name <server-name> \
  --resource-group docker-compose-rg \
  --query provisioningState
```

### Issue: npm install fails with permission errors

**Fix:**
```bash
# Don't use sudo with npm install in the project directory
# If npm link fails, use sudo only for that command:
sudo npm link
```

## Important Implementation Details

### Docker Compose Provider Protocol

The plugin implements the Docker Compose provider interface by:

1. **Metadata Command:** `docker-azure metadata` returns JSON describing parameters
2. **Up Command:** `docker-azure compose up <service> --option=value ...` provisions resources
3. **Down Command:** `docker-azure compose down <service> --option=value ...` deprovisions resources

### JSON Message Protocol

Plugin communicates with Docker Compose via line-delimited JSON on stdout:

```json
{"type":"info","message":"Creating PostgreSQL server..."}
{"type":"debug","message":"Using subscription: abc123"}
{"type":"error","message":"Authentication failed"}
{"type":"setenv","message":"HOST=server.postgres.database.azure.com"}
```

Message types:
- `info` - Status updates shown to user
- `debug` - Detailed logs (only shown with `docker compose --verbose`)
- `error` - Error messages
- `setenv` - Environment variables to inject (format: `KEY=VALUE`)

### Environment Variable Injection

Docker Compose automatically prefixes environment variables with the service name in uppercase.

**Provider outputs:**
```json
{"type":"setenv","message":"HOST=myserver.postgres.database.azure.com"}
{"type":"setenv","message":"PASSWORD=secret123"}
```

**Injected into dependent services as:**
```
POSTGRES_HOST=myserver.postgres.database.azure.com
POSTGRES_PASSWORD=secret123
```

The prefix comes from the service name (e.g., `postgres` → `POSTGRES_`)

### Idempotency

The plugin is **idempotent**. Running `docker compose up` multiple times:
- First run: Provisions new PostgreSQL server (5-10 minutes)
- Subsequent runs: Detects existing server and returns same connection info (fast)

**Implementation:** Plugin checks if server exists before creating, reuses existing resources.

## Validation Checklist

Before finalizing any code changes, ALWAYS:

1. **Install dependencies:**
   ```bash
   cd azure-provider-plugin && npm install
   cd ../app && npm install
   ```

2. **Verify plugin works:**
   ```bash
   cd azure-provider-plugin
   docker-azure metadata
   ```

3. **Check PATH setup:**
   ```bash
   which azure
   which docker-azure
   ```

4. **Validate compose file syntax:**
   ```bash
   docker compose config
   ```

5. **Test with minimal example (no Azure provisioning):**
   ```bash
   # Just verify the plugin is discoverable
   docker compose -f docker-compose-minimal.yml config
   ```

## Trust These Instructions

These instructions have been validated by:
- Successfully installing the plugin from scratch
- Verifying all dependencies install without errors
- Testing the metadata command
- Confirming PATH requirements
- Validating Docker Compose version compatibility

**Only search for additional information if:**
- You encounter an error not documented here
- You need to understand Azure SDK implementation details
- You're adding support for new Azure services
- These instructions are found to be incorrect or incomplete

When in doubt about a command or process, refer to:
1. This file first
2. azure-provider-plugin/README.md for plugin details
3. TROUBLESHOOTING.md for specific error scenarios
4. LIFECYCLE.md for protocol implementation details
