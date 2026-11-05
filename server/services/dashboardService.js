import { CrmService } from "./crmService.js";

export class DashboardService {
  constructor() {
    this.crm = new CrmService();
  }

  async metrics(user) {
    const leads = await this.crm.listLeads(user);
    const savedLeads = leads.length;
    const contactedLeads = leads.filter((lead) => ["Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won"].includes(lead.stage)).length;
    const wonDeals = leads.filter((lead) => lead.stage === "Won").length;
    const estimatedRevenue = leads.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);

    return {
      totalLeads: savedLeads,
      savedLeads,
      contactedLeads,
      wonDeals,
      estimatedRevenue,
      conversionRate: savedLeads ? Math.round((wonDeals / savedLeads) * 100) : 0,
      monthlyGrowth: this.monthlyGrowth(leads),
      dailyActions: this.dailyActions(leads),
      dailyActionSummary: this.dailyActionSummary(leads)
    };
  }

  dailyActions(leads) {
    const now = Date.now();
    const endOfToday = new Date(new Date().setHours(23, 59, 59, 999)).getTime();
    const contactedStages = new Set(["Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won", "Lost"]);
    const actions = [];

    for (const lead of leads) {
      const stage = lead.stage || "New";
      const dueAt = lead.nextActionAt || lead.nextFollowUpAt || lead.followUpAt || lead.reminderAt;
      const dueTime = dueAt ? new Date(dueAt).getTime() : Number.NaN;
      const score = Number(lead.opportunityScore || lead.audit?.score || 0);
      if (Number.isFinite(dueTime) && dueTime <= endOfToday && !["Won", "Lost"].includes(stage)) {
        actions.push({ priority: dueTime < now - 86400000 ? 1 : 2, type: "follow_up", leadId: lead.id, leadName: lead.name, dueAt, title: dueTime < now - 86400000 ? "Overdue follow-up" : "Follow-up due today", reason: `Next action was scheduled for ${new Date(dueAt).toLocaleDateString()}.`, actionLabel: "Open lead" });
      } else if (stage === "New" && score >= 70 && !contactedStages.has(stage)) {
        actions.push({ priority: 3, type: "high_opportunity", leadId: lead.id, leadName: lead.name, title: "Contact a high-opportunity lead", reason: `Opportunity score is ${score}/100 and no outreach stage is recorded.`, actionLabel: "Open lead" });
      } else if (lead.websiteUrl && !lead.audit?.completedAt && !lead.audit?.status) {
        actions.push({ priority: 4, type: "website_audit", leadId: lead.id, leadName: lead.name, title: "Review website opportunity", reason: "A website URL is available but no completed audit is stored.", actionLabel: "Open audit" });
      }
    }
    return actions.sort((a, b) => a.priority - b.priority).slice(0, 8);
  }

  dailyActionSummary(leads) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 86400000;
    const summary = { total: 0, overdue: 0, dueToday: 0, highOpportunity: 0, websiteAudits: 0, upcoming: 0 };

    for (const lead of leads) {
      const stage = lead.stage || "New";
      const dueAt = lead.nextActionAt || lead.nextFollowUpAt || lead.followUpAt || lead.reminderAt;
      const dueTime = dueAt ? new Date(dueAt).getTime() : Number.NaN;
      if (Number.isFinite(dueTime) && dueTime <= endOfToday && !["Won", "Lost"].includes(stage)) {
        summary.total += 1;
        if (dueTime < startOfToday) summary.overdue += 1;
        else summary.dueToday += 1;
        continue;
      }
      const score = Number(lead.opportunityScore || lead.audit?.score || 0);
      if (stage === "New" && score >= 70) {
        summary.total += 1;
        summary.highOpportunity += 1;
      } else if (lead.websiteUrl && !lead.audit?.completedAt && !lead.audit?.status) {
        summary.total += 1;
        summary.websiteAudits += 1;
      }
    }
    return summary;
  }

  monthlyGrowth(leads) {
    const labels = [];
    const now = new Date();
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      labels.push({
        label: date.toLocaleString("en-US", { month: "short" }),
        year: date.getFullYear(),
        month: date.getMonth(),
        value: 0
      });
    }

    for (const lead of leads) {
      const date = new Date(lead.savedAt || lead.discoveredAt || lead.createdAt || Date.now());
      const bucket = labels.find((item) => item.year === date.getFullYear() && item.month === date.getMonth());
      if (bucket) bucket.value += 1;
    }

    return labels.map(({ label, value }) => ({ label, value }));
  }
}
