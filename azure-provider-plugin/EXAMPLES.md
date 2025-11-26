# Complete Working Example

This is a complete, tested example showing the Azure provider plugin in action.

## Prerequisites

```bash
# 1. Install the plugin
cd azure-provider-plugin
./install.sh

# 2. Configure Azure
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
az login

# 3. Verify installation
docker-azure metadata
```

## Example 1: Simple Node.js App with PostgreSQL

### Project Structure
```
my-app/
├── docker-compose.yml
├── app/
│   ├── package.json
│   ├── index.js
│   └── Dockerfile
```

### docker-compose.yml
```yaml
services:
  # Azure PostgreSQL managed by provider
  database:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: ${USER}-demo-postgres
        database_name: demo
        sku: Standard_B1ms
        storage_mb: 32768
        version: "14"

  # Node.js application
  web:
    build: ./app
    ports:
      - "3000:3000"
    depends_on:
      - database
    environment:
      NODE_ENV: production
    # These are automatically injected by the provider:
    # DATABASE_HOST
    # DATABASE_PORT
    # DATABASE_DATABASE
    # DATABASE_USER
    # DATABASE_PASSWORD
    # DATABASE_URL
    
    # Alternative: Use pre-built image if build fails
    # image: node:20-slim
    # working_dir: /app
    # volumes:
    #   - ./app:/app
    # command: sh -c "npm install && npm start"
```

### app/package.json
```json
{
  "name": "demo-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}
```

### app/index.js
```javascript
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = 3000;

// Connect using environment variables injected by provider
const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  database: process.env.DATABASE_DATABASE,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

// Or use the URL directly:
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: { rejectUnauthorized: false }
// });

// Initialize database
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Database initialized');
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Hello from Azure PostgreSQL Provider!',
    database: process.env.DATABASE_HOST
  });
});

app.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/users', express.json(), async (req, res) => {
  try {
    const { name, email } = req.body;
    const result = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy' });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// Start server
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  console.log('Connected to:', process.env.DATABASE_HOST);
  await initDB();
});
```

### app/Dockerfile
```dockerfile
# Use node:20-slim for better reliability
# alpine images may have slower pull times
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

## Running the Example

### Step 1: Start the application
```bash
docker compose up
```

**Expected output:**
```
[+] Running database
 ⠿ database Provisioning... (this may take 5-10 minutes)
{"type":"info","message":"Authenticating with Azure..."}
{"type":"info","message":"Creating resource group: docker-compose-rg"}
{"type":"info","message":"Provisioning PostgreSQL server..."}
{"type":"info","message":"Configuring firewall rules..."}
{"type":"info","message":"Creating database: demo"}
{"type":"info","message":"PostgreSQL server provisioned successfully"}
[+] Running web
 ⠿ web Built
 ⠿ web Started
```

### Step 2: Test the application
```bash
# Health check
curl http://localhost:3000/health
# {"status":"healthy"}

# Get users
curl http://localhost:3000/users
# []

# Create user
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
# {"id":1,"name":"John Doe","email":"john@example.com","created_at":"..."}

# Get users again
curl http://localhost:3000/users
# [{"id":1,"name":"John Doe","email":"john@example.com","created_at":"..."}]
```

### Step 3: Check environment variables
```bash
docker compose exec web env | grep DATABASE_
```

**Expected output:**
```
DATABASE_HOST=user-demo-postgres.postgres.database.azure.com
DATABASE_PORT=5432
DATABASE_DATABASE=demo
DATABASE_USER=dbadmin
DATABASE_PASSWORD=<generated-password>
DATABASE_URL=postgresql://dbadmin:password@host:5432/demo?sslmode=require
DATABASE_SSL_MODE=require
```

### Step 4: Stop the application
```bash
docker compose down
```

## Example 2: Multiple Services with Shared Database

### docker-compose.yml
```yaml
services:
  database:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: ${USER}-shared-db
        database_name: shared

  api:
    image: node:20-slim
    depends_on:
      - database
    ports:
      - "3000:3000"
    working_dir: /app
    volumes:
      - ./api:/app
    command: sh -c "npm install && npm start"
    # Receives DATABASE_* variables

  worker:
    image: node:20-slim
    depends_on:
      - database
    working_dir: /app
    volumes:
      - ./worker:/app
    command: sh -c "npm install && npm start"
    # Also receives DATABASE_* variables

  admin:
    image: node:20-slim
    depends_on:
      - database
    ports:
      - "4000:4000"
    working_dir: /app
    volumes:
      - ./admin:/app
    command: sh -c "npm install && npm start"
    # Also receives DATABASE_* variables
