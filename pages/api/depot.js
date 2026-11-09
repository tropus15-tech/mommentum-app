import { buildDepot } from "../../lib/depot";

export default async function handler(req, res) {
  try {
    const data = await buildDepot();
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
