import { CrmService } from "../services/crmService.js";

const crm = new CrmService();

export async function listLeads(req, res) {
  const leads = await crm.listLeads(req.user);
  res.json({ leads });
}

export async function updateStage(req, res) {
  const lead = await crm.updateStage(req.params.id, req.body.stage, req.user);
  if (!lead) return res.status(404).json({ error: { code: "LEAD_NOT_FOUND", message: "Lead not found." } });
  res.json({ lead });
}

export async function addNote(req, res) {
  const activity = await crm.addNote(req.params.id, req.body.note, req.body.tags, req.user);
  res.status(201).json({ activity });
}