```

All three services (api, worker, admin) automatically receive the same database credentials!

## Example 3: Development vs Production

### docker-compose.yml (Development)
```yaml
services:
  database:
    provider:
      type: azure
      options:
        resource: postgres
        server_name: ${USER}-dev-db
        database_name: myapp_dev
        sku: Standard_B1ms  # Small/cheap for dev
        storage_mb: 32768

  app:
    build: .
    depends_on:
      - database
```

### docker-compose.prod.yml (Production Override)
```yaml
services:
  database:
    provider:
      type: azure
      options:
        server_name: myapp-prod-db
        database_name: myapp_prod
        sku: Standard_D4s_v3  # Larger for production
        storage_mb: 131072
        backup_retention_days: 30
        geo_redundant_backup: true
```

**Usage:**
```bash
# Development
docker compose up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up
```

## Example 4: Manual Testing (Without Docker Compose)

You can also test the plugin directly:

```bash
# Provision a database
docker-azure compose up testdb \
  --project-name manual-test \
  --resource postgres \
  --server_name ${USER}-manual-test \
  --database_name testdb \
  --sku Standard_B1ms

# Expected output:
# {"type":"info","message":"Authenticating with Azure..."}
# {"type":"info","message":"Provisioning PostgreSQL server..."}
# {"type":"setenv","message":"HOST=user-manual-test.postgres.database.azure.com"}
# {"type":"setenv","message":"PASSWORD=..."}
# ...

# Clean up
docker-azure compose down testdb \
  --server_name ${USER}-manual-test \
  --resource_group docker-compose-rg
```

## Troubleshooting

### Issue: Docker image pull timeout

**Error:** `unable to get image 'node:18-alpine': Error response from daemon: Failed to serve the request due to timeout 3m0s`

**Solutions:**

1. **Use a different base image:**
   ```yaml
   # Instead of alpine, use slim
   image: node:20-slim
   # Or use debian-based
   image: node:20
   ```

2. **Pre-pull the image:**
   ```bash
   docker pull node:20-slim
   # Then run compose
   docker compose up
   ```

3. **Increase Docker timeout:**
   ```bash
   # Edit Docker daemon config
   # macOS: Docker Desktop > Settings > Docker Engine
   # Add or modify:
   {
     "max-concurrent-downloads": 3,
     "max-download-attempts": 5
   }
   ```

4. **Check Docker Hub status:**
   ```bash
   # Test connectivity
   curl -I https://hub.docker.com
   
   # Try alternative registry
   docker pull ghcr.io/node:20-slim
   ```

5. **Use local build instead:**
   ```yaml
   web:
     build:
       context: ./app
       dockerfile: Dockerfile
   ```

6. **Restart Docker daemon:**
   ```bash
   # macOS
   # Quit and restart Docker Desktop
   
   # Linux
   sudo systemctl restart docker
   ```

### Issue: "AZURE_SUBSCRIPTION_ID not set"
```bash
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
# Get your subscription ID:
az account show --query id -o tsv
```

### Issue: "Authentication failed"
```bash
az login
# Or for service principal:
export AZURE_TENANT_ID="..."
export AZURE_CLIENT_ID="..."
export AZURE_CLIENT_SECRET="..."
```

### Issue: "Server name already exists"
Each server name must be globally unique. Use a prefix:
```yaml
server_name: ${USER}-myapp-postgres  # Unique per user
```

### Issue: Connection timeout
Check firewall rules in Azure Portal or:
```bash
az postgres flexible-server firewall-rule list \
  --resource-group docker-compose-rg \
  --name your-server-name
```

## Cleanup

### Remove all resources
```bash
# Delete the resource group (removes all servers)
az group delete --name docker-compose-rg --yes

# Or delete specific server
az postgres flexible-server delete \
  --name your-server-name \
  --resource-group docker-compose-rg \
  --yes
```

## Cost Estimation

**Standard_B1ms (Burstable):**
- Cost: ~$12-15/month
- vCores: 1
- RAM: 2 GB
- Best for: Development, testing

**Standard_D2s_v3 (General Purpose):**
- Cost: ~$120-150/month
- vCores: 2
- RAM: 8 GB
- Best for: Small production apps

**Tip:** Stop the server when not in use to save costs:
```bash
az postgres flexible-server stop \
  --name your-server-name \
  --resource-group docker-compose-rg
```

## Next Steps

1. ✅ Install the plugin
2. ✅ Run the simple example
3. ✅ Adapt for your application
4. 🚀 Deploy to production

## Support

- Check [README.md](README.md) for detailed documentation
- Review [PROTOCOL.md](PROTOCOL.md) for protocol details
- See [QUICKSTART.md](QUICKSTART.md) for setup guide
