#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  listProjectsTool,
  listServicesTool,
  listTemplatesTool,
  getTemplateTool,
  deployTemplateTool,
  deployCompositeTemplateTool,
  listDeploymentsTool,
  getDeploymentStatusTool,
  stopDeploymentTool,
  getDeploymentLogsTool,
  listDomainsTool,
  getDnsRecordsTool,
} from './tools/cloud.js';

import {
  getUserInfoTool,
  getBillingBalanceTool,
  getUsageHistoryTool,
  getSubscriptionStatusTool,
  listPatsTool,
  createPatTool,
  listAiModelsTool,
} from './tools/auth.js';

const server = new McpServer({
  name: 'alternatefutures-cloud',
  version: '0.1.0',
});

// ---------------------------------------------------------------------------
// Cloud tools (service-cloud-api GraphQL)
// ---------------------------------------------------------------------------

server.tool(listProjectsTool.name, listProjectsTool.description, listProjectsTool.schema.shape, async () => listProjectsTool.handler());
server.tool(listServicesTool.name, listServicesTool.description, listServicesTool.schema.shape, async (args) => listServicesTool.handler(args));
server.tool(listTemplatesTool.name, listTemplatesTool.description, listTemplatesTool.schema.shape, async (args) => listTemplatesTool.handler(args));
server.tool(getTemplateTool.name, getTemplateTool.description, getTemplateTool.schema.shape, async (args) => getTemplateTool.handler(args));
server.tool(deployTemplateTool.name, deployTemplateTool.description, deployTemplateTool.schema.shape, async (args) => deployTemplateTool.handler(args));
server.tool(deployCompositeTemplateTool.name, deployCompositeTemplateTool.description, deployCompositeTemplateTool.schema.shape, async (args) => deployCompositeTemplateTool.handler(args));
server.tool(listDeploymentsTool.name, listDeploymentsTool.description, listDeploymentsTool.schema.shape, async (args) => listDeploymentsTool.handler(args));
server.tool(getDeploymentStatusTool.name, getDeploymentStatusTool.description, getDeploymentStatusTool.schema.shape, async (args) => getDeploymentStatusTool.handler(args));
server.tool(stopDeploymentTool.name, stopDeploymentTool.description, stopDeploymentTool.schema.shape, async (args) => stopDeploymentTool.handler(args));
server.tool(getDeploymentLogsTool.name, getDeploymentLogsTool.description, getDeploymentLogsTool.schema.shape, async (args) => getDeploymentLogsTool.handler(args));
server.tool(listDomainsTool.name, listDomainsTool.description, listDomainsTool.schema.shape, async (args) => listDomainsTool.handler(args));
server.tool(getDnsRecordsTool.name, getDnsRecordsTool.description, getDnsRecordsTool.schema.shape, async (args) => getDnsRecordsTool.handler(args));

// ---------------------------------------------------------------------------
// Auth tools (service-auth REST)
// ---------------------------------------------------------------------------

server.tool(getUserInfoTool.name, getUserInfoTool.description, getUserInfoTool.schema.shape, async () => getUserInfoTool.handler());
server.tool(getBillingBalanceTool.name, getBillingBalanceTool.description, getBillingBalanceTool.schema.shape, async () => getBillingBalanceTool.handler());
server.tool(getUsageHistoryTool.name, getUsageHistoryTool.description, getUsageHistoryTool.schema.shape, async (args) => getUsageHistoryTool.handler(args));
server.tool(getSubscriptionStatusTool.name, getSubscriptionStatusTool.description, getSubscriptionStatusTool.schema.shape, async () => getSubscriptionStatusTool.handler());
server.tool(listPatsTool.name, listPatsTool.description, listPatsTool.schema.shape, async () => listPatsTool.handler());
server.tool(createPatTool.name, createPatTool.description, createPatTool.schema.shape, async (args) => createPatTool.handler(args));
server.tool(listAiModelsTool.name, listAiModelsTool.description, listAiModelsTool.schema.shape, async () => listAiModelsTool.handler());

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
