// AgentFarm Runtime-Plane Infrastructure — Per-Tenant VM Template
// Deploys a single isolated runtime container host for one tenant bot
// Each tenant gets its own resource group (agentfarm-rt-<tenantId>)
// Usage:
//   az group create -n agentfarm-rt-<tenantId> -l eastus
//   az deployment group create -g agentfarm-rt-<tenantId> -f infrastructure/runtime-plane/main.bicep \
//     -p tenantId=<tenantId> botId=<botId> adminPassword=<secret> \
//        acrLoginServer=<acrLoginServer> keyVaultUri=<kvUri>

@description('Tenant identifier — used to scope and name all resources')
param tenantId string

@description('Bot identifier — used in VM name and managed identity')
param botId string

@description('Azure region')
param location string = resourceGroup().location

@description('VM admin username (SSH key auth is preferred for production)')
param vmAdminUser string = 'agentfarm'

@description('VM admin password — use SSH keys in production; this supports cloud-init bootstrapping only')
@secure()
param adminPassword string

@description('ACR login server from control-plane outputs')
param acrLoginServer string

@description('Key Vault URI from control-plane outputs for secret references')
param keyVaultUri string

@description('Control-plane Log Analytics workspace resource ID')
param logWorkspaceId string = ''

@description('Agent Runtime Docker image tag')
param agentImageTag string = 'latest'

@description('VM size — Standard_B2s is minimum viable for agent container')
param vmSize string = 'Standard_B2s'

var sanitizedTenant = replace(take(toLower(tenantId), 12), '-', '')
var sanitizedBot = replace(take(toLower(botId), 8), '-', '')
var resourcePrefix = '${sanitizedTenant}-${sanitizedBot}'

var vnetName = '${resourcePrefix}-vnet'
var subnetName = 'runtime'
var nsgName = '${resourcePrefix}-nsg'
var nicName = '${resourcePrefix}-nic'
var vmName = '${resourcePrefix}-vm'
var identityName = '${resourcePrefix}-id'
var diskName = '${resourcePrefix}-osdisk'

// ── Managed Identity ──────────────────────────────────────────────────────────

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

// ── Network Security Group ────────────────────────────────────────────────────
// Only allow outbound HTTPS (443) and deny all inbound except health probe from load balancer

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-01-01' = {
  name: nsgName
  location: location
  properties: {
    securityRules: [
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4000
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowAzureLoadBalancerInbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: 'AzureLoadBalancer'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'AllowOutboundHTTPS'
        properties: {
          priority: 100
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
      {
        name: 'DenyAllOutbound'
        properties: {
          priority: 4000
          direction: 'Outbound'
          access: 'Deny'
          protocol: '*'
          sourcePortRange: '*'
          destinationPortRange: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
        }
      }
    ]
  }
}

// ── Virtual Network ───────────────────────────────────────────────────────────

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: ['10.0.0.0/24']
    }
    subnets: [
      {
        name: subnetName
        properties: {
          addressPrefix: '10.0.0.0/24'
          networkSecurityGroup: {
            id: nsg.id
          }
          privateEndpointNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

// ── Network Interface ─────────────────────────────────────────────────────────

resource nic 'Microsoft.Network/networkInterfaces@2024-01-01' = {
  name: nicName
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: '${vnet.id}/subnets/${subnetName}'
          }
          privateIPAllocationMethod: 'Dynamic'
        }
      }
    ]
    enableAcceleratedNetworking: false
  }
}

// ── Cloud-Init Bootstrap Script ───────────────────────────────────────────────
// Pulls agent-runtime image from ACR, configures systemd service, starts container

var cloudInitScript = '''
#cloud-config
package_update: true
packages:
  - docker.io
  - curl
  - jq
runcmd:
  - systemctl enable docker
  - systemctl start docker
  - |
    cat > /etc/systemd/system/agentfarm-runtime.service << 'UNIT'
    [Unit]
    Description=AgentFarm Agent Runtime
    After=docker.service
    Requires=docker.service

    [Service]
    Restart=always
    RestartSec=10
    ExecStartPre=-/usr/bin/docker stop agentfarm-runtime
    ExecStartPre=-/usr/bin/docker rm agentfarm-runtime
    ExecStart=/usr/bin/docker run --name agentfarm-runtime \
      --env AF_TENANT_ID=${TENANT_ID} \
      --env AF_BOT_ID=${BOT_ID} \
      --env AF_KV_URI=${KV_URI} \
      -p 127.0.0.1:8080:8080 \
      --restart unless-stopped \
      ${ACR_SERVER}/agentfarm/agent-runtime:${IMAGE_TAG}
    ExecStop=/usr/bin/docker stop agentfarm-runtime

    [Install]
    WantedBy=multi-user.target
    UNIT
  - |
    cat > /etc/agentfarm.env << ENVFILE
    TENANT_ID=${TENANT_ID}
    BOT_ID=${BOT_ID}
    KV_URI=${KV_URI}
    ACR_SERVER=${ACR_SERVER}
    IMAGE_TAG=${IMAGE_TAG}
    ENVFILE
  - systemctl daemon-reload
  - systemctl enable agentfarm-runtime
  - systemctl start agentfarm-runtime
'''

var cloudInitEncoded = base64(replace(
  replace(replace(replace(cloudInitScript, '${TENANT_ID}', tenantId), '${BOT_ID}', botId), '${KV_URI}', keyVaultUri),
  '${ACR_SERVER}',
  acrLoginServer
))

// ── Virtual Machine ───────────────────────────────────────────────────────────

resource vm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: vmName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    storageProfile: {
      osDisk: {
        name: diskName
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'StandardSSD_LRS'
        }
        diskSizeGB: 64
        deleteOption: 'Delete'
      }
      imageReference: {
        publisher: 'canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
    }
    osProfile: {
      computerName: take(vmName, 15)
      adminUsername: vmAdminUser
      adminPassword: adminPassword
      customData: cloudInitEncoded
      linuxConfiguration: {
        disablePasswordAuthentication: false
        provisionVMAgent: true
        patchSettings: {
          patchMode: 'AutomaticByPlatform'
          assessmentMode: 'AutomaticByPlatform'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
          properties: {
            primary: true
            deleteOption: 'Delete'
          }
        }
      ]
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
}

// ── VM Diagnostics (if Log Analytics workspace provided) ──────────────────────

resource vmDiagExtension 'Microsoft.Compute/virtualMachines/extensions@2024-03-01' = if (!empty(logWorkspaceId)) {
  parent: vm
  name: 'AzureMonitorLinuxAgent'
  location: location
  properties: {
    publisher: 'Microsoft.Azure.Monitor'
    type: 'AzureMonitorLinuxAgent'
    typeHandlerVersion: '1.0'
    autoUpgradeMinorVersion: true
    enableAutomaticUpgrade: true
  }
}

// ── Auto-shutdown (cost control) ─────────────────────────────────────────────

resource autoShutdown 'Microsoft.DevTestLab/schedules@2018-09-15' = {
  name: 'shutdown-computevm-${vmName}'
  location: location
  properties: {
    status: 'Disabled'
    taskType: 'ComputeVmShutdownTask'
    dailyRecurrence: {
      time: '0200'
    }
    timeZoneId: 'UTC'
    targetResourceId: vm.id
    notificationSettings: {
      status: 'Disabled'
    }
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output vmId string = vm.id
output vmName string = vm.name
output managedIdentityClientId string = managedIdentity.properties.clientId
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output privateIpAddress string = nic.properties.ipConfigurations[0].properties.privateIPAddress
