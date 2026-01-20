import { Router } from "express";
import { pick } from "lodash";

const router = Router();

router.get("/users", (req, res) => {
  const user = { id: 1, name: "Test", password: "secret" };
  res.json(pick(user, ["id", "name"]));
});

export default router;
