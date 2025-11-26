# Docker Compose Provider Protocol

This document explains the Docker Compose Provider Protocol that this plugin implements, based on the [official Docker Compose extension documentation](https://github.com/docker/compose/blob/main/docs/extension.md).

## Overview

Provider plugins extend Docker Compose to manage platform capabilities (like managed databases, cache services, etc.) rather than just containers. When you define a provider service in your `docker-compose.yml`, Compose delegates resource management to the provider plugin.

## How Compose Discovers Providers

When Compose encounters a service with a `provider` attribute:

```yaml
services:
  database:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: myserver
```

Compose looks for the provider binary in this order:
1. **Docker CLI plugin** named `docker-<type>` (e.g., `docker-azure`)
2. **Executable** named `<type>` in user's PATH

## Required Commands

A valid provider plugin MUST implement these commands:

### 1. `compose up <service-name>`

Provisions the resource and returns connection information.

**Example invocation by Compose:**
```bash
docker-azure compose --project-name myapp up database \
  --resource postgres \
  --server_name myserver \
  --database_name mydb
```

**Plugin responsibilities:**
- Provision or verify the resource exists
- Be **idempotent** - if resource exists, return same connection info
- Send JSON messages to stdout with progress updates
- Use `setenv` messages to return connection details

**Example output:**
```json
{"type":"info","message":"Authenticating with Azure..."}
{"type":"info","message":"Provisioning PostgreSQL server..."}
{"type":"info","message":"Creating database..."}
{"type":"setenv","message":"HOST=myserver.postgres.database.azure.com"}
{"type":"setenv","message":"PORT=5432"}
{"type":"setenv","message":"USER=dbadmin"}
{"type":"setenv","message":"PASSWORD=generated-password"}
{"type":"setenv","message":"URL=postgresql://dbadmin:password@host:5432/db"}
```

### 2. `compose down <service-name>`

Deprovisions/cleans up the resource.

**Example invocation by Compose:**
```bash
docker-azure compose --project-name myapp down database \
  --server_name myserver \
  --resource_group docker-compose-rg
```

**Plugin responsibilities:**
- Release all resources associated with the service
- Use project name to identify resources if needed
- Send progress messages

### 3. `metadata` (Optional but Recommended)

Returns information about supported parameters.

**Example invocation:**
```bash
docker-azure metadata
```

**Expected output format:**
```json
{
  "description": "Manage Azure services",
  "up": {
    "parameters": [
      {
        "name": "resource",
        "description": "Resource type (postgres, mysql)",
        "required": true,
        "type": "string",
        "enum": "postgres,mysql"
      },
      {
        "name": "server_name",
        "description": "Globally unique server name",
        "required": true,
        "type": "string"
      },
      {
        "name": "database_name",
        "description": "Database name",
        "required": false,
        "type": "string",
        "default": "defaultdb"
      }
    ]
  },
  "down": {
    "parameters": [
      {
        "name": "server_name",
        "description": "Server to delete",
        "required": true,
        "type": "string"
      }
    ]
  }
}
```

## JSON Message Protocol

Providers communicate with Compose by writing **line-delimited JSON** to stdout.

### Message Format

All messages MUST be JSON objects with `type` and `message` fields:

```json
{"type": "<message-type>", "message": "<content>"}
```

### Message Types

#### `info` - Status Updates
User-visible progress messages. Compose displays these in the UI.

```json
{"type":"info","message":"Creating PostgreSQL server..."}
{"type":"info","message":"Server provisioned successfully"}
```

#### `debug` - Diagnostic Information
Detailed information for debugging. Only shown when Compose runs with `--verbose`.

```json
{"type":"debug","message":"Using resource group: docker-compose-rg"}
{"type":"debug","message":"Server already exists, skipping creation"}
```

#### `error` - Error Messages
Error details shown to users when something fails.

```json
{"type":"error","message":"Authentication failed: invalid credentials"}
{"type":"error","message":"Permission denied for resource group"}
```

#### `setenv` - Environment Variables
**Most important type** - tells Compose what environment variables to inject into dependent services.

Format: `KEY=VALUE`

```json
{"type":"setenv","message":"HOST=myserver.postgres.database.azure.com"}
{"type":"setenv","message":"PORT=5432"}
{"type":"setenv","message":"DATABASE=mydb"}
{"type":"setenv","message":"USER=admin"}
{"type":"setenv","message":"PASSWORD=secret"}
{"type":"setenv","message":"URL=postgresql://admin:secret@host:5432/mydb"}
```

## Environment Variable Injection

When a service depends on a provider service, Compose automatically:
1. Collects all `setenv` messages from the provider
2. Prefixes each variable with the service name (uppercase)
3. Injects them into dependent services

**Example:**

docker-compose.yml:
```yaml
services:
  database:
    provider:
      type: azure
      options:
        server_name: myserver

  app:
    image: myapp
    depends_on:
      - database
```

Provider output:
```json
{"type":"setenv","message":"HOST=myserver.postgres.database.azure.com"}
{"type":"setenv","message":"PORT=5432"}
{"type":"setenv","message":"PASSWORD=secret123"}
```

Environment variables injected into `app`:
```bash
DATABASE_HOST=myserver.postgres.database.azure.com
DATABASE_PORT=5432
DATABASE_PASSWORD=secret123
```

## Parameter Mapping

Compose translates `provider.options` from docker-compose.yml into command-line flags:

**docker-compose.yml:**
```yaml
database:
  provider:
    type: azure
    options:
      resource: postgres
      server_name: myserver
      database_name: mydb
      sku: Standard_B1ms
```

**Compose executes:**
```bash
docker-azure compose up database \
  --resource postgres \
  --server_name myserver \
  --database_name mydb \
  --sku Standard_B1ms
```

## Best Practices

### 1. Idempotency
The `up` command MUST be idempotent. Running it multiple times with the same parameters should:
- Check if resource already exists
- Return the same connection information
- Not fail if resource is already provisioned

### 2. Project Name Usage
Use the `--project-name` flag to tag resources:
```javascript
tags: {
  managed_by: 'docker-compose',
  project_name: options.projectName,
  created_at: new Date().toISOString()
}
```

This allows the `down` command to find and delete all project resources.

### 3. Error Handling
- Send `error` messages for user-facing errors
- Send `debug` messages for diagnostic details
- Exit with non-zero code on failure
- Always exit (don't hang)

### 4. Progress Updates
Send frequent `info` messages for long operations:
```javascript
sendMessage('info', 'Creating server (this may take 5-10 minutes)...');
// ... long operation ...
sendMessage('info', 'Server created successfully');
```

### 5. Secure Credentials
- Generate strong passwords
- Never log sensitive credentials (except via `setenv`)
- Use secure random generators

## Implementation Checklist

- [ ] Implement `compose up` command
- [ ] Implement `compose down` command
- [ ] Implement `metadata` command
- [ ] Send proper JSON messages (info, debug, error, setenv)
- [ ] Make `up` idempotent
- [ ] Handle project-name parameter
- [ ] Map all options to CLI flags
- [ ] Exit with proper codes (0 success, 1 failure)
- [ ] Write line-delimited JSON to stdout
- [ ] Validate required parameters
- [ ] Generate secure credentials
- [ ] Tag resources for cleanup

## Testing Your Provider

### Test metadata
```bash
docker-azure metadata | jq
```

### Test up (with real provisioning)
```bash
export AZURE_SUBSCRIPTION_ID="your-sub-id"
az login

docker-azure compose up testdb \
  --project-name test \
  --resource postgres \
  --server_name test-server-$(whoami) \
  --database_name testdb
```

### Test with Docker Compose
```yaml
services:
  db:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: test-server-${USER}
        database_name: testdb
  
  app:
    image: alpine
    depends_on: [db]
    command: env | grep DATABASE_
```

```bash
docker compose up
```

### Test down
```bash
docker-azure compose down testdb \
  --server_name test-server-$(whoami) \
  --resource_group docker-compose-rg
```

## References

- [Official Docker Compose Extensions Documentation](https://github.com/docker/compose/blob/main/docs/extension.md)
- [Provider Example in Go](https://github.com/docker/compose/blob/main/docs/examples/provider.go)
- [Docker Compose Provider Services Documentation](https://docs.docker.com/compose/how-tos/provider-services/)

## Example: Full Message Flow

```
User runs: docker compose up

Compose detects provider service → Executes plugin:
  docker-azure compose --project-name myapp up database --resource postgres --server_name myserver

Plugin output:
  {"type":"debug","message":"Starting provisioning for service: database"}
  {"type":"info","message":"Authenticating with Azure..."}
  {"type":"debug","message":"Using subscription: abc-123"}
  {"type":"info","message":"Creating resource group: docker-compose-rg"}
  {"type":"info","message":"Provisioning PostgreSQL server (5-10 minutes)..."}
  {"type":"info","message":"Configuring firewall rules..."}
  {"type":"info","message":"Creating database: mydb"}
  {"type":"setenv","message":"HOST=myserver.postgres.database.azure.com"}
  {"type":"setenv","message":"PORT=5432"}
  {"type":"setenv","message":"DATABASE=mydb"}
  {"type":"setenv","message":"USER=dbadmin"}
  {"type":"setenv","message":"PASSWORD=Abc123!@#xyz"}
  {"type":"setenv","message":"URL=postgresql://dbadmin:Abc123!@#xyz@myserver.postgres.database.azure.com:5432/mydb?sslmode=require"}
  {"type":"info","message":"PostgreSQL server provisioned successfully"}
  {"type":"debug","message":"Provisioning completed"}

Compose receives messages → Injects environment variables:
  DATABASE_HOST=myserver.postgres.database.azure.com
  DATABASE_PORT=5432
  DATABASE_DATABASE=mydb
  DATABASE_USER=dbadmin
  DATABASE_PASSWORD=Abc123!@#xyz
  DATABASE_URL=postgresql://...

Compose starts dependent services with injected env vars
```
