import { LeadService } from "../services/leadService.js";

const leadService = new LeadService();

export async function searchLeads(req, res) {
  const result = await leadService.search(req.body, req.user);
  res.json(result);
}

export async function saveLead(req, res) {
  const fallback = req.body && typeof req.body === "object" && (req.body.lead || req.body.id || req.body.name)
    ? (req.body.lead && typeof req.body.lead === "object" ? req.body.lead : req.body)
    : null;
  const lead = await leadService.save(req.params.id, req.user, fallback);
  if (!lead) return res.status(404).json({ error: { code: "LEAD_NOT_FOUND", message: "Lead not found." } });
  res.json({ lead });
}

export async function leadReport(req, res) {
  const result = await leadService.getReport(req.params.id);
  res.json(result);
}
