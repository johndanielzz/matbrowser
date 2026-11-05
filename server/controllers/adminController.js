import { AdminService } from "../services/adminService.js";

const admin = new AdminService();

export async function overview(_req, res) {
  res.json(await admin.overview());
}
