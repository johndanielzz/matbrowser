import { LeadService } from "../services/leadService.js";
import { NvidiaService } from "../services/nvidiaService.js";
import { AppError } from "../utils/errors.js";

const leads = new LeadService();
const nvidia = new NvidiaService();

export async function analyzeLead(req, res) {
  const lead = await leads.getById(req.body.leadId);
  if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
  const result = await nvidia.analyzeLead(lead);
  res.json(result);
}

export async function writeOutreach(req, res) {
  const lead = await leads.getById(req.body.leadId);
  if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
  const result = await nvidia.writeOutreach(lead, req.body.type);
  res.json(result);
}
