const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const builtServer = path.join(projectRoot, "dist", "server.js");
const developmentMode = process.argv.includes("--dev");
const serverPath = !developmentMode && fs.existsSync(builtServer)
  ? builtServer
  : path.join(projectRoot, "server.js");

process.env.NODE_ENV = developmentMode ? "development" : "production";

const serverModule = require(serverPath);
if (typeof serverModule?.startServer === "function") {
  serverModule.startServer();
}
