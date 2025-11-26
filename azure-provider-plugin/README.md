# Azure Provider Plugin for Docker Compose

A Docker Compose provider plugin that enables seamless integration with Azure managed services, specifically Azure Database for PostgreSQL Flexible Server.

## What is a Provider Plugin?

Provider plugins extend Docker Compose to work with platform capabilities (like managed databases) rather than just containers. When you define a provider service in your `docker-compose.yml`, this plugin handles:

1. Provisioning Azure resources
2. Configuring access and security
3. Returning connection credentials
4. Injecting environment variables into dependent services

## Features

- ✅ Provision Azure PostgreSQL Flexible Server instances
- ✅ Automatic resource group management
- ✅ Firewall configuration for access
- ✅ Database creation
- ✅ Secure password generation
- ✅ Connection string generation
- ✅ Environment variable injection
- ✅ Cleanup/deprovision support

## Prerequisites

1. **Node.js 18+** installed
2. **Azure Subscription** with appropriate permissions
3. **Azure CLI** or **Azure credentials** configured
4. **Docker Compose 2.36.0+**

## Installation

### 1. Install dependencies

```bash
cd azure-provider-plugin
npm install
```

### 2. Make the plugin executable and link it

```bash
chmod +x index.js
npm link
```

This makes `docker-azure` available globally on your system.

### 3. Create the 'azure' wrapper for Docker Compose

Docker Compose looks for an executable named `azure` (matching the provider type). Create a wrapper:

```bash
chmod +x azure

# Option A: Link to /usr/local/bin (requires sudo)
sudo ln -sf "$(pwd)/azure" /usr/local/bin/azure

# Option B: Add to PATH (no sudo needed)
export PATH="$(pwd):$PATH"
echo 'export PATH="$PATH:/path/to/azure-provider-plugin"' >> ~/.zshrc
```

### 4. Verify installation

```bash
docker-azure --version
azure --help
```

## Configuration

### Environment Variables

Set these environment variables before using the plugin:

```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"           # For service principal
export AZURE_CLIENT_SECRET="your-client-secret"   # For service principal

# Optional
export AZURE_RESOURCE_GROUP="docker-compose-rg"
export AZURE_LOCATION="eastus"
```

### Azure Authentication Methods

The plugin supports multiple authentication methods via Azure Identity SDK:

1. **Azure CLI** (easiest for local development)
   ```bash
   az login
   ```

2. **Environment Variables** (service principal)
   ```bash
   export AZURE_TENANT_ID="..."
   export AZURE_CLIENT_ID="..."
   export AZURE_CLIENT_SECRET="..."
   ```

3. **Managed Identity** (when running in Azure)

4. **Visual Studio Code** Azure account

## Usage with Docker Compose

### 1. Create a docker-compose.yml with provider service

```yaml
services:
  # Provider service for Azure PostgreSQL
  database:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: myapp-postgres-${USER}
        database_name: myappdb
        sku: Standard_B1ms
        storage_mb: 32768
        backup_retention_days: 7
        geo_redundant_backup: false
        admin_username: dbadmin
        version: "14"

  # Application service
  app:
    image: node:18-alpine
    depends_on:
      - database
    ports:
      - "3000:3000"
    # These environment variables are automatically injected:
    # DATABASE_HOST
    # DATABASE_PORT
    # DATABASE_DATABASE
    # DATABASE_USER
    # DATABASE_PASSWORD
    # DATABASE_URL
    # DATABASE_SSL_MODE
```

### 2. Start your application

```bash
docker compose up
```

**What happens:**
- Docker Compose detects the `provider` type is `azure`
- Calls: `docker-azure compose up database --server_name myapp-postgres-user --resource postgres ...`
- The plugin provisions PostgreSQL Flexible Server (5-10 minutes)
- Plugin sends JSON messages with type `info`, `debug`, `error`, and `setenv`
- `setenv` messages inject environment variables into dependent services
- Your `app` service receives `DATABASE_*` environment variables automatically

### 3. Stop and cleanup

```bash
docker compose down
```

To deprovision Azure resources:

```bash
# This will be called automatically by docker compose down if supported
docker-azure compose down database --server_name myapp-postgres-user --resource_group docker-compose-rg
```

## Configuration Options

### PostgreSQL Options

| Option | Description | Default | Required |
|--------|-------------|---------|----------|
| `resource` | Resource type | - | Yes (`postgres`) |
| `server_name` | Server name (globally unique) | - | Yes |
| `database_name` | Database name | `defaultdb` | No |
| `resource_group` | Azure resource group | `docker-compose-rg` | No |
| `location` | Azure region | `eastus` | No |
| `sku` | Pricing tier | `Standard_B1ms` | No |
| `storage_mb` | Storage in MB | `32768` | No |
| `backup_retention_days` | Backup retention | `7` | No |
| `geo_redundant_backup` | Geo-redundant backup | `false` | No |
| `admin_username` | Admin username | `dbadmin` | No |
| `version` | PostgreSQL version | `14` | No |

### SKU Options

- **Burstable**: `Standard_B1ms`, `Standard_B2s`
- **General Purpose**: `Standard_D2s_v3`, `Standard_D4s_v3`
- **Memory Optimized**: `Standard_E2s_v3`, `Standard_E4s_v3`

## Environment Variables Injected

When a service depends on the Azure PostgreSQL provider, these variables are automatically injected:

