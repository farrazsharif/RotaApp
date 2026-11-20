#!/usr/bin/env node
/**
 * MCP server over the Caremid API.
 *
 * Most tools here read. These are care records and compliance evidence, and
 * an agent that can quietly change them is a different risk conversation from
 * one that can only report on them.
 *
 * The writes are filing, and every one obeys the same two rules. ADDITIVE: a
 * tool may add a record that was missing, and may never replace, amend or
 * delete one. NO JUDGEMENT: a tool records what a document actually says,
 * never a date or a status inferred because it seemed likely. So the policy
 * register can be filled and a staff file can be filled, and nothing here can
 * publish, sign off, or decide that something is compliant.
 *
 * Supervisions are the worked example of where that stops. Caremid lets only
 * an ADMIN record a supervision held on paper, because backdating one makes a
 * dashboard show a conversation nobody had. There is no tool for it.
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
import { registerClientTools } from './tools/clients.js';
import { registerCqcTools } from './tools/cqc.js';
import { registerPolicyTools } from './tools/policies.js';
import { registerShiftTools } from './tools/shifts.js';
import { registerStaffFileTools } from './tools/staffFiles.js';
import { registerStaffTools } from './tools/staff.js';

function createServer(): McpServer {
  const server = new McpServer({ name: 'caremid-mcp-server', version: '1.0.0' });
  registerCqcTools(server);
  registerClientTools(server);
  registerStaffTools(server);
  registerStaffFileTools(server);
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
