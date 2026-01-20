import { get } from "lodash";

export function authMiddleware(req: any, res: any, next: any) {
  const token = get(req, "headers.authorization");
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
