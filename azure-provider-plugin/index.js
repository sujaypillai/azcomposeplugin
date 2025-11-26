#!/usr/bin/env node

/**
 * Docker Compose Azure Provider Plugin
 * 
 * This plugin implements the Docker Compose provider interface for Azure services.
 * It provisions Azure resources (PostgreSQL, MySQL, etc.) and returns connection
 * information to be injected into dependent services.
 * 
 * Usage: docker-azure <command> [options]
 */

const { Command } = require('commander');
const { DefaultAzureCredential } = require('@azure/identity');
const { PostgreSQLManagementFlexibleServerClient } = require('@azure/arm-postgresql-flexible');
const { ResourceManagementClient } = require('@azure/arm-resources');
const crypto = require('crypto');

const program = new Command();

/**
 * Send JSON message to Docker Compose
 * Messages are line-delimited JSON with type and message fields
 */
function sendMessage(type, message) {
  console.log(JSON.stringify({ type, message }));
}

/**
 * Generate a secure random password
 */
function generatePassword(length = 24) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  
  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }
  
  // Ensure password meets Azure requirements
  if (!/[A-Z]/.test(password)) password = 'A' + password.slice(1);
  if (!/[a-z]/.test(password)) password = password.slice(0, -1) + 'a';
  if (!/[0-9]/.test(password)) password = password.slice(0, -1) + '1';
  
  return password;
}

/**
 * Azure PostgreSQL Provider
 */
class AzurePostgresProvider {
  constructor(subscriptionId) {
    this.subscriptionId = subscriptionId;
    this.credential = new DefaultAzureCredential();
    this.postgresClient = new PostgreSQLManagementFlexibleServerClient(this.credential, subscriptionId);
    this.resourceClient = new ResourceManagementClient(this.credential, subscriptionId);
  }

