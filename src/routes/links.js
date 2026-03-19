import {
  createLink,
  deleteLink,
  getAllLinks,
} from "../services/link-service.js";

const ERROR_STATUS = { INVALID_URL: 422, SLUG_TAKEN: 409, NOT_FOUND: 404 };

const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

export const handleLinks = async (req, res, params) => {
  if (req.method === "GET") {
    const result = await getAllLinks();
    return send(res, 200, result.data);
  }

  if (req.method === "POST") {
    const result = await createLink(req.body);
    if (!result.success)
      return send(res, ERROR_STATUS[result.error], { error: result.error });
    return send(res, 201, result.data);
  }

  if (req.method === "DELETE") {
    const result = await deleteLink(params.code);
    if (!result.success)
      return send(res, ERROR_STATUS[result.error], { error: result.error });
    res.writeHead(204);
    return res.end();
  }
};
