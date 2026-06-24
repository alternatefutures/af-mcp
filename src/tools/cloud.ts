import { z } from 'zod';
import { graphql } from '../client.js';

// ---------------------------------------------------------------------------
// list_projects
// ---------------------------------------------------------------------------

export const listProjectsTool = {
  name: 'list_projects',
  description: 'List all projects in the current organization.',
  parameters: {} as const,
  schema: z.object({}),
  async handler() {
    const data = await graphql<{
      projects: { data: Array<{ id: string; name: string; slug: string }> };
    }>(`query { projects { data { id name slug } } }`);

    const projects = data.projects.data;
    if (!projects.length) return { content: [{ type: 'text' as const, text: 'No projects found.' }] };

    const lines = projects.map(
      (p) => `- ${p.name} (id: ${p.id}, slug: ${p.slug})`,
    );
    return { content: [{ type: 'text' as const, text: `Projects (${projects.length}):\n${lines.join('\n')}` }] };
  },
};

// ---------------------------------------------------------------------------
// list_services
// ---------------------------------------------------------------------------

export const listServicesTool = {
  name: 'list_services',
  description:
    'List services (workloads) in a project. Returns name, type, slug, active deployment status.',
  parameters: { projectId: z.string().describe('Project ID') } as const,
  schema: z.object({ projectId: z.string() }),
  async handler(args: { projectId: string }) {
    const data = await graphql<{
      serviceRegistry: Array<{
        id: string;
        name: string;
        type: string;
        slug: string;
        templateId: string | null;
        activeAkashDeployment: { id: string; status: string } | null;
        activePhalaDeployment: { id: string; status: string } | null;
      }>;
    }>(
      `query ($projectId: ID) {
        serviceRegistry(projectId: $projectId) {
          id name type slug templateId
          activeAkashDeployment { id status }
          activePhalaDeployment { id status }
        }
      }`,
      { projectId: args.projectId },
    );

    const svcs = data.serviceRegistry;
    if (!svcs.length) return { content: [{ type: 'text' as const, text: 'No services found for this project.' }] };

    const lines = svcs.map((s) => {
      const akash = s.activeAkashDeployment;
      const phala = s.activePhalaDeployment;
      const status = akash
        ? `Akash: ${akash.status}`
        : phala
          ? `Phala: ${phala.status}`
          : 'No active deployment';
      return `- ${s.name} [${s.type}] slug=${s.slug} | ${status}`;
    });

    return { content: [{ type: 'text' as const, text: `Services (${svcs.length}):\n${lines.join('\n')}` }] };
  },
};

// ---------------------------------------------------------------------------
// list_templates / get_template
// ---------------------------------------------------------------------------

export const listTemplatesTool = {
  name: 'list_templates',
  description:
    'List available deployment templates. Optionally filter by category (AI_ML, DATABASE, DEVTOOLS, WEB_SERVER, GAME_SERVER).',
  parameters: {
    category: z
      .string()
      .optional()
      .describe('Template category filter (e.g. AI_ML, DATABASE)'),
  } as const,
  schema: z.object({ category: z.string().optional() }),
  async handler(args: { category?: string }) {
    const data = await graphql<{
      templates: Array<{
        id: string;
        name: string;
        category: string;
        description: string;
      }>;
    }>(
      `query ($category: TemplateCategory) {
        templates(category: $category) { id name category description }
      }`,
      args.category ? { category: args.category } : {},
    );

    const templates = data.templates;
    if (!templates.length) return { content: [{ type: 'text' as const, text: 'No templates found.' }] };

    const lines = templates.map(
      (t) => `- ${t.id}: ${t.name} [${t.category}]\n  ${t.description}`,
    );
    return { content: [{ type: 'text' as const, text: `Templates (${templates.length}):\n${lines.join('\n')}` }] };
  },
};

