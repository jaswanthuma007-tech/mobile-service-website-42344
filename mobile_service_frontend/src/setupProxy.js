const { createProxyMiddleware } = require("http-proxy-middleware");

/**
 * Proxy /api requests to the Flask backend in development.
 * This keeps frontend fetch calls simple (`/api/...`) and avoids CORS issues on localhost.
 */
module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.REACT_APP_BACKEND_URL || "http://localhost:3001",
      changeOrigin: true,
      // Keep paths unchanged (backend routes are /api/..)
      logLevel: "silent",
    }),
  );
};
