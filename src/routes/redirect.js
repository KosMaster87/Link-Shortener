import { recordClick } from "../services/analytics-service.js";
import { getLink } from "../services/link-service.js";

export const handleRedirect = async (req, res, params) => {
  const result = await getLink(params.code);

  if (!result.success) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "NOT_FOUND" }));
  }

  await recordClick({
    code: params.code,
    referrer: req.headers["referer"] ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  res.writeHead(302, { Location: result.data.originalUrl });
  res.end();
};
