export const demoLeads = [
  {
    id: "demo-austin-restaurant",
    name: "Local Bistro Group",
    category: "Restaurant",
    address: "118 Congress Ave, Austin, TX",
    phone: "+1 512-555-0148",
    rating: 4.4,
    reviewsCount: 218,
    websiteUrl: "",
    googleMapsLink: "https://maps.google.com/?q=restaurants+in+austin",
    stage: "New",
    estimatedValue: 6400,
    opportunityScore: 92,
    tags: ["website-missing", "restaurant", "high-value"],
    audit: {
      score: 92,
      category: "Very High Opportunity",
      checks: {
        websiteExists: false,
        https: false,
        mobileFriendly: false,
        seoMetadata: false,
        contactForm: false,
        socialLinksFound: false,
        businessEmailDetected: false,
        bookingSystem: false
      }
    }
  },
  {
    id: "demo-dental",
    name: "Northside Dental Studio",
    category: "Dentist",
    address: "501 W 6th St, Austin, TX",
    phone: "+1 512-555-0192",
    rating: 4.8,
    reviewsCount: 94,
    websiteUrl: "https://example.com",
    googleMapsLink: "https://maps.google.com/?q=dentist+in+austin",
    stage: "Proposal Sent",
    estimatedValue: 9200,
    opportunityScore: 76,
    tags: ["seo", "booking", "professional-services"],
    audit: {
      score: 76,
      category: "High Opportunity",
      checks: {
        websiteExists: true,
        https: true,
        mobileFriendly: false,
        seoMetadata: false,
        contactForm: false,
        socialLinksFound: true,
        businessEmailDetected: false,
        bookingSystem: false
      }
    }
  },
  {
    id: "demo-auto",
    name: "Peak Auto Repair",
    category: "Auto Repair",
    address: "820 Airport Blvd, Austin, TX",
    phone: "+1 512-555-0124",
    rating: 4.6,
    reviewsCount: 163,
    websiteUrl: "https://example.org",
    googleMapsLink: "https://maps.google.com/?q=auto+repair+in+austin",
    stage: "Contacted",
    estimatedValue: 4200,
    opportunityScore: 64,
    tags: ["mobile", "local-seo"],
    audit: {
      score: 64,
      category: "High Opportunity",
      checks: {
        websiteExists: true,
        https: true,
        mobileFriendly: false,
        seoMetadata: true,
        contactForm: false,
        socialLinksFound: false,
        businessEmailDetected: false,
        bookingSystem: false
      }
    }
  }
];

export const demoMetrics = {
  totalLeads: 3840,
  savedLeads: 620,
  contactedLeads: 246,
  wonDeals: 38,
  estimatedRevenue: 312000,
  conversionRate: 14,
  monthlyGrowth: [
    { label: "Jan", value: 120 },
    { label: "Feb", value: 180 },
    { label: "Mar", value: 240 },
    { label: "Apr", value: 330 },
    { label: "May", value: 410 },
    { label: "Jun", value: 520 }
  ]
};

export const demoAdminOverview = {
  users: 1280,
  mrr: 84200,
  apiCalls: 481920,
  errors: 12,
  auditLogs: [
    { time: "2026-06-06 08:12", actor: "admin@example.com", action: "Viewed revenue dashboard", ip: "127.0.0.1" },
    { time: "2026-06-06 07:44", actor: "system", action: "Rate limit policy checked", ip: "127.0.0.1" },
    { time: "2026-06-06 07:10", actor: "billing", action: "Stripe webhook endpoint ready", ip: "127.0.0.1" }
  ]
};
