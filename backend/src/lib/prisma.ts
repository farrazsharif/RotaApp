import { PrismaClient } from '@prisma/client';
import { getTenant } from './tenantContext';

// Every business model carries a companyId and must be auto-scoped. The
// platform-level Company model is deliberately excluded (managing companies is
// a cross-tenant operation).
const TENANT_MODELS = new Set([
  'User', 'CustomRole', 'Site', 'ServiceUser', 'ServiceUserStatusChange', 'Document', 'FamilyLink', 'PersonalServicePlan',
  'CarePlan', 'LikesDislikes', 'Review', 'Training', 'ImportantDate', 'Medication',
  'MedAdministration', 'Shift', 'CallLog', 'TimeOffRequest', 'ClockRecord',
  'PushSubscription', 'ShiftReminder', 'Notification', 'PasswordSetupToken',
  'AuditLog', 'OrgSettings', 'Funder', 'FundingArrangement', 'BankHoliday',
  'Invoice', 'Payment', 'InvoiceLine', 'SpotCheck', 'OfficeNote', 'ShiftHandover', 'Announcement', 'Run',
  'ServicePlanTemplate',
]);

// Operations whose `where` (including unique-where in Prisma 5) we filter by
// companyId so a request can only ever read/mutate its own company's rows.
const WHERE_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany', 'update', 'delete',
]);

function buildClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return base.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          const ctx = getTenant();
          const isTenantModel = !!model && TENANT_MODELS.has(model);

          // No context (background job / pre-auth) or explicit bypass, or a
          // non-tenant model → run unscoped. But guard against an accidental
          // unscoped WRITE to a tenant model that would create an orphan row
          // (null companyId): allow it only if the caller supplied companyId
          // explicitly (e.g. the background reminder poller).
          if (!ctx || ctx.bypass || !isTenantModel) {
            if (isTenantModel && !ctx?.bypass && (operation === 'create' || operation === 'createMany' || operation === 'upsert')) {
              const rows = operation === 'createMany' ? args.data : [operation === 'upsert' ? args.create : args.data];
              const list = Array.isArray(rows) ? rows : [rows];
              const missing = list.some((r: Record<string, unknown>) => !r || r.companyId == null);
              if (missing) {
                throw new Error(`Refusing unscoped write to ${model} without a companyId — no tenant in scope.`);
              }
            }
            return query(args);
          }
          const companyId = ctx.companyId;

          if (WHERE_OPS.has(operation)) {
            args.where = { ...(args.where ?? {}), companyId };
          } else if (operation === 'create') {
            args.data = { ...args.data, companyId };
          } else if (operation === 'createMany') {
            const d = args.data;
            args.data = Array.isArray(d)
              ? d.map((row: Record<string, unknown>) => ({ ...row, companyId }))
              : { ...d, companyId };
          } else if (operation === 'upsert') {
            args.where = { ...(args.where ?? {}), companyId };
            args.create = { ...args.create, companyId };
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma: ExtendedClient = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
