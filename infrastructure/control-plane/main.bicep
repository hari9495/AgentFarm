// AgentFarm Control-Plane Infrastructure
// Deploys shared resources: PostgreSQL, Redis, Container Registry, Key Vault, Log Analytics
// Target: single Azure resource group (agentfarm-control)
// Usage:
//   az group create -n agentfarm-control -l eastus
//   az deployment group create -g agentfarm-control -f infrastructure/control-plane/main.bicep \
//     -p environmentName=prod adminPassword=<secret>

@description('Environment name prefix for all resources')
param environmentName string = 'agentfarm'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('PostgreSQL admin username')
param dbAdminUser string = 'agentfarm_admin'

@description('PostgreSQL admin password — pass via Key Vault reference or parameter override, never hardcode')
@secure()
param adminPassword string

@description('Container Registry SKU')
@allowed(['Basic', 'Standard', 'Premium'])
param acrSku string = 'Basic'

@description('Log retention in days')
@minValue(30)
@maxValue(730)
param logRetentionDays int = 90

var prefix = toLower(environmentName)
var postgresServerName = '${prefix}-pg'
var redisCacheName = '${prefix}-redis'
var acrName = replace('${prefix}acr', '-', '')
var keyVaultName = '${prefix}-kv'
var logWorkspaceName = '${prefix}-logs'
var appInsightsName = '${prefix}-ai'

// ── Log Analytics Workspace ──────────────────────────────────────────────────

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logWorkspaceName
  location: location
  properties: {
    retentionInDays: logRetentionDays
    sku: {
      name: 'PerGB2018'
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// ── Application Insights ─────────────────────────────────────────────────────

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logWorkspace.id
    RetentionInDays: logRetentionDays
    IngestionMode: 'LogAnalytics'
  }
}

// ── Key Vault ────────────────────────────────────────────────────────────────

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource kvDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'kv-diagnostics'
  scope: keyVault
  properties: {
    workspaceId: logWorkspace.id
    logs: [
      {
        categoryGroup: 'audit'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// ── Container Registry ───────────────────────────────────────────────────────

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: acrSku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

resource acrDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'acr-diagnostics'
  scope: containerRegistry
  properties: {
    workspaceId: logWorkspace.id
    logs: [
      {
        categoryGroup: 'audit'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// ── Azure Cache for Redis ─────────────────────────────────────────────────────

resource redisCache 'Microsoft.Cache/redis@2024-03-01' = {
  name: redisCacheName
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisConfiguration: {
      'maxmemory-policy': 'allkeys-lru'
    }
  }
}

// ── Azure Database for PostgreSQL Flexible Server ─────────────────────────────

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgresServer
  name: 'agentfarm'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource postgresFirewallAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource pgDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'pg-diagnostics'
  scope: postgresServer
  properties: {
    workspaceId: logWorkspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: false
          days: 0
        }
      }
    ]
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output redisHostName string = redisCache.properties.hostName
output acrLoginServer string = containerRegistry.properties.loginServer
output keyVaultUri string = keyVault.properties.vaultUri
output logWorkspaceId string = logWorkspace.id
output appInsightsConnectionString string = appInsights.properties.ConnectionString
