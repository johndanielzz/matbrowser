import { FirestoreRepository } from "../repositories/firestoreRepository.js";

export class AdminService {
  constructor() {
    this.users = new FirestoreRepository("users");
    this.leads = new FirestoreRepository("leads");
    this.activities = new FirestoreRepository("activities");
    this.auditLogs = new FirestoreRepository("auditLogs");
  }

  async overview() {
    const [users, leads, activities, auditLogs] = await Promise.all([
      this.users.list({ limit: 1000 }),
      this.leads.list({ limit: 1000 }),
      this.activities.list({ limit: 1000 }),
      this.auditLogs.list({ limit: 100 })
    ]);

    return {
      users: users.length,
      mrr: 0,
      apiCalls: auditLogs.length,
      errors: auditLogs.filter((log) => log.level === "error").length,
      leads: leads.length,
      activities: activities.length,
      access: {
        plan: "enterprise",
        billingStatus: "admin_unlimited",
        unlimitedAccess: true,
        monthlyLeadLimit: null,
        featuresUnlocked: [
          "Lead Search",
          "CRM",
          "Reports",
          "Analytics",
          "Admin",
          "AI",
          "Billing",
          "Settings"
        ]
      },
      auditLogs: auditLogs.slice(0, 20).map((log) => ({
        time: log.createdAt || log.at || new Date().toISOString(),
        actor: log.actor || "system",
        action: log.action || "event",
        ip: log.ip || "local"
      }))
    };
  }
}
