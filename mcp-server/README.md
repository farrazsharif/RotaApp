# caremid-mcp-server

A read-only MCP server over the Caremid API, so an agent can answer questions
about compliance and staffing without being given the keys to change anything.

## Why read-only

These are care records and CQC evidence. An agent that can report on them is a
very different proposition from one that can quietly alter them, and the second
needs a conversation this server deliberately does not pre-empt. When write
tools arrive they belong behind an explicit human confirmation step, not as a
quiet addition to this list.

Almost every tool reads. The one that writes adds policies to the library as
DRAFTS, and there is no publish tool — publishing is what asks every carer to
read and sign a document, and a person does that in the portal. That is the
rule any future write tool has to clear: an agent may create a record in a
state that does nothing until a person acts on it, and may not move a record
into the state that has an effect on anyone.

There is no generic "call this endpoint" escape hatch.

## Tools

| Tool | Answers |
| --- | --- |
| `caremid_cqc_readiness` | The whole CQC sweep by key question — what's red, what's amber, and which records are behind each one |
| `caremid_staff_compliance` | Who is missing what from their staff file, against the configured Regulation 19 requirements |
| `caremid_expiring_training` | Training that has lapsed or is about to, latest certificate per person per course |
| `caremid_unstaffed_visits` | Visits in a date range with no carer, or fewer than they need |
| `caremid_list_staff` | Active staff with ids, for resolving a name before calling anything else |
| `caremid_list_policies` | The policy library: versions, review dates, and how many staff have signed the current version |
| `caremid_create_policy` | **Writes.** Adds one policy as a draft. Cannot publish. |

Every tool takes `response_format: "markdown" | "json"`. Markdown is the default
and is what you want when a person is reading the answer; JSON when something
downstream is going to process it.

## Setup

### 1. A service account in Caremid

Create a dedicated user with its own custom role rather than reusing a personal
login. The audit trail then shows the agent rather than a person, and revoking
it is a single switch that affects nobody's day.

Give it the narrowest set that covers what you actually want it to do:

| Capability | Needed for |
| --- | --- |
| `manage_staff` | `caremid_staff_compliance`, `caremid_expiring_training`, `caremid_list_staff` |
| `manage_cqc` | `caremid_cqc_readiness` |
| `manage_schedule` | `caremid_unstaffed_visits` |
| `manage_policies` | `caremid_list_policies`, `caremid_create_policy` |

Admin is not required and is not recommended. The reporting tools are harmless
if the account leaks; a full-admin account is not, and the blast radius of an
agent that misreads something is whatever its role allows. Widening a role
later takes two clicks. Un-writing records does not.

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
