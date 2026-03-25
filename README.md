# AlternateFutures MCP Server

MCP (Model Context Protocol) server that exposes AlternateFutures platform operations — compute, deployments, auth, billing, and AI models — as tools for Cursor, Claude Desktop, and other MCP-compatible clients.

## Setup

```bash
cd mcp-cloud
pnpm install
pnpm build
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AF_PAT` | Yes | Personal Access Token (`af_live_...`) |
| `AF_ORG_ID` | Recommended | Organization ID for org-scoped operations |
| `AF_API_URL` | No | Cloud API URL (default: `https://api.alternatefutures.ai`) |
| `AF_AUTH_URL` | No | Auth API URL (default: `https://auth.alternatefutures.ai`) |

Create a PAT at **https://app.alternatefutures.ai** → Tokens.

## Client Configuration

### Cursor

Add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "alternatefutures": {
      "command": "node",
      "args": ["/path/to/AlternateFutures/mcp-cloud/dist/index.js"],
      "env": {
        "AF_PAT": "af_live_xxxxxxxxxxxx",
        "AF_ORG_ID": "your-org-id"
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "alternatefutures": {
      "command": "node",
      "args": ["/path/to/AlternateFutures/mcp-cloud/dist/index.js"],
      "env": {
        "AF_PAT": "af_live_xxxxxxxxxxxx",
        "AF_ORG_ID": "your-org-id"
      }
    }
  }
}
```

## Available Tools

### Cloud (service-cloud-api)

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects in the organization |
| `list_services` | List services in a project with deployment status |
| `list_templates` | List available deployment templates |
| `get_template` | Get template details (resources, env vars, ports) |
| `deploy_template` | Deploy a template to Akash or Phala TEE |
| `list_deployments` | List all deployments across providers |
| `get_deployment_status` | Get deployment status and cost breakdown |
| `stop_deployment` | Stop/close an Akash or Phala deployment |
| `get_deployment_logs` | Fetch container logs from a service |
| `list_domains` | List domains for the organization |
| `get_dns_records` | List DNS records for a domain zone |

### Auth & Billing (service-auth)

| Tool | Description |
|------|-------------|
| `get_user_info` | Get user profile and auth methods |
| `get_billing_balance` | Get credit wallet balance |
| `get_usage_history` | Get spend/usage history |
| `get_subscription_status` | Get subscription plan and status |
| `list_pats` | List Personal Access Tokens |
| `create_pat` | Create a new PAT |
| `list_ai_models` | List available AI inference models |

## Development

```bash
# Build and launch with MCP Inspector
pnpm dev

# Watch mode
pnpm dev:watch
```
