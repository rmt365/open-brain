/**
 * Bootstrap module exports
 * Utilities for bootstrapping services with database health checks
 */

export {
  createDegradedServer,
  type DegradedServerConfig,
  type DegradedServerHandle,
} from "./degraded-server.ts";

export {
  bootstrapService,
  readServiceEnv,
  type ServiceBootstrapConfig,
  type ServiceHandle,
  type ServiceEnvConfig,
  type BootstrapResult,
} from "./service.ts";
