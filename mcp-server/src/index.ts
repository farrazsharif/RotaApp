#!/usr/bin/env node
/**
 * MCP server over the Caremid API.
 *
 * Almost every tool here reads. These are care records and compliance
 * evidence, and an agent that can quietly change them is a different risk
 * conversation from one that can only report on them.
 *
 * The one write surface is the policy library, and it is shaped by the rule
 * this file previously stated as "behind an explicit human confirmation
 * step": an agent may CREATE a record in a state that does nothing until a
 * person acts on it, and may not move a record into the state that has an
 * effect on anyone. So policies are created as DRAFTS and there is no publish
 * tool - publishing is what asks every carer to read and sign a document, and
 * a person does that in the portal having looked at what was created.
 *
 * Any future write tool has to clear the same bar.
 *
 * Launched over stdio by the MCP client, with the service account's
 * credentials in the environment:
 *   CAREMID_AGENT_EMAIL, CAREMID_AGENT_PASSWORD
 *   CAREMID_API_URL (optional; defaults to the live API)
 */
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { API_BASE_URL, credentialsConfigured } from './api.js';
import { registerCqcTools } from './tools/cqc.js';
import { registerPolicyTools } from './tools/policies.js';
import { registerShiftTools } from './tools/shifts.js';
import { registerStaffTools } from './tools/staff.js';

function createServer(): McpServer {
  const server = new McpServer({ name: 'caremid-mcp-server', version: '1.0.0' });
  registerCqcTools(server);
  registerStaffTools(server);
  registerShiftTools(server);
  registerPolicyTools(server);
  return server;
}

serveStdio(createServer);

// stderr, not stdout: stdout carries the protocol.
console.error(`caremid-mcp-server on stdio → ${API_BASE_URL}`);
if (!credentialsConfigured()) {
  // Starting anyway so the client can list the tools and show what is on
  // offer; each call then returns a message saying exactly what is missing,
  // which is more use than a server that refuses to start.
  console.error('WARNING: CAREMID_AGENT_EMAIL / CAREMID_AGENT_PASSWORD are not set — every tool call will fail until they are.');
}
