import { userFromMcpEnv } from "./auth.js";
import { mcpUserAls } from "./authContext.js";
import { startStdioMcpServer } from "./server.js";

const user = await userFromMcpEnv();
mcpUserAls.enterWith(user);
await startStdioMcpServer();