export const getTemplateTool = {
  name: 'get_template',
  description: 'Get detailed info about a deployment template by ID.',
  parameters: { id: z.string().describe('Template ID (e.g. postgres, ollama-gpu)') } as const,
  schema: z.object({ id: z.string() }),
  async handler(args: { id: string }) {
    const data = await graphql<{
      template: {
        id: string;
        name: string;
        description: string;
        category: string;
        tags: string[];
        dockerImage: string;
        serviceType: string;
        resources: { cpu: number; memory: string; storage: string; gpu?: { units: number; vendor: string; model?: string } };
        ports: Array<{ port: number; as: number; global: boolean }>;
        envVars: Array<{ key: string; description: string; required: boolean; default?: string }>;
      } | null;
    }>(
      `query ($id: ID!) {
        template(id: $id) {
          id name description category tags dockerImage serviceType
          resources { cpu memory storage gpu { units vendor model } }
          ports { port as global }
          envVars { key description required default }
        }
      }`,
      { id: args.id },
    );

    if (!data.template) return { content: [{ type: 'text' as const, text: `Template "${args.id}" not found.` }] };

    const t = data.template;
    const parts = [
      `Template: ${t.name} (${t.id})`,
      `Category: ${t.category}`,
      `Image: ${t.dockerImage}`,
      `Description: ${t.description}`,
      `Resources: ${t.resources.cpu} CPU, ${t.resources.memory} RAM, ${t.resources.storage} storage`,
    ];
    if (t.resources.gpu) {
      parts.push(`GPU: ${t.resources.gpu.units}× ${t.resources.gpu.vendor} ${t.resources.gpu.model || ''}`);
    }
    if (t.ports.length) {
      parts.push(`Ports: ${t.ports.map((p) => `${p.port}→${p.as}`).join(', ')}`);
    }
    if (t.envVars.length) {
      parts.push(`Env vars: ${t.envVars.map((e) => `${e.key}${e.required ? ' (required)' : ''}`).join(', ')}`);
    }

    return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
  },
};

// ---------------------------------------------------------------------------
// deploy_template
// ---------------------------------------------------------------------------

export const deployTemplateTool = {
  name: 'deploy_template',
  description:
    'Deploy a template to Akash, Phala, or Spheron. Specify provider "akash" (default), "phala" for TEE, or "spheron" for VM.',
  parameters: {
    templateId: z.string().describe('Template ID'),
    projectId: z.string().describe('Project ID to deploy into'),
    provider: z
      .enum(['akash', 'phala', 'spheron'])
      .default('akash')
      .describe('Compute provider'),
    name: z.string().optional().describe('Service name override'),
    envOverrides: z
      .array(z.object({ key: z.string(), value: z.string() }))
      .optional()
      .describe('Environment variable overrides'),
  } as const,
  schema: z.object({
    templateId: z.string(),
    projectId: z.string(),
    provider: z.enum(['akash', 'phala', 'spheron']).default('akash'),
    name: z.string().optional(),
    envOverrides: z
      .array(z.object({ key: z.string(), value: z.string() }))
      .optional(),
  }),
  async handler(args: {
    templateId: string;
    projectId: string;
    provider: 'akash' | 'phala' | 'spheron';
    name?: string;
    envOverrides?: Array<{ key: string; value: string }>;
  }) {
    const input: Record<string, unknown> = {
      templateId: args.templateId,
      projectId: args.projectId,
    };
    if (args.name) input.serviceName = args.name;
    if (args.envOverrides?.length) input.envOverrides = args.envOverrides;

    if (args.provider === 'phala') {
      const data = await graphql<{
        deployFromTemplateToPhala: { id: string; status: string; serviceId: string };
      }>(
        `mutation ($input: DeployFromTemplateInput!) {
          deployFromTemplateToPhala(input: $input) { id status serviceId }
        }`,
        { input },
      );
      const d = data.deployFromTemplateToPhala;
      return { content: [{ type: 'text' as const, text: `Phala deployment started.\nDeployment ID: ${d.id}\nService ID: ${d.serviceId}\nStatus: ${d.status}` }] };
    }

    if (args.provider === 'spheron') {
      const data = await graphql<{
        deployFromTemplateToSpheron: { id: string; status: string; serviceId: string };
      }>(
        `mutation ($input: DeployFromTemplateInput!) {
          deployFromTemplateToSpheron(input: $input) { id status serviceId }
        }`,
        { input },
      );
      const d = data.deployFromTemplateToSpheron;
      return { content: [{ type: 'text' as const, text: `Spheron deployment started.\nDeployment ID: ${d.id}\nService ID: ${d.serviceId}\nStatus: ${d.status}` }] };
    }

    const data = await graphql<{
      deployFromTemplate: { id: string; status: string; serviceId: string };
    }>(
      `mutation ($input: DeployFromTemplateInput!) {
        deployFromTemplate(input: $input) { id status serviceId }
      }`,
      { input },
    );
    const d = data.deployFromTemplate;
    return { content: [{ type: 'text' as const, text: `Akash deployment started.\nDeployment ID: ${d.id}\nService ID: ${d.serviceId}\nStatus: ${d.status}` }] };
  },
};

// ---------------------------------------------------------------------------
// deploy_composite_template
// ---------------------------------------------------------------------------

