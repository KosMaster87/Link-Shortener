import { getClicksByCode } from "../services/analytics-service.js";

export const handleAnalytics = async (req, res, params) => {
  const result = await getClicksByCode(params.code);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.data));
};
