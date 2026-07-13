import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

/** OpenAPI 3 + UI em /docs (Fase A leftover / catch-all). */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "SpecDriven Platform API",
        description:
          "API cloud SpecDriven — auth, tickets, sync desktop, billing, notificações.",
        version: "0.1.0",
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT ?? 3000}`,
          description: "Local",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      tags: [
        { name: "health" },
        { name: "auth" },
        { name: "clients" },
        { name: "tickets" },
        { name: "sync" },
        { name: "billing" },
        { name: "notifications" },
        { name: "privacy" },
        { name: "search" },
        { name: "audit" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}