export const deployCompositeTemplateTool = {
  name: 'deploy_composite_template',
  description:
    'Deploy a composite (multi-service) template. Mode "fullstack" deploys all components on one provider; "custom" assigns each component individually.',
  parameters: {
    templateId: z.string().describe('Composite template ID'),
    projectId: z.string().describe('Project ID to deploy into'),
    mode: z
      .enum(['fullstack', 'custom'])
      .default('fullstack')
      .describe('Deployment mode'),
    provider: z
      .enum(['akash', 'phala', 'spheron'])
      .optional()
      .describe('Provider for fullstack mode'),
    name: z.string().optional().describe('Service name override'),
  } as const,
  schema: z.object({
    templateId: z.string(),
    projectId: z.string(),
    mode: z.enum(['fullstack', 'custom']).default('fullstack'),
    provider: z.enum(['akash', 'phala', 'spheron']).optional(),
    name: z.string().optional(),
  }),
  async handler(args: {
    templateId: string;
    projectId: string;
    mode: 'fullstack' | 'custom';
    provider?: 'akash' | 'phala' | 'spheron';
    name?: string;
  }) {
    const input: Record<string, unknown> = {
      templateId: args.templateId,
      projectId: args.projectId,
      mode: args.mode,
    };
    if (args.provider) input.provider = args.provider;
    if (args.name) input.serviceName = args.name;

    const data = await graphql<{
      deployCompositeTemplate: { primaryServiceId: string };
    }>(
      `mutation ($input: DeployCompositeTemplateInput!) {
        deployCompositeTemplate(input: $input) { primaryServiceId }
      }`,
      { input },
    );
    const d = data.deployCompositeTemplate;
    return {
      content: [
        {
          type: 'text' as const,
          text: `Composite deployment started.\nPrimary Service ID: ${d.primaryServiceId}`,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// list_deployments
// ---------------------------------------------------------------------------

export const listDeploymentsTool = {
  name: 'list_deployments',
  description:
    'List all deployments across providers. Optionally filter by projectId.',
  parameters: {
    projectId: z.string().optional().describe('Filter by project ID'),
  } as const,
  schema: z.object({ projectId: z.string().optional() }),
  async handler(args: { projectId?: string }) {
    const data = await graphql<{
      allDeployments: Array<{
        id: string;
        type: string;
        status: string;
        provider: string;
        serviceName: string;
        serviceSlug: string;
        createdAt: string;
        costPerMonth: number | null;
      }>;
    }>(
      `query ($projectId: ID) {
        allDeployments(projectId: $projectId) {
          id type status provider serviceName serviceSlug createdAt costPerMonth
        }
      }`,
      args.projectId ? { projectId: args.projectId } : {},
    );

    const deps = data.allDeployments;
    if (!deps.length) return { content: [{ type: 'text' as const, text: 'No deployments found.' }] };

    const lines = deps.map((d) => {
      const cost = d.costPerMonth != null ? `$${d.costPerMonth.toFixed(2)}/mo` : 'n/a';
      return `- ${d.serviceName} [${d.provider}] ${d.status} | ${cost} | id=${d.id}`;
    });

    return { content: [{ type: 'text' as const, text: `Deployments (${deps.length}):\n${lines.join('\n')}` }] };
  },
};

// ---------------------------------------------------------------------------
// get_deployment_status
// ---------------------------------------------------------------------------

export const getDeploymentStatusTool = {
  name: 'get_deployment_status',
  description:
    'Get detailed status of a specific Akash, Phala, or Spheron deployment, including cost breakdown.',
  parameters: {
    deploymentId: z.string().describe('Deployment ID'),
    provider: z
      .enum(['akash', 'phala', 'spheron'])
      .describe('Which provider this deployment is on'),
  } as const,
  schema: z.object({
    deploymentId: z.string(),
    provider: z.enum(['akash', 'phala', 'spheron']),
  }),
  async handler(args: { deploymentId: string; provider: 'akash' | 'phala' | 'spheron' }) {
    if (args.provider === 'akash') {
      const data = await graphql<{
        akashDeployment: {
          id: string;
          status: string;
          dseq: string;
          provider: string;
          costPerHour: number;
          costPerDay: number;
          costPerMonth: number;
          errorMessage: string | null;
          deployedAt: string | null;
          service: { name: string; slug: string } | null;
        } | null;
      }>(
        `query ($id: ID!) {
          akashDeployment(id: $id) {
            id status dseq provider costPerHour costPerDay costPerMonth
            errorMessage deployedAt
            service { name slug }
          }
        }`,
        { id: args.deploymentId },
      );

      const d = data.akashDeployment;
      if (!d) return { content: [{ type: 'text' as const, text: `Akash deployment ${args.deploymentId} not found.` }] };

      const parts = [
        `Akash Deployment: ${d.id}`,
        `Service: ${d.service?.name ?? 'unknown'} (slug: ${d.service?.slug ?? 'n/a'})`,
        `Status: ${d.status}`,
        `DSEQ: ${d.dseq}`,
        `Provider: ${d.provider}`,
        `Cost: $${d.costPerHour?.toFixed(4)}/hr | $${d.costPerDay?.toFixed(2)}/day | $${d.costPerMonth?.toFixed(2)}/mo`,
      ];
      if (d.errorMessage) parts.push(`Error: ${d.errorMessage}`);
      if (d.deployedAt) parts.push(`Deployed at: ${d.deployedAt}`);

      return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
    }

    if (args.provider === 'phala') {
      const data = await graphql<{
        phalaDeployment: {
          id: string;
          status: string;
          appId: string;
          appUrl: string;
          cvmSize: string;
          costPerHour: number;
          costPerDay: number;
          costPerMonth: number;
          errorMessage: string | null;
          service: { name: string; slug: string } | null;
        } | null;
      }>(
        `query ($id: ID!) {
          phalaDeployment(id: $id) {
            id status appId appUrl cvmSize costPerHour costPerDay costPerMonth
            errorMessage
            service { name slug }
          }
        }`,
        { id: args.deploymentId },
      );

      const d = data.phalaDeployment;
      if (!d) return { content: [{ type: 'text' as const, text: `Phala deployment ${args.deploymentId} not found.` }] };

      const parts = [
        `Phala Deployment: ${d.id}`,
        `Service: ${d.service?.name ?? 'unknown'} (slug: ${d.service?.slug ?? 'n/a'})`,
        `Status: ${d.status}`,
        `CVM Size: ${d.cvmSize}`,
        `App URL: ${d.appUrl || 'n/a'}`,
        `Cost: $${d.costPerHour?.toFixed(4)}/hr | $${d.costPerDay?.toFixed(2)}/day | $${d.costPerMonth?.toFixed(2)}/mo`,
      ];
      if (d.errorMessage) parts.push(`Error: ${d.errorMessage}`);

      return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
    }

    const data = await graphql<{
      spheronDeployment: {
        id: string;
        status: string;
        ipAddress: string | null;
        sshPort: number | null;
        instanceType: string | null;
        gpuType: string | null;
        costPerHour: number;
        costPerDay: number;
        costPerMonth: number;
        errorMessage: string | null;
        service: { name: string; slug: string } | null;
      } | null;
    }>(
      `query ($id: ID!) {
        spheronDeployment(id: $id) {
          id status ipAddress sshPort instanceType gpuType
          costPerHour costPerDay costPerMonth errorMessage
          service { name slug }
        }
      }`,
      { id: args.deploymentId },
    );

    const d = data.spheronDeployment;
    if (!d) return { content: [{ type: 'text' as const, text: `Spheron deployment ${args.deploymentId} not found.` }] };

    const parts = [
      `Spheron Deployment: ${d.id}`,
      `Service: ${d.service?.name ?? 'unknown'} (slug: ${d.service?.slug ?? 'n/a'})`,
      `Status: ${d.status}`,
      `Instance: ${d.instanceType ?? 'n/a'}${d.gpuType ? ` (${d.gpuType})` : ''}`,
      `Address: ${d.ipAddress ? `${d.ipAddress}${d.sshPort ? ` (ssh ${d.sshPort})` : ''}` : 'n/a'}`,
      `Cost: $${d.costPerHour?.toFixed(4)}/hr | $${d.costPerDay?.toFixed(2)}/day | $${d.costPerMonth?.toFixed(2)}/mo`,
    ];
    if (d.errorMessage) parts.push(`Error: ${d.errorMessage}`);

    return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
  },
};

// ---------------------------------------------------------------------------
// stop_deployment
// ---------------------------------------------------------------------------

export const stopDeploymentTool = {
  name: 'stop_deployment',
  description:
    'Stop/close a deployment. Akash and Spheron are deleted; Phala is stopped (resumable).',
  parameters: {
    deploymentId: z.string().describe('Deployment ID'),
    provider: z
      .enum(['akash', 'phala', 'spheron'])
      .describe('Which provider this deployment is on'),
  } as const,
  schema: z.object({
    deploymentId: z.string(),
    provider: z.enum(['akash', 'phala', 'spheron']),
  }),
  async handler(args: { deploymentId: string; provider: 'akash' | 'phala' | 'spheron' }) {
    if (args.provider === 'akash') {
      const data = await graphql<{
        closeAkashDeployment: { id: string; status: string };
      }>(
        `mutation ($id: ID!) {
          closeAkashDeployment(id: $id) { id status }
        }`,
        { id: args.deploymentId },
      );
      return { content: [{ type: 'text' as const, text: `Akash deployment closed. Status: ${data.closeAkashDeployment.status}` }] };
    }

    if (args.provider === 'phala') {
      const data = await graphql<{
        stopPhalaDeployment: { id: string; status: string };
      }>(
        `mutation ($id: ID!) {
          stopPhalaDeployment(id: $id) { id status }
        }`,
        { id: args.deploymentId },
      );
      return { content: [{ type: 'text' as const, text: `Phala deployment stopped. Status: ${data.stopPhalaDeployment.status}` }] };
    }

    const data = await graphql<{
      deleteSpheronDeployment: { id: string; status: string };
    }>(
      `mutation ($id: ID!) {
        deleteSpheronDeployment(id: $id) { id status }
      }`,
      { id: args.deploymentId },
    );
    return { content: [{ type: 'text' as const, text: `Spheron deployment deleted. Status: ${data.deleteSpheronDeployment.status}` }] };
  },
};

// ---------------------------------------------------------------------------
// get_deployment_logs
// ---------------------------------------------------------------------------

export const getDeploymentLogsTool = {
  name: 'get_deployment_logs',
  description: 'Fetch recent container logs from a deployed service.',
  parameters: {
    serviceId: z.string().describe('Service ID'),
    tail: z.number().default(50).describe('Number of recent lines (default 50, max 200)'),
  } as const,
  schema: z.object({
    serviceId: z.string(),
    tail: z.number().default(50),
  }),
  async handler(args: { serviceId: string; tail: number }) {
    const tail = Math.min(args.tail, 200);

    const data = await graphql<{
      serviceLogs: { logs: string; provider: string; deploymentId: string };
    }>(
      `query ($serviceId: ID!, $tail: Int) {
        serviceLogs(serviceId: $serviceId, tail: $tail) {
          logs provider deploymentId
        }
      }`,
      { serviceId: args.serviceId, tail },
    );

    const { logs, provider } = data.serviceLogs;
    const lines = logs.split('\n');
    const capped = lines.length > 100 ? lines.slice(-100) : lines;

    return {
      content: [{
        type: 'text' as const,
        text: [
          `Provider: ${provider}`,
          `Lines: ${capped.length}${lines.length > 100 ? ` (showing last 100 of ${lines.length})` : ''}`,
          '---',
          ...capped,
        ].join('\n'),
      }],
    };
  },
};

// ---------------------------------------------------------------------------
// manage_domains
// ---------------------------------------------------------------------------

export const listDomainsTool = {
  name: 'list_domains',
  description: 'List domains for the current organization.',
  parameters: {
    orgId: z.string().describe('Organization ID'),
  } as const,
  schema: z.object({ orgId: z.string() }),
  async handler(args: { orgId: string }) {
    const data = await graphql<{
      orgDomains: Array<{
        id: string;
        hostname: string;
        verified: boolean;
        sslStatus: string;
      }>;
    }>(
      `query ($orgId: ID!) {
        orgDomains(orgId: $orgId) { id hostname verified sslStatus }
      }`,
      { orgId: args.orgId },
    );

    const domains = data.orgDomains;
    if (!domains.length) return { content: [{ type: 'text' as const, text: 'No domains found.' }] };

    const lines = domains.map(
      (d) =>
        `- ${d.hostname} | verified=${d.verified} ssl=${d.sslStatus} | id=${d.id}`,
    );
    return { content: [{ type: 'text' as const, text: `Domains (${domains.length}):\n${lines.join('\n')}` }] };
  },
};

export const getDnsRecordsTool = {
  name: 'get_dns_records',
  description: 'List DNS records for a domain zone.',
  parameters: {
    domain: z.string().describe('Domain name (e.g. example.com)'),
  } as const,
  schema: z.object({ domain: z.string() }),
  async handler(args: { domain: string }) {
    const data = await graphql<{
      dnsRecords: Array<{
        name: string;
        type: string;
        value: string;
        ttl: number;
      }>;
    }>(
      `query ($domain: String!) {
        dnsRecords(domain: $domain) { name type value ttl }
      }`,
      { domain: args.domain },
    );

    const records = data.dnsRecords;
    if (!records.length) return { content: [{ type: 'text' as const, text: `No DNS records found for ${args.domain}.` }] };

    const lines = records.map(
      (r) => `  ${r.type}\t${r.name}\t${r.value}\tTTL=${r.ttl}`,
    );
    return { content: [{ type: 'text' as const, text: `DNS records for ${args.domain}:\n${lines.join('\n')}` }] };
  },
};
