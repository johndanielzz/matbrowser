import { DashboardService } from "../services/dashboardService.js";

const dashboard = new DashboardService();

export async function metrics(req, res) {
  res.json({ metrics: await dashboard.metrics(req.user) });
}
