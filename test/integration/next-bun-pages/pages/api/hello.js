import { greeting } from "../../lib/greeting";

export default function handler(req, res) {
  res.status(200).json({ message: greeting(req.query.name ?? "api"), method: req.method });
}
