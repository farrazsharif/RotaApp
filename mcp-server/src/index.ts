#!/usr/bin/env node
/**
 * Read-only MCP server over the Caremid API.
 *
 * Every tool here reads; none writes. That is deliberate rather than a first
 * milestone: these are care records and compliance evidence, and an agent that
 * can quietly change them is a different risk conversation from one that can
 * only report on them. Write tools, when they come, belong behind an explicit
 * human confirmation step.
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
import { registerShiftTools } from './tools/shifts.js';
import { registerStaffTools } from './tools/staff.js';

function createServer(): McpServer {
  const server = new McpServer({ name: 'caremid-mcp-server', version: '1.0.0' });
  registerCqcTools(server);
  registerStaffTools(server);
  registerShiftTools(server);
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