```bash
DATABASE_HOST=myapp-postgres.postgres.database.azure.com
DATABASE_PORT=5432
DATABASE_DATABASE=myappdb
DATABASE_USER=dbadmin
DATABASE_PASSWORD=<generated-password>
DATABASE_URL=postgresql://dbadmin:<password>@myapp-postgres.postgres.database.azure.com:5432/myappdb?sslmode=require
DATABASE_SSL_MODE=require
```

The prefix is derived from the service name (e.g., `database` becomes `DATABASE_`).

## Testing the Plugin

### Standalone test

```bash
# Set environment variables
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
az login

# Test metadata command
docker-azure metadata

# Test provision command manually
docker-azure compose up testdb \
  --resource postgres \
  --server_name test-postgres-server \
  --database_name testdb \
  --sku Standard_B1ms

# Test deprovision command manually
docker-azure compose down testdb \
  --server_name test-postgres-server \
  --resource_group docker-compose-rg
```

### With Docker Compose

See the parent directory's `docker-compose.yml` for a complete example with a Node.js application.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Docker Compose                              │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ docker-compose.yml                  │   │
│  │                                     │   │
│  │ services:                           │   │
│  │   database:                         │   │
│  │     provider:                       │   │
│  │       type: azure                   │   │
│  └──────────────┬──────────────────────┘   │
│                 │                           │
│                 │ Executes:                 │
│                 │ docker-azure compose up   │
│                 ▼                           │
│  ┌──────────────────────────────────────┐  │
│  │ docker-azure plugin                  │  │
│  │ - Authenticates with Azure           │  │
│  │ - Provisions resources               │  │
│  │ - Sends JSON messages:               │  │
│  │   {"type":"info","message":"..."}    │  │
│  │   {"type":"setenv","message":"..."}  │  │
│  └──────────────┬───────────────────────┘  │
│                 │                           │
│                 │ Injects env vars          │
│                 ▼                           │
│  ┌──────────────────────────────────────┐  │
│  │ app service                          │  │
│  │ - DATABASE_HOST                      │  │
│  │ - DATABASE_PASSWORD                  │  │
│  │ - etc.                               │  │
│  └──────────────────────────────────────┘  │
└─────────────────┼──────────────────────────┘
                  │
                  │ Azure SDK
                  ▼
         ┌────────────────────┐
         │  Azure Platform    │
         │                    │
         │  ┌──────────────┐  │
         │  │ PostgreSQL   │  │
         │  │ Flexible     │  │
         │  │ Server       │  │
         │  └──────────────┘  │
         └────────────────────┘
```

## Communication Protocol

The plugin implements the Docker Compose provider protocol:

### Commands
- **`compose up <service>`** - Provision resources and return connection info
- **`compose down <service>`** - Deprovision/cleanup resources
- **`metadata`** - Return parameter information as JSON

### JSON Messages

All messages are JSON objects with `type` and `message` fields:

```json
{"type": "info", "message": "Creating PostgreSQL server..."}
{"type": "debug", "message": "Detailed debug information"}
{"type": "error", "message": "Something went wrong"}
{"type": "setenv", "message": "HOST=myserver.postgres.database.azure.com"}
```

**Message Types:**
- `info` - Status updates shown to user
- `debug` - Detailed logs (only shown with `--verbose`)
- `error` - Error messages shown to user
- `setenv` - Environment variables to inject (format: `KEY=VALUE`)

## Troubleshooting

### Plugin not found

If Docker Compose can't find the plugin:

1. Ensure `docker-azure` is in your PATH:
   ```bash
   which docker-azure
   ```

2. Re-link the plugin:
   ```bash
   npm link
   ```

3. Try running directly:
   ```bash
   docker-azure metadata
   ```

### Authentication issues

```bash
# Verify Azure CLI login
az account show

# Or test with service principal
export AZURE_TENANT_ID="..."
export AZURE_CLIENT_ID="..."
export AZURE_CLIENT_SECRET="..."
```

### Permission errors

Ensure your Azure account has these permissions:
- `Microsoft.Resources/resourceGroups/*`
- `Microsoft.DBforPostgreSQL/flexibleServers/*`

### Provisioning timeout

PostgreSQL Flexible Server creation takes 5-10 minutes. If it times out:
- Check Azure Portal for the server status
- The plugin will reuse existing servers on retry

## Development

### Project Structure

```
azure-provider-plugin/
├── index.js           # Main plugin code
├── package.json       # Dependencies and metadata
├── README.md         # This file
├── .env.example      # Environment variable template
└── test/
    └── test.js       # Test suite
```

### Adding Support for More Azure Services

To add support for MySQL, Redis, etc.:

1. Add the appropriate Azure SDK package
2. Create a provider class (similar to `AzurePostgresProvider`)
3. Update the `handleProvision` function to route to the correct provider
4. Update `PROVIDER_METADATA.supported_resources`

## Limitations

- Currently only supports PostgreSQL Flexible Server
- Firewall is configured to allow all IPs (for development)
- No support for VNet integration yet
- Manual cleanup required for deprovisioning

## Future Enhancements

- [ ] MySQL Flexible Server support
- [ ] Azure Cache for Redis support
- [ ] VNet integration
- [ ] Private endpoint support
- [ ] Better cleanup on `docker compose down`
- [ ] State management for existing resources
- [ ] Cost estimation before provisioning

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT

## Related Documentation

- [Docker Compose Provider Services](https://docs.docker.com/compose/how-tos/provider-services/)
- [Compose Extensions](https://github.com/docker/compose/blob/main/docs/extension.md)
- [Azure PostgreSQL Flexible Server](https://docs.microsoft.com/en-us/azure/postgresql/flexible-server/)
- [Azure Identity SDK](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/identity/identity)