  /**
   * Provision a PostgreSQL Flexible Server
   */
  async provision(options) {
    const {
      server_name,
      database_name = 'defaultdb',
      resource_group = process.env.AZURE_RESOURCE_GROUP || 'docker-compose-rg',
      location = process.env.AZURE_LOCATION || 'eastus',
      sku = 'Standard_B1ms',
      storage_mb = 32768,
      backup_retention_days = 7,
      geo_redundant_backup = false,
      admin_username = 'dbadmin',
      version = '14'
    } = options;

    sendMessage('debug', `Provisioning PostgreSQL server: ${server_name}`);
    
    // Ensure resource group exists
    await this.ensureResourceGroup(resource_group, location);
    
    // Generate admin password
    const adminPassword = generatePassword();
    
    // Create server parameters
    const serverParameters = {
      location: location,
      sku: {
        name: sku,
        tier: sku.startsWith('Standard_B') ? 'Burstable' : 'GeneralPurpose'
      },
      storage: {
        storageSizeGB: Math.ceil(storage_mb / 1024)
      },
      backup: {
        backupRetentionDays: backup_retention_days,
        geoRedundantBackup: geo_redundant_backup ? 'Enabled' : 'Disabled'
      },
      version: version,
      administratorLogin: admin_username,
      administratorLoginPassword: adminPassword,
      highAvailability: {
        mode: 'Disabled'
      }
    };

    try {
      // Check if server already exists
      let server;
      try {
        server = await this.postgresClient.servers.get(resource_group, server_name);
        sendMessage('info', `Server ${server_name} already exists, using existing server`);
      } catch (error) {
        if (error.statusCode === 404) {
          // Server doesn't exist, create it
          sendMessage('info', `Creating PostgreSQL server (this may take 5-10 minutes)...`);
          const poller = await this.postgresClient.servers.beginCreateAndWait(
            resource_group,
            server_name,
            serverParameters
          );
          server = poller;
          sendMessage('info', `Server created successfully`);
        } else {
          throw error;
        }
      }

      // Create firewall rule to allow Azure services
      sendMessage('debug', `Configuring firewall rules...`);
      await this.postgresClient.firewallRules.beginCreateOrUpdateAndWait(
        resource_group,
        server_name,
        'AllowAllAzureIps',
        {
          startIpAddress: '0.0.0.0',
          endIpAddress: '0.0.0.0'
        }
      );

      // Allow all IPs for development (remove in production)
      await this.postgresClient.firewallRules.beginCreateOrUpdateAndWait(
        resource_group,
        server_name,
        'AllowAll',
        {
          startIpAddress: '0.0.0.0',
          endIpAddress: '255.255.255.255'
        }
      );

      // Create database
      sendMessage('info', `Creating database: ${database_name}`);
      try {
        await this.postgresClient.databases.beginCreateAndWait(
          resource_group,
          server_name,
          database_name,
          {
            charset: 'UTF8',
            collation: 'en_US.utf8'
          }
        );
      } catch (error) {
        if (error.statusCode !== 409) { // Ignore if database already exists
          throw error;
        }
      }

      // Return connection information
      const host = `${server_name}.postgres.database.azure.com`;
      const port = 5432;
      const connectionString = `postgresql://${admin_username}:${adminPassword}@${host}:${port}/${database_name}?sslmode=require`;

      return {
        HOST: host,
        PORT: port.toString(),
        DATABASE: database_name,
        USER: admin_username,
        PASSWORD: adminPassword,
        URL: connectionString,
        SSL_MODE: 'require'
      };
    } catch (error) {
      sendMessage('error', `Error provisioning PostgreSQL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ensure resource group exists
   */
  async ensureResourceGroup(resourceGroup, location) {
    try {
      await this.resourceClient.resourceGroups.get(resourceGroup);
      sendMessage('debug', `Using existing resource group: ${resourceGroup}`);
    } catch (error) {
      if (error.statusCode === 404) {
        sendMessage('info', `Creating resource group: ${resourceGroup}`);
        await this.resourceClient.resourceGroups.createOrUpdate(resourceGroup, {
          location: location,
          tags: {
            managed_by: 'docker-compose',
            created_at: new Date().toISOString()
          }
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Deprovision (cleanup) resources
   */
  async deprovision(options) {
    const {
      server_name,
      resource_group = process.env.AZURE_RESOURCE_GROUP || 'docker-compose-rg'
    } = options;

    sendMessage('info', `Deprovisioning PostgreSQL server: ${server_name}`);
    
    try {
      await this.postgresClient.servers.beginDeleteAndWait(resource_group, server_name);
      sendMessage('info', `Server deleted successfully`);
    } catch (error) {
      sendMessage('error', `Error deprovisioning: ${error.message}`);
      throw error;
    }
  }
}



/**
 * Send JSON message to Docker Compose
 */
function sendMessage(type, message) {
  console.log(JSON.stringify({ type, message }));
}

/**
 * Handle compose up command
 */
async function handleUp(serviceName, options) {
  try {
    sendMessage('debug', `Starting provisioning for service: ${serviceName}`);
    
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    if (!subscriptionId) {
      sendMessage('error', 'AZURE_SUBSCRIPTION_ID environment variable is required');
      process.exit(1);
    }

    const resource = options.resource || options.type || 'postgres';
    
    if (resource !== 'postgres') {
      sendMessage('error', `Unsupported resource type: ${resource}. Currently only 'postgres' is supported.`);
      process.exit(1);
    }

    // Convert string parameters to proper types
    const provisionOptions = {
      ...options,
      storage_mb: parseInt(options.storage_mb) || 32768,
      backup_retention_days: parseInt(options.backup_retention_days) || 7,
      geo_redundant_backup: options.geo_redundant_backup === 'true' || options.geo_redundant_backup === true
    };

    sendMessage('info', 'Authenticating with Azure...');
    const provider = new AzurePostgresProvider(subscriptionId);
    
    sendMessage('info', 'Provisioning PostgreSQL server (this may take 5-10 minutes)...');
    const connectionInfo = await provider.provision(provisionOptions);

    sendMessage('info', 'PostgreSQL server provisioned successfully');
    
    // Send environment variables using setenv messages
    Object.entries(connectionInfo).forEach(([key, value]) => {
      sendMessage('setenv', `${key}=${value}`);
    });

    sendMessage('debug', 'Provisioning completed');
    process.exit(0);
  } catch (error) {
    sendMessage('error', `Failed to provision: ${error.message}`);
    sendMessage('debug', error.stack);
    process.exit(1);
  }
}

/**
 * Handle compose down command
 */
async function handleDown(serviceName, options) {
  try {
    sendMessage('debug', `Starting deprovisioning for service: ${serviceName}`);
    
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    if (!subscriptionId) {
      sendMessage('error', 'AZURE_SUBSCRIPTION_ID environment variable is required');
      process.exit(1);
    }

    sendMessage('info', 'Deprovisioning Azure resources...');
    const provider = new AzurePostgresProvider(subscriptionId);
    await provider.deprovision(options);

    sendMessage('info', 'Resources deprovisioned successfully');
    process.exit(0);
  } catch (error) {
    sendMessage('error', `Failed to deprovision: ${error.message}`);
    sendMessage('debug', error.stack);
    process.exit(1);
  }
}

/**
 * Handle metadata command
 */
function handleMetadata() {
  const metadata = {
    description: "Manage Azure services (PostgreSQL, MySQL, etc.)",
    up: {
      parameters: [
        {
          name: "resource",
          description: "Azure resource type (postgres, mysql)",
          required: true,
          type: "string",
          enum: "postgres"
        },
        {
          name: "server_name",
          description: "Globally unique server name",
          required: true,
          type: "string"
        },
        {
          name: "database_name",
          description: "Name of the database to create",
          required: false,
          type: "string",
          default: "defaultdb"
        },
        {
          name: "resource_group",
          description: "Azure resource group name",
          required: false,
          type: "string",
          default: "docker-compose-rg"
        },
        {
          name: "location",
          description: "Azure region (e.g., eastus, westus2)",
          required: false,
          type: "string",
          default: "eastus"
        },
        {
          name: "sku",
          description: "Pricing tier (e.g., Standard_B1ms, Standard_D2s_v3)",
          required: false,
          type: "string",
          default: "Standard_B1ms"
        },
        {
          name: "storage_mb",
          description: "Storage size in megabytes",
          required: false,
          type: "integer",
          default: "32768"
        },
        {
          name: "backup_retention_days",
          description: "Number of days to retain backups",
          required: false,
          type: "integer",
          default: "7"
        },
        {
          name: "geo_redundant_backup",
          description: "Enable geo-redundant backups",
          required: false,
          type: "boolean",
          default: "false"
        },
        {
          name: "admin_username",
          description: "Administrator username",
          required: false,
          type: "string",
          default: "dbadmin"
        },
        {
          name: "version",
          description: "PostgreSQL version",
          required: false,
          type: "string",
          default: "14"
        }
      ]
    },
    down: {
      parameters: [
        {
          name: "server_name",
          description: "Name of the server to delete",
          required: true,
          type: "string"
        },
        {
          name: "resource_group",
          description: "Azure resource group name",
          required: false,
          type: "string",
          default: "docker-compose-rg"
        }
      ]
    }
  };

  console.log(JSON.stringify(metadata, null, 2));
  process.exit(0);
}

// CLI Commands
program
  .name('docker-azure')
  .description('Docker Compose provider plugin for Azure services')
  .version('1.0.0');

// Compose command (can be hidden)
const composeCmd = program
  .command('compose')
  .description('Compose provider commands')
  .allowUnknownOption();  // Allow Docker Compose to pass unknown options

composeCmd
  .command('up <service-name>')
  .description('Provision an Azure resource')
  .allowUnknownOption()  // Allow unknown options like --project-name
  .option('--project-name <name>', 'Compose project name')
  .option('--resource <type>', 'Resource type (postgres, mysql)', 'postgres')
  .option('--type <type>', 'Alias for --resource')
  .option('--server_name <name>', 'Server name (required)')
  .option('--database_name <name>', 'Database name', 'defaultdb')
  .option('--resource_group <name>', 'Resource group', process.env.AZURE_RESOURCE_GROUP || 'docker-compose-rg')
  .option('--location <region>', 'Azure region', process.env.AZURE_LOCATION || 'eastus')
  .option('--sku <tier>', 'Pricing tier', 'Standard_B1ms')
  .option('--storage_mb <size>', 'Storage size in MB', '32768')
  .option('--backup_retention_days <days>', 'Backup retention days', '7')
  .option('--geo_redundant_backup <bool>', 'Geo-redundant backup', 'false')
  .option('--admin_username <username>', 'Admin username', 'dbadmin')
  .option('--version <version>', 'PostgreSQL version', '14')
  .action(handleUp);

composeCmd
  .command('down <service-name>')
  .description('Deprovision an Azure resource')
  .allowUnknownOption()  // Allow unknown options
  .option('--project-name <name>', 'Compose project name')
  .option('--server_name <name>', 'Server name (required)')
  .option('--resource_group <name>', 'Resource group', process.env.AZURE_RESOURCE_GROUP || 'docker-compose-rg')
  .action(handleDown);

composeCmd
  .command('metadata')
  .description('Get provider metadata')
  .action(handleMetadata);

program
  .command('metadata')
  .description('Get provider metadata (for direct calls)')
  .action(handleMetadata);

// Preprocess arguments to handle Docker Compose's option format
// Docker Compose sends: compose --project-name=dc up --option=value service
// Commander expects: compose up --project-name=dc --option=value service
function preprocessArgs(args) {
  // Find the command index (up, down, metadata)
  const commands = ['up', 'down', 'metadata'];
  let commandIndex = -1;
  
  for (let i = 0; i < args.length; i++) {
    if (commands.includes(args[i])) {
      commandIndex = i;
      break;
    }
  }
  
  if (commandIndex === -1) return args;  // No command found, return as-is
  
  // Split into: [before command] + [command] + [after command]
  const before = args.slice(0, commandIndex);
  const command = args[commandIndex];
  const after = args.slice(commandIndex + 1);
  
  // Filter out compose-level options (like --project-name)
  const composeLevelOptions = before.filter(arg => !arg.startsWith('--project-name'));
  
  // Return: [compose-level] + [command] + [all options] + [after]
  return [...composeLevelOptions, command, ...after];
}

// Parse arguments
const processedArgs = preprocessArgs(process.argv.slice(2));
program.parse([process.argv[0], process.argv[1], ...processedArgs]);

// If no command is provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
