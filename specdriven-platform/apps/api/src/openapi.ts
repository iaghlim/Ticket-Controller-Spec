import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

function isOpenApiEnabledInProduction(): boolean {
  if (process.env.OPENAPI_ENABLED === "true") return true;
  return Boolean(process.env.OPENAPI_USER && process.env.OPENAPI_PASSWORD);
}

function openApiBasicAuthHook(
  request: FastifyRequest,
  reply: FastifyReply,
): void | FastifyReply {
  const expectedUser = process.env.OPENAPI_USER;
  const expectedPassword = process.env.OPENAPI_PASSWORD;
  if (!expectedUser || !expectedPassword) return;

  const auth = request.headers.authorization;
  if (!auth?.startsWith("Basic ")) {
    reply.header("WWW-Authenticate", 'Basic realm="OpenAPI"');
    return reply.status(401).send({ error: "unauthorized" });
  }

  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
  const password = colon >= 0 ? decoded.slice(colon + 1) : "";

  if (user !== expectedUser || password !== expectedPassword) {
    return reply.status(401).send({ error: "unauthorized" });
  }
}

/** OpenAPI 3 + UI em /docs — disabled in production unless explicitly enabled. */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !isOpenApiEnabledInProduction()) {
    app.log.info(
      "OpenAPI /docs disabled in production (set OPENAPI_ENABLED=true or OPENAPI_USER/OPENAPI_PASSWORD)",
    );
    return;
  }

  const protectWithBasicAuth =
    isProduction &&
    process.env.OPENAPI_ENABLED !== "true" &&
    Boolean(process.env.OPENAPI_USER && process.env.OPENAPI_PASSWORD);

  if (protectWithBasicAuth) {
    app.addHook("onRequest", async (request, reply) => {
      if (!request.url.startsWith("/docs")) return;
      return openApiBasicAuthHook(request, reply);
    });
  }

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
