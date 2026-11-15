# caremid-mcp-server

A read-only MCP server over the Caremid API, so an agent can answer questions
about compliance and staffing without being given the keys to change anything.

## Why read-only

These are care records and CQC evidence. An agent that can report on them is a
very different proposition from one that can quietly alter them, and the second
needs a conversation this server deliberately does not pre-empt. When write
tools arrive they belong behind an explicit human confirmation step, not as a
quiet addition to this list.

The read-only stance is enforced by construction: there are no write tools and
no generic "call this endpoint" escape hatch.

## Tools

| Tool | Answers |
| --- | --- |
| `caremid_cqc_readiness` | The whole CQC sweep by key question — what's red, what's amber, and which records are behind each one |
| `caremid_staff_compliance` | Who is missing what from their staff file, against the configured Regulation 19 requirements |
| `caremid_expiring_training` | Training that has lapsed or is about to, latest certificate per person per course |
| `caremid_unstaffed_visits` | Visits in a date range with no carer, or fewer than they need |
| `caremid_list_staff` | Active staff with ids, for resolving a name before calling anything else |

Every tool takes `response_format: "markdown" | "json"`. Markdown is the default
and is what you want when a person is reading the answer; JSON when something
downstream is going to process it.

## Setup

### 1. A service account in Caremid

Create a dedicated user with its own restricted role rather than reusing a
personal login. The audit trail then shows the agent rather than a person, and
revoking it is a single switch that affects nobody's day.

It needs permission to read staff and the CQC dashboard, and nothing else.

### 2. Credentials in the environment

```bash
setx CAREMID_AGENT_EMAIL "agent@caremid.co.uk"
setx CAREMID_AGENT_PASSWORD "..."
```

Caremid has no API-key mechanism — authentication is a seven-day JWT obtained
by logging in — so the server signs in on first use, keeps the token in memory,
and signs in again when it expires. The password is never logged, never
returned to the model, and never written to disk.

`CAREMID_API_URL` is optional and defaults to the live API. Point it at
`http://localhost:4000/api` to work against a local backend.

### 3. Build

```bash
npm install && npm run build
```

### 4. Wire it up

The repo's `.mcp.json` already points at `mcp-server/dist/index.js`, so Claude
Code picks it up when run from the Caremid working copy.

## Checking it works

```bash
npm run build && npm run smoke
```

Without credentials this still runs: it checks the protocol, the schemas, that
bad input is rejected, and that a call with no credentials says *which*
variables are missing. With credentials set it also calls the live API and
prints the current CQC readiness score.

## Notes

- Responses are capped at 25,000 characters by returning **fewer rows**, never
  by truncating text. The response says how many were left out.
- Supported Living house visits are staffed through resident slots rather than
  a single carer. `caremid_unstaffed_visits` counts them correctly; anything
  reading `userId` alone would report every house visit as empty.
- `caremid_expiring_training` keeps only the most recent certificate per person
  per course, so a course that has since been retaken doesn't keep reporting as
  expired from its old record.
- Expiry dates on uploaded **documents** (passports, visas, insurance) are held
  separately from training and are not yet exposed here.
