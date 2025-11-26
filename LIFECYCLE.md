# Azure Provider Plugin Lifecycle Documentation

This document describes the complete lifecycle of the Azure PostgreSQL provider plugin for Docker Compose, based on the [Docker Compose extension specification](https://github.com/docker/compose/blob/main/docs/extension.md).

## Table of Contents

- [Overview](#overview)
- [Provider Discovery](#provider-discovery)
- [Up Lifecycle](#up-lifecycle)
- [Communication Protocol](#communication-protocol)
- [Environment Variable Injection](#environment-variable-injection)
- [Down Lifecycle](#down-lifecycle)
- [Metadata Command](#metadata-command)
- [Complete Flow Diagram](#complete-flow-diagram)

## Overview

The Azure provider plugin implements the Docker Compose provider service interface to provision and manage Azure PostgreSQL Flexible Server instances. The plugin acts as a bridge between Docker Compose and Azure cloud services.

**Compose File Example:**
```yaml
services:
  postgres:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: apppgc67f72
        database_name: myappdb
        location: southeastasia
```

## Provider Discovery

### 1. Type Resolution

When Docker Compose encounters a service with `provider.type: azure`, it searches for an executable named `azure` in the following order:

1. **Docker CLI Plugin**: `~/.docker/cli-plugins/docker-azure`
2. **System PATH**: Any executable named `azure` in `$PATH`

**Our Implementation:**
- Wrapper script: `/Users/sujaypillai/dev/dockerdemos/dc/azure-provider-plugin/azure`
- Actual plugin: `/opt/homebrew/bin/docker-azure`
- Added to PATH: `export PATH="/path/to/azure-provider-plugin:$PATH"`

### 2. Initial Validation

Docker Compose validates the provider by checking:
- The executable exists and is runnable
- It accepts the `compose` command
- It supports `metadata`, `up`, and `down` subcommands

## Up Lifecycle

### Phase 1: Metadata Query

**Command:**
```bash
azure compose metadata
```

**Purpose:** Docker Compose queries the provider to understand what parameters are accepted.

**Response:** JSON structure describing available parameters:
```json
{
  "description": "Manage Azure services (PostgreSQL, MySQL, etc.)",
  "up": {
    "parameters": [
      {
        "name": "resource",
        "description": "Azure resource type (postgres, mysql)",
        "required": true,
        "type": "string"
      },
      {
        "name": "server_name",
        "description": "Globally unique server name",
        "required": true,
        "type": "string"
      },
      // ... more parameters
    ]
  },
  "down": {
    "parameters": [
      {
        "name": "server_name",
        "description": "Name of the server to delete",
        "required": true,
        "type": "string"
      }
    ]
  }
}
```

### Phase 2: Resource Provisioning

**Command:**
```bash
azure compose --project-name=dc up \
  --resource=postgres \
  --server_name=apppgc67f72 \
  --database_name=myappdb \
  --location=southeastasia \
  postgres
```

**Note:** Docker Compose passes options in `--key=value` format before the service name.

### Phase 3: Provider Execution Flow

1. **Authentication**
   ```javascript
   // Plugin authenticates with Azure
   const credential = new DefaultAzureCredential();
   const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
   ```

2. **Resource Group Verification**
   ```javascript
   // Check if resource group exists, create if needed
   await resourceClient.resourceGroups.createOrUpdate(resourceGroup, {
     location: location
   });
   ```

3. **Server Provisioning** (5-10 minutes)
   ```javascript
   // Create PostgreSQL Flexible Server
   const server = await postgresClient.servers.beginCreateAndWait(
     resourceGroup,
     serverName,
     {
       location,
       sku: { name: 'Standard_B1ms', tier: 'Burstable' },
       storage: { storageSizeGB: 32 },
       // ... more configuration
     }
   );
   ```

4. **Firewall Configuration**
   ```javascript
   // Allow all IPs (for demo purposes)
   await postgresClient.firewallRules.beginCreateOrUpdateAndWait(
     resourceGroup,
     serverName,
     'AllowAll',
     { startIpAddress: '0.0.0.0', endIpAddress: '255.255.255.255' }
   );
   ```

5. **Database Creation**
   ```javascript
   // Create the specified database
   await postgresClient.databases.beginCreateAndWait(
     resourceGroup,
     serverName,
     databaseName,
     { charset: 'UTF8', collation: 'en_US.utf8' }
   );
   ```

6. **Connection Info Generation**
   ```javascript
   // Generate connection details
   return {
     HOST: `${serverName}.postgres.database.azure.com`,
     PORT: '5432',
     DATABASE: databaseName,
     USER: adminUsername,
     PASSWORD: generatedPassword,
     URL: `postgresql://${adminUsername}:${password}@${host}:5432/${database}?sslmode=require`,
     SSL_MODE: 'require'
   };
   ```

## Communication Protocol

The provider communicates with Docker Compose via **line-delimited JSON messages** sent to `stdout`.

### Message Types

#### 1. Info Messages
```json
{"type": "info", "message": "Creating resource group: docker-compose-rg"}
{"type": "info", "message": "Provisioning PostgreSQL server (this may take 5-10 minutes)..."}
{"type": "info", "message": "Creating database: myappdb"}
```

**Rendering:** Displayed as service state in Docker Compose progress UI

#### 2. Debug Messages
```json
{"type": "debug", "message": "Using existing server apppgc67f72"}
{"type": "debug", "message": "Provisioning completed"}
```

**Rendering:** Only shown with `docker compose --verbose` flag

#### 3. Error Messages
```json
{"type": "error", "message": "Failed to provision: Subscription restricted from eastus"}
```

**Rendering:** Displayed as service failure reason

#### 4. Environment Variable Messages (setenv)
```json
{"type": "setenv", "message": "HOST=apppgc67f72.postgres.database.azure.com"}
{"type": "setenv", "message": "PORT=5432"}
{"type": "setenv", "message": "DATABASE=myappdb"}
{"type": "setenv", "message": "USER=dbadmin"}
{"type": "setenv", "message": "PASSWORD=G0IyYyWSpl7oBtAI2hyc6on8"}
{"type": "setenv", "message": "URL=postgresql://dbadmin:G0IyYyWSpl7oBtAI2hyc6on8@apppgc67f72.postgres.database.azure.com:5432/myappdb?sslmode=require"}
```

**Processing:** Docker Compose injects these into dependent services

### Docker Compose UI Display

```
[+] Running 1/1
 ⠋ postgres  Creating PostgreSQL server (this may take 5-10 minutes)...  6.1s
```

```
[+] Running 3/3
 ✔ postgres               Created                                         320.6s
 ✔ Container dc-web-1     Created                                           0.0s
 ✔ Container dc-worker-1  Created                                           0.0s
```

## Environment Variable Injection

### Prefix Convention

Docker Compose automatically prefixes environment variables with the **service name in uppercase**.

**Provider Output:**
```json
{"type": "setenv", "message": "HOST=apppgc67f72.postgres.database.azure.com"}
{"type": "setenv", "message": "PORT=5432"}
{"type": "setenv", "message": "DATABASE=myappdb"}
{"type": "setenv", "message": "USER=dbadmin"}
{"type": "setenv", "message": "PASSWORD=G0IyYyWSpl7oBtAI2hyc6on8"}
```

**Injected into dependent services:**
```
POSTGRES_HOST=apppgc67f72.postgres.database.azure.com
POSTGRES_PORT=5432
POSTGRES_DATABASE=myappdb
POSTGRES_USER=dbadmin
POSTGRES_PASSWORD=G0IyYyWSpl7oBtAI2hyc6on8
POSTGRES_URL=postgresql://dbadmin:G0IyYyWSpl7oBtAI2hyc6on8@apppgc67f72.postgres.database.azure.com:5432/myappdb?sslmode=require
```

### Service Configuration

**docker-compose.yml:**
```yaml
services:
  postgres:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: apppgc67f72
        database_name: myappdb

  web:
    image: node:20-slim
    depends_on:
      - postgres
    # Environment variables automatically injected:
    # - POSTGRES_HOST
    # - POSTGRES_PORT
    # - POSTGRES_DATABASE
    # - POSTGRES_USER
    # - POSTGRES_PASSWORD
    # - POSTGRES_URL
```

**Application Usage:**
```javascript
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: false }
});
```

### Verification

Check injected environment variables:
```bash
# Inspect container environment
docker inspect dc-web-1 | grep POSTGRES

# Or from inside the container
docker exec dc-web-1 env | grep POSTGRES
```

## Down Lifecycle

### Command Execution

**Command:**
```bash
azure compose --project-name=dc down \
  --server_name=apppgc67f72 \
  --resource_group=docker-compose-rg \
  postgres
```

### Provider Execution Flow

1. **Authenticate with Azure**
   ```javascript
   const credential = new DefaultAzureCredential();
   ```

2. **Delete PostgreSQL Server** (cascades to databases)
   ```javascript
   await postgresClient.servers.beginDeleteAndWait(
     resourceGroup,
     serverName
   );
   ```

3. **Clean Up Resource Group** (optional)
   ```javascript
   // Only if no other resources exist
   await resourceClient.resourceGroups.beginDeleteAndWait(resourceGroup);
   ```

4. **Send Completion Messages**
   ```javascript
   sendMessage('info', 'Resources deprovisioned successfully');
   ```

### User Execution

```bash
# Stop and remove all services
docker compose down

# Remove provider-managed resources
docker compose down --volumes
```

**Output:**
```
[+] Running 3/3
 ✔ Container dc-web-1     Removed                                           0.5s
 ✔ Container dc-worker-1  Removed                                           0.5s
 ✔ postgres               Removed                                          45.2s
```

## Metadata Command

### Purpose

Provides introspection capabilities for:
- IDE auto-completion
- Documentation generation
- Parameter validation
- User interface generation

### Command

```bash
docker-azure compose metadata
```

### Response Structure

```json
{
  "description": "Manage Azure services (PostgreSQL, MySQL, etc.)",
  "up": {
    "parameters": [
      {
        "name": "resource",
        "description": "Azure resource type (postgres, mysql)",
        "required": true,
        "type": "string",
        "enum": "postgres"
      },
      {
        "name": "server_name",
        "description": "Globally unique server name",
        "required": true,
        "type": "string"
      },
      {
        "name": "database_name",
        "description": "Name of the database to create",
        "required": false,
        "type": "string",
        "default": "defaultdb"
      },
      {
        "name": "location",
        "description": "Azure region (e.g., eastus, westus2)",
        "required": false,
        "type": "string",
        "default": "eastus"
      },
      {
        "name": "sku",
        "description": "Pricing tier (e.g., Standard_B1ms)",
        "required": false,
        "type": "string",
        "default": "Standard_B1ms"
      },
      {
        "name": "storage_mb",
        "description": "Storage size in megabytes",
        "required": false,
        "type": "integer",
        "default": "32768"
      }
    ]
  },
  "down": {
    "parameters": [
      {
        "name": "server_name",
        "description": "Name of the server to delete",
        "required": true,
        "type": "string"
      },
      {
        "name": "resource_group",
        "description": "Azure resource group name",
        "required": false,
        "type": "string",
        "default": "docker-compose-rg"
      }
    ]
  }
}
```

## Complete Flow Diagram

### Full Lifecycle

```mermaid
sequenceDiagram
    actor User
    participant DC as Docker Compose
    participant Azure as Azure Provider Plugin
    participant AzureCloud as Azure Cloud
    participant App as Application Containers

    User->>DC: docker compose up
    
    Note over DC: Step 1: Provider Discovery
    DC->>Azure: Search for 'azure' in PATH
    Azure-->>DC: Found: /path/to/azure-provider-plugin/azure
    
    Note over DC,Azure: Step 2: Metadata Query
    DC->>Azure: azure compose metadata
    Azure-->>DC: JSON parameter definitions
    
    Note over DC: Step 3: Parse docker-compose.yml
    DC->>DC: Extract provider.options
    DC->>DC: Convert to CLI flags
    
    Note over DC,Azure: Step 4: Execute Provider Up
    DC->>Azure: azure compose --project-name=dc up<br/>--resource=postgres --server_name=apppgc67f72<br/>--database_name=myappdb postgres
    
    Note over Azure,AzureCloud: Step 5: Provider Execution
    Azure->>AzureCloud: Authenticate (DefaultAzureCredential)
    Azure-->>DC: {"type":"info", "message":"Authenticating..."}
    
    Azure->>AzureCloud: Check/Create Resource Group
    AzureCloud-->>Azure: docker-compose-rg ready
    Azure-->>DC: {"type":"info", "message":"Using resource group..."}
    
    Azure->>AzureCloud: Check if server exists
    alt Server doesn't exist
        Azure->>AzureCloud: Create PostgreSQL Server (5-10 min)
        Azure-->>DC: {"type":"info", "message":"Creating server..."}
        AzureCloud-->>Azure: Server apppgc67f72 created
    else Server exists
        Azure-->>DC: {"type":"info", "message":"Using existing server..."}
    end
    
    Azure->>AzureCloud: Configure Firewall Rules
    Azure-->>DC: {"type":"info", "message":"Configuring firewall..."}
    AzureCloud-->>Azure: Firewall configured
    
    Azure->>AzureCloud: Create Database
    Azure-->>DC: {"type":"info", "message":"Creating database..."}
    AzureCloud-->>Azure: Database myappdb created
    
    Note over Azure,DC: Step 6: Send Connection Details
    Azure-->>DC: {"type":"setenv", "message":"HOST=apppgc67f72.postgres..."}
    Azure-->>DC: {"type":"setenv", "message":"PORT=5432"}
    Azure-->>DC: {"type":"setenv", "message":"DATABASE=myappdb"}
    Azure-->>DC: {"type":"setenv", "message":"USER=dbadmin"}
    Azure-->>DC: {"type":"setenv", "message":"PASSWORD=..."}
    Azure-->>DC: {"type":"setenv", "message":"URL=postgresql://..."}
    
    Note over DC: Step 7: Inject Environment Variables
    DC->>DC: Prefix with service name:<br/>POSTGRES_HOST, POSTGRES_PORT, etc.
    
    Note over DC,App: Step 8: Start Application Containers
    DC->>App: Create dc-web-1 with env vars
    DC->>App: Create dc-worker-1 with env vars
    
    Note over App,AzureCloud: Step 9: Application Connection
    App->>AzureCloud: Connect using POSTGRES_* env vars
    AzureCloud-->>App: Connection established
    App-->>User: Application ready on port 3000
```

### Provider Execution Details

```mermaid
flowchart TD
    Start([Provider Up Command]) --> Auth[Authenticate with Azure]
    Auth --> SubCheck{AZURE_SUBSCRIPTION_ID<br/>exists?}
    SubCheck -->|No| Error1[Send error message<br/>Exit 1]
    SubCheck -->|Yes| RGCheck{Resource Group<br/>exists?}
    
    RGCheck -->|No| RGCreate[Create Resource Group]
    RGCheck -->|Yes| RGUse[Use Existing Resource Group]
    RGCreate --> ServerCheck
    RGUse --> ServerCheck
    
    ServerCheck{Server<br/>exists?}
    ServerCheck -->|Yes| ServerUse[Use Existing Server<br/>Send info message]
    ServerCheck -->|No| ServerCreate[Create PostgreSQL Server<br/>5-10 minutes<br/>Send info messages]
    
    ServerUse --> Firewall[Configure Firewall Rules]
    ServerCreate --> Firewall
    
    Firewall --> DBCheck{Database<br/>exists?}
    DBCheck -->|Yes| DBUse[Use Existing Database]
    DBCheck -->|No| DBCreate[Create Database]
    
    DBUse --> GenConn[Generate Connection Info]
    DBCreate --> GenConn
    
    GenConn --> SendEnv[Send setenv messages:<br/>HOST, PORT, DATABASE,<br/>USER, PASSWORD, URL]
    SendEnv --> Success([Exit 0])
    
    style Start fill:#e1f5ff
    style Success fill:#d4edda
    style Error1 fill:#f8d7da
    style ServerCreate fill:#fff3cd
    style GenConn fill:#d1ecf1
```

### Idempotency Guarantee

```mermaid
flowchart LR
    Start([docker compose up<br/>second time]) --> Check{Resources<br/>exist?}
    
    Check -->|Yes| Use[Use Existing Resources]
    Check -->|No| Create[Create New Resources]
    
    Use --> GetInfo[Get Connection Info]
    Create --> GetInfo
    
    GetInfo --> Same{Same env vars<br/>as first run?}
    Same -->|Yes| Inject[Inject into Containers]
    Same -->|No| Error[Configuration Error]
    
    Inject --> Success([Consistent Configuration])
    Error --> Fail([Fail - Inconsistent State])
    
    style Start fill:#e1f5ff
    style Use fill:#d4edda
    style Create fill:#fff3cd
    style Success fill:#d4edda
    style Fail fill:#f8d7da
```

### Communication Protocol Flow

```mermaid
sequenceDiagram
    participant Provider as Azure Provider
    participant Stdout as stdout (JSON)
    participant DC as Docker Compose
    participant UI as User Interface

    Note over Provider,UI: Message Types
    
    Provider->>Stdout: {"type":"info", "message":"..."}
    Stdout->>DC: Parse JSON
    DC->>UI: Display as service state
    
    Provider->>Stdout: {"type":"debug", "message":"..."}
    Stdout->>DC: Parse JSON
    DC->>UI: Show only with --verbose
    
    Provider->>Stdout: {"type":"error", "message":"..."}
    Stdout->>DC: Parse JSON
    DC->>UI: Display as failure reason
    
    Provider->>Stdout: {"type":"setenv", "message":"KEY=value"}
    Stdout->>DC: Parse JSON
    DC->>DC: Store environment variable
    DC->>UI: Environment ready
```

### Environment Variable Injection Flow

```mermaid
flowchart TB
    Provider[Azure Provider] -->|setenv messages| Parse[Docker Compose Parser]
    
    Parse --> Prefix[Add Service Name Prefix]
    
    Prefix --> Inject1[Inject into dc-web-1]
    Prefix --> Inject2[Inject into dc-worker-1]
    
    Inject1 --> App1[Application Code]
    Inject2 --> App2[Worker Code]
    
    App1 --> Env1[process.env.POSTGRES_HOST<br/>process.env.POSTGRES_PORT<br/>process.env.POSTGRES_DATABASE<br/>process.env.POSTGRES_USER<br/>process.env.POSTGRES_PASSWORD]
    
    App2 --> Env2[process.env.POSTGRES_HOST<br/>process.env.POSTGRES_PORT<br/>process.env.POSTGRES_DATABASE<br/>process.env.POSTGRES_USER<br/>process.env.POSTGRES_PASSWORD]
    
    Env1 --> Connect1[Connect to Azure PostgreSQL]
    Env2 --> Connect2[Connect to Azure PostgreSQL]
    
    style Provider fill:#e1f5ff
    style Parse fill:#fff3cd
    style Prefix fill:#d1ecf1
    style Connect1 fill:#d4edda
    style Connect2 fill:#d4edda
```

**Implementation:**
```javascript
// Check if server exists before creating
try {
  const existingServer = await postgresClient.servers.get(resourceGroup, serverName);
  sendMessage('info', `Server ${serverName} already exists, using existing server`);
  // Return connection info for existing server
} catch (error) {
  if (error.statusCode === 404) {
    // Server doesn't exist, create new one
    await postgresClient.servers.beginCreateAndWait(...);
  }
}
```

## Best Practices

### 1. Error Handling
```javascript
try {
  // Provision resources
} catch (error) {
  sendMessage('error', `Failed to provision: ${error.message}`);
  sendMessage('debug', error.stack);
  process.exit(1);
}
```

### 2. Progress Reporting
```javascript
sendMessage('info', 'Authenticating with Azure...');
sendMessage('info', 'Provisioning PostgreSQL server (this may take 5-10 minutes)...');
sendMessage('info', 'Creating database: myappdb');
sendMessage('info', 'PostgreSQL server provisioned successfully');
```

### 3. Debug Information
```javascript
sendMessage('debug', `Using subscription: ${subscriptionId}`);
sendMessage('debug', `Server configuration: ${JSON.stringify(serverConfig)}`);
sendMessage('debug', 'Provisioning completed');
```

### 4. Environment Variables
```javascript
// Always include essential connection details
Object.entries({
  HOST: host,
  PORT: port.toString(),
  DATABASE: database,
  USER: username,
  PASSWORD: password,
  URL: connectionString,
  SSL_MODE: 'require'
}).forEach(([key, value]) => {
  sendMessage('setenv', `${key}=${value}`);
});
```

## Troubleshooting

### Check Provider Discovery
```bash
# Verify provider is found
which azure
# Should output: /path/to/azure-provider-plugin/azure

# Test provider directly
docker-azure compose metadata
```

### View Debug Messages
```bash
# Run with verbose flag
docker compose --verbose up

# Check provider logs
cat azure-provider-plugin/provider-debug.log  # if logging enabled
```

### Verify Environment Variables
```bash
# Check what's injected
docker inspect dc-web-1 | grep POSTGRES

# Test from inside container
docker exec dc-web-1 env | grep POSTGRES
```

### Test Direct Connection
```bash
# Get connection details
docker inspect dc-web-1 | grep POSTGRES_PASSWORD
docker inspect dc-web-1 | grep POSTGRES_HOST

# Test with psql
docker run --rm postgres:14 psql \
  "postgresql://dbadmin:PASSWORD@HOST:5432/DATABASE?sslmode=require" \
  -c "SELECT version();"
```

## References

- [Docker Compose Extension Specification](https://github.com/docker/compose/blob/main/docs/extension.md)
- [Azure PostgreSQL Flexible Server Documentation](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/)
- [Azure SDK for JavaScript](https://learn.microsoft.com/en-us/javascript/api/overview/azure/)
- [Commander.js Documentation](https://github.com/tj/commander.js)
