# Azure Provider Plugin - Quick Start Guide

This guide will help you quickly get started with the Azure Provider Plugin for Docker Compose.

## Prerequisites

- ✅ Node.js 18+ installed
- ✅ Docker Compose 2.36.0+ installed
- ✅ Azure subscription
- ✅ Azure CLI installed (optional, but recommended)

## Quick Setup (5 minutes)

### Step 1: Install the Plugin

```bash
cd azure-provider-plugin
./install.sh
```

This will:
- Install npm dependencies
- Make the plugin executable
- Link it globally as `docker-azure`
- Create the `azure` wrapper for Docker Compose

**Important:** The `azure` wrapper must be in your PATH for Docker Compose to find it.

If the install script can't link to `/usr/local/bin`, add to PATH manually:
```bash
export PATH="$(pwd):$PATH"
echo 'export PATH="$PATH:'$(pwd)'"' >> ~/.zshrc
```

### Step 2: Configure Azure Credentials

**Option A: Azure CLI (Recommended for local development)**
```bash
az login
```

**Option B: Environment Variables**
```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
export AZURE_TENANT_ID="your-tenant-id"
```

Get your subscription ID:
```bash
az account list --output table
```

### Step 3: Set Required Environment Variables

```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id-here"
```

Optional (defaults provided):
```bash
export AZURE_RESOURCE_GROUP="docker-compose-rg"
export AZURE_LOCATION="eastus"
```

### Step 4: Test the Plugin

```bash
./test.sh
```

Or manually:
```bash
docker-azure --version
azure --help  # This is what Docker Compose calls
docker-azure metadata
```

## Usage Example

### 1. Create or update your docker-compose.yml

```yaml
services:
  database:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: myapp-db-${USER}
        database_name: myappdb
        sku: Standard_B1ms
        storage_mb: 32768

  app:
    image: node:18-alpine
    depends_on:
      - database
    ports:
      - "3000:3000"
    volumes:
      - ./app:/app
    working_dir: /app
    command: npm start
```

### 2. Start Your Application

```bash
cd .. # Go back to the main project directory
docker compose up
```

**What happens:**
1. Docker Compose sees `provider: type: azure`
2. Executes: `docker-azure compose up database --server_name ... --resource postgres ...`
3. Plugin sends JSON progress messages:
   - `{"type":"info","message":"Authenticating with Azure..."}`
   - `{"type":"info","message":"Provisioning PostgreSQL server..."}`
   - `{"type":"setenv","message":"HOST=myserver.postgres.database.azure.com"}`
   - `{"type":"setenv","message":"PASSWORD=generated-password"}`
4. Docker Compose injects environment variables into dependent services
5. Your app receives `DATABASE_HOST`, `DATABASE_PASSWORD`, etc.

**First-time provisioning takes 5-10 minutes. Subsequent runs are faster as existing resources are detected.**

### 3. Use the Database in Your App

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_DATABASE,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// Or use the connection URL
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false }
// });
```

## Common Commands

### Check Plugin Status
```bash
docker-azure --version
docker-azure metadata
```

### Test Compose Commands
```bash
# Test up command (will provision resources)
docker-azure compose up mydb \
  --resource postgres \
  --server_name test-server \
  --database_name testdb

# Test down command (will delete resources)
docker-azure compose down mydb \
  --server_name test-server \
  --resource_group docker-compose-rg
```

### View Azure Resources
```bash
az postgres flexible-server list --output table
az postgres flexible-server show --name myapp-db --resource-group docker-compose-rg
```

## Troubleshooting

### Plugin not found
```bash
which docker-azure  # Should show the path
npm link            # Re-link if needed
```

### Authentication errors
```bash
az login                    # Authenticate with Azure
az account show             # Verify current subscription
az account set --subscription "your-subscription-id"  # Switch subscription
```

### Check Azure permissions
Your account needs these permissions:
- `Microsoft.Resources/resourceGroups/*`
- `Microsoft.DBforPostgreSQL/flexibleServers/*`

### Provisioning takes too long
PostgreSQL Flexible Server creation takes 5-10 minutes. This is normal.

Check status in Azure Portal or:
```bash
az postgres flexible-server show --name your-server --resource-group docker-compose-rg
```

### Connection errors
The plugin configures firewall to allow all IPs (for development). In production:
1. Remove the `AllowAll` firewall rule
2. Add specific IP ranges
3. Or use VNet integration

## Next Steps

- ✅ Check the main README.md for detailed documentation
- ✅ Review docker-compose.yml examples in the parent directory
- ✅ Customize SKU and storage options for your needs
- ✅ Explore adding MySQL or other Azure services

## Cost Considerations

**Burstable tier** (`Standard_B1ms`):
- ~$12-15/month
- Good for development/testing
- Can be stopped when not in use

**To minimize costs:**
```bash
# Delete server when done
az postgres flexible-server delete --name your-server --resource-group docker-compose-rg --yes

# Or delete entire resource group
az group delete --name docker-compose-rg --yes
```

## Support

For issues or questions:
1. Check the main README.md
2. Review Azure PostgreSQL documentation
3. Check Docker Compose provider documentation

Happy coding! 🚀
