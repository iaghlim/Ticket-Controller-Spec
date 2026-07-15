const fs = require("fs");
const path = require("path");

const schemaPath = path.resolve("apps", "api", "prisma", "schema.prisma");
let schema = fs.readFileSync(schemaPath, "utf8");
console.log("Read schema:", schema.length, "chars");

// Add userProjects relation to Project model (after "client" relation line)
schema = schema.replace(
  /(  client       Client       @relation\(fields: \[clientId\], references: \[id\], onDelete: Cascade\))/,
  "$1\n  userProjects    UserProject[]"
);

// Add userProjects relation to User model (after "notifications" field)
schema = schema.replace(
  /(  notifications      Notification\[\])/,
  "$1\n  userProjects    UserProject[]"
);

// Append UserProject model at the end
const userProjectModel = `
model UserProject {
  id        String   @id @default(uuid())
  userId    String
  projectId String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([userId, projectId])
  @@index([userId])
  @@index([projectId])
  @@map("user_projects")
}
`;

schema = schema.trimEnd() + "\n" + userProjectModel;

fs.writeFileSync(schemaPath, schema);
console.log("Schema updated successfully");
