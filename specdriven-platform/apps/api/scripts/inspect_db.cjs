const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const cols = await p.$queryRawUnsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects' ORDER BY ordinal_position"
  );
  console.log("PROJECTS COLUMNS:", JSON.stringify(cols, null, 2));

  const tickets = await p.$queryRawUnsafe(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'tickets' ORDER BY ordinal_position"
  );
  console.log("\nTICKETS COLUMNS:", JSON.stringify(tickets, null, 2));

  const tEnums = await p.$queryRawUnsafe(
    "SELECT typname FROM pg_type WHERE typname IN ('BillingModel', 'SupportTier', 'TicketStatus') ORDER BY typname"
  );
  console.log("\nENUMS:", JSON.stringify(tEnums, null, 2));

  const tables = await p.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('project_module_assignments', 'projects', 'tickets', 'clients') ORDER BY table_name"
  );
  console.log("\nTABLES:", JSON.stringify(tables, null, 2));

  const cCols = await p.$queryRawUnsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'clients' ORDER BY ordinal_position"
  );
  console.log("\nCLIENTS COLUMNS:", JSON.stringify(cCols, null, 2));

  await p.$disconnect();
})();
