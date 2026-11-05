import { CrmService } from "./crmService.js";
import { DashboardService } from "./dashboardService.js";
import { NvidiaService } from "./nvidiaService.js";

function compactLead(lead = {}) {
  return {
    id: lead.id,
    name: lead.name || "Unnamed lead",
    stage: lead.stage || "New",
    score: Number(lead.opportunityScore || lead.audit?.score || 0),
    category: lead.category || lead.businessType || "",
    location: lead.city || lead.location || lead.address || "",
    hasWebsite: Boolean(lead.websiteUrl),
    nextActionAt: lead.nextActionAt || lead.nextFollowUpAt || ""
  };
}

function actionForDailyItem(item = {}) {
  const leadId = encodeURIComponent(String(item.leadId || ""));
  return {
    title: item.title || "Review lead",
    reason: item.reason || "Requires attention.",
    href: leadId ? `/lead-details.html?id=${leadId}` : "/crm.html",
    label: item.actionLabel || "Open lead"
  };
}

/**
 * Account-scoped agent context. It can recommend navigation and work based on
 * real CRM records but deliberately has no write or messaging capability.
 */
export class AiAgentService {
  constructor() {
    this.crm = new CrmService();
    this.dashboard = new DashboardService();
    this.nvidia = new NvidiaService();
  }

  async ask(user, prompt) {
    const [metrics, leads] = await Promise.all([
      this.dashboard.metrics(user),
      this.crm.listLeads(user)
    ]);
    const priorityLeads = [...leads]
      .map(compactLead)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    const context = {
      platform: "MAT LEADS AI PRO X: lead search, CRM, website audits, outreach, analytics and Website Studio.",
      account: {
        role: user?.role || "user",
        plan: user?.planName || user?.subscription || "unknown"
      },
      metrics: {
        savedLeads: metrics.savedLeads,
        contactedLeads: metrics.contactedLeads,
        wonDeals: metrics.wonDeals,
        estimatedRevenue: metrics.estimatedRevenue,
        conversionRate: metrics.conversionRate,
        dailyActionSummary: metrics.dailyActionSummary || {}
      },
      dailyActions: (metrics.dailyActions || []).slice(0, 4).map((item) => ({
        title: item.title,
        leadName: item.leadName,
        reason: item.reason,
        dueAt: item.dueAt || ""
      })),
      priorityLeads: priorityLeads.slice(0, 4)
    };
    const result = await this.nvidia.agentChat(prompt, context);
    return {
      ...result,
      context: {
        metrics: context.metrics,
        actions: (metrics.dailyActions || []).slice(0, 6).map(actionForDailyItem),
        leadCount: leads.length
      }
    };
  }
}
