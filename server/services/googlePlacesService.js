import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const supportedCountries = new Map([
  ["United States", "US"],
  ["Canada", "CA"],
  ["United Kingdom", "GB"],
  ["Ireland", "IE"],
  ["Germany", "DE"],
  ["France", "FR"],
  ["Spain", "ES"],
  ["Italy", "IT"],
  ["Portugal", "PT"],
  ["Netherlands", "NL"],
  ["Belgium", "BE"],
  ["Switzerland", "CH"],
  ["Austria", "AT"],
  ["Poland", "PL"],
  ["Czech Republic", "CZ"],
  ["Finland", "FI"],
  ["Sweden", "SE"],
  ["Norway", "NO"],
  ["Denmark", "DK"],
  ["Australia", "AU"],
  ["New Zealand", "NZ"],
  ["Singapore", "SG"],
  ["Hong Kong", "HK"],
  ["Taiwan", "TW"],
  ["Japan", "JP"],
  ["South Korea", "KR"],
  ["India", "IN"],
  ["Mexico", "MX"],
  ["Brazil", "BR"],
  ["Argentina", "AR"],
  ["Chile", "CL"],
  ["Colombia", "CO"],
  ["Peru", "PE"],
  ["Panama", "PA"],
  ["Costa Rica", "CR"],
  ["South Africa", "ZA"],
  ["Nigeria", "NG"],
  ["Ghana", "GH"],
  ["Kenya", "KE"],
  ["Egypt", "EG"],
  ["Morocco", "MA"],
  ["Turkey", "TR"],
  ["Israel", "IL"],
  ["Malaysia", "MY"],
  ["Philippines", "PH"],
  ["Thailand", "TH"],
  ["Vietnam", "VN"],
  ["Indonesia", "ID"],
  ["Senegal", "SN"],
  ["The Gambia", "GM"],
  ["Kuwait", "KW"],
  ["Qatar", "QA"],
  ["Bahrain", "BH"],
  ["Oman", "OM"],
  ["Jordan", "JO"],
  ["United Arab Emirates", "AE"],
  ["Saudi Arabia", "SA"]
]);

const osmElementDetailsCache = new Map();
const OSM_ELEMENT_CACHE_TTL_MS = 60 * 60 * 1000;
// Contact-only searches must inspect more than the first page of map records.
// The detail requests are still batched and rate-limited below, so this expands
// real coverage without turning an interactive search into unbounded scraping.
const STRICT_CONTACT_DETAIL_CANDIDATE_LIMIT = 600;
const OSM_DETAIL_BATCH_CONCURRENCY = 5;
const OSM_DETAIL_BATCH_TIMEOUT_MS = 5000;
// Interactive searches must stay within the serverless deadline, but using a
// single public Overpass mirror makes a whole search fall back to Photon when
// that one mirror is congested. Rotate concurrent market searches across
// mirrors without serial retries that could exceed the response deadline.
const INTERACTIVE_OVERPASS_ENDPOINT_ATTEMPTS = 1;
const STRICT_PHOTON_PAGE_SIZE = 50;
const GOOGLE_TEXT_SEARCH_PAGE_SIZE = 20;
const GOOGLE_TEXT_SEARCH_MAX_RESULTS = 60;
const GOOGLE_TEXT_SEARCH_PAGE_TIMEOUT_MS = 9000;

const profitableMarkets = {
  europe: [
    ["London", 51.5072, -0.1276],
    ["Paris", 48.8566, 2.3522],
    ["Berlin", 52.52, 13.405],
    ["Amsterdam", 52.3676, 4.9041],
    ["Madrid", 40.4168, -3.7038],
    ["Milan", 45.4642, 9.19],
    ["Zurich", 47.3769, 8.5417],
    ["Vienna", 48.2082, 16.3738],
    ["Stockholm", 59.3293, 18.0686],
    ["Dublin", 53.3498, -6.2603],
    ["Copenhagen", 55.6761, 12.5683],
    ["Oslo", 59.9139, 10.7522]
  ],
  "united states": [
    ["New York", 40.7128, -74.006],
    ["Los Angeles", 34.0522, -118.2437],
    ["Chicago", 41.8781, -87.6298],
    ["Houston", 29.7604, -95.3698],
    ["Miami", 25.7617, -80.1918],
    ["Dallas", 32.7767, -96.797],
    ["San Francisco", 37.7749, -122.4194],
    ["Seattle", 47.6062, -122.3321],
    ["Atlanta", 33.749, -84.388],
    ["Boston", 42.3601, -71.0589],
    ["Denver", 39.7392, -104.9903],
    ["Phoenix", 33.4484, -112.074]
  ],
  germany: [
    ["Berlin", 52.52, 13.405],
    ["Munich", 48.1351, 11.582],
    ["Hamburg", 53.5511, 9.9937],
    ["Frankfurt", 50.1109, 8.6821],
    ["Cologne", 50.9375, 6.9603],
    ["Stuttgart", 48.7758, 9.1829]
  ],
  canada: [
    ["Toronto", 43.6532, -79.3832],
    ["Vancouver", 49.2827, -123.1207],
    ["Montreal", 45.5017, -73.5673],
    ["Calgary", 51.0447, -114.0719]
  ],
  australia: [
    ["Sydney", -33.8688, 151.2093],
    ["Melbourne", -37.8136, 144.9631],
    ["Brisbane", -27.4698, 153.0251],
    ["Perth", -31.9523, 115.8613]
  ],
  "united kingdom": [
    ["London", 51.5072, -0.1276],
    ["Manchester", 53.4808, -2.2426],
    ["Birmingham", 52.4862, -1.8904],
    ["Leeds", 53.8008, -1.5491],
    ["Glasgow", 55.8642, -4.2518]
  ],
  ireland: [
    ["Dublin", 53.3498, -6.2603],
    ["Cork", 51.8985, -8.4756],
    ["Galway", 53.2707, -9.0568]
  ],
  france: [
    ["Paris", 48.8566, 2.3522],
    ["Lyon", 45.764, 4.8357],
    ["Marseille", 43.2965, 5.3698],
    ["Nice", 43.7102, 7.262]
  ],
  spain: [
    ["Madrid", 40.4168, -3.7038],
    ["Barcelona", 41.3874, 2.1686],
    ["Valencia", 39.4699, -0.3763],
    ["Seville", 37.3891, -5.9845]
  ],
  italy: [
    ["Milan", 45.4642, 9.19],
    ["Rome", 41.9028, 12.4964],
    ["Florence", 43.7696, 11.2558],
    ["Naples", 40.8518, 14.2681]
  ],
  portugal: [
    ["Lisbon", 38.7223, -9.1393],
    ["Porto", 41.1579, -8.6291],
    ["Faro", 37.0194, -7.9304]
  ],
  netherlands: [
    ["Amsterdam", 52.3676, 4.9041],
    ["Rotterdam", 51.9244, 4.4777],
    ["The Hague", 52.0705, 4.3007]
  ],
  belgium: [
    ["Brussels", 50.8503, 4.3517],
    ["Antwerp", 51.2194, 4.4025],
    ["Ghent", 51.0543, 3.7174]
  ],
  switzerland: [
    ["Zurich", 47.3769, 8.5417],
    ["Geneva", 46.2044, 6.1432],
    ["Basel", 47.5596, 7.5886]
  ],
  austria: [
    ["Vienna", 48.2082, 16.3738],
    ["Salzburg", 47.8095, 13.055],
    ["Graz", 47.0707, 15.4395]
  ],
  poland: [
    ["Warsaw", 52.2297, 21.0122],
    ["Krakow", 50.0647, 19.945],
    ["Wroclaw", 51.1079, 17.0385]
  ],
  "czech republic": [
    ["Prague", 50.0755, 14.4378],
    ["Brno", 49.1951, 16.6068],
    ["Ostrava", 49.8209, 18.2625]
  ],
  finland: [
    ["Helsinki", 60.1699, 24.9384],
    ["Tampere", 61.4978, 23.761],
    ["Turku", 60.4518, 22.2666]
  ],
  sweden: [
    ["Stockholm", 59.3293, 18.0686],
    ["Gothenburg", 57.7089, 11.9746],
    ["Malmo", 55.605, 13.0038]
  ],
  norway: [
    ["Oslo", 59.9139, 10.7522],
    ["Bergen", 60.3913, 5.3221],
    ["Trondheim", 63.4305, 10.3951]
  ],
  denmark: [
    ["Copenhagen", 55.6761, 12.5683],
    ["Aarhus", 56.1629, 10.2039],
    ["Odense", 55.4038, 10.4024]
  ],
  "new zealand": [
    ["Auckland", -36.8509, 174.7645],
    ["Wellington", -41.2865, 174.7762],
    ["Christchurch", -43.5321, 172.6362]
  ],
  singapore: [
    ["Singapore", 1.3521, 103.8198]
  ],
  "hong kong": [
    ["Central", 22.2819, 114.1588],
    ["Kowloon", 22.3193, 114.1694],
    ["Tsim Sha Tsui", 22.2976, 114.1722]
  ],
  taiwan: [
    ["Taipei", 25.033, 121.5654],
    ["Taichung", 24.1477, 120.6736],
    ["Kaohsiung", 22.6273, 120.3014]
  ],
  japan: [
    ["Tokyo", 35.6762, 139.6503],
    ["Osaka", 34.6937, 135.5023],
    ["Yokohama", 35.4437, 139.638]
  ],
  "south korea": [
    ["Seoul", 37.5665, 126.978],
    ["Busan", 35.1796, 129.0756],
    ["Incheon", 37.4563, 126.7052]
  ],
  india: [
    ["Mumbai", 19.076, 72.8777],
    ["Delhi", 28.6139, 77.209],
    ["Bengaluru", 12.9716, 77.5946],
    ["Hyderabad", 17.385, 78.4867]
  ],
  mexico: [
    ["Mexico City", 19.4326, -99.1332],
    ["Guadalajara", 20.6597, -103.3496],
    ["Monterrey", 25.6866, -100.3161]
  ],
  brazil: [
    ["Sao Paulo", -23.5558, -46.6396],
    ["Rio de Janeiro", -22.9068, -43.1729],
    ["Brasilia", -15.8267, -47.9218]
  ],
  argentina: [
    ["Buenos Aires", -34.6037, -58.3816],
    ["Cordoba", -31.4201, -64.1888],
    ["Rosario", -32.9442, -60.6505]
  ],
  chile: [
    ["Santiago", -33.4489, -70.6693],
    ["Valparaiso", -33.0472, -71.6127],
    ["Concepcion", -36.8201, -73.0444]
  ],
  colombia: [
    ["Bogota", 4.711, -74.0721],
    ["Medellin", 6.2442, -75.5812],
    ["Cali", 3.4516, -76.532]
  ],
  peru: [
    ["Lima", -12.0464, -77.0428],
    ["Arequipa", -16.409, -71.5375],
    ["Cusco", -13.5319, -71.9675]
  ],
  panama: [
    ["Panama City", 8.9824, -79.5199],
    ["David", 8.4273, -82.4308],
    ["Colon", 9.3548, -79.9001]
  ],
  "costa rica": [
    ["San Jose", 9.9281, -84.0907],
    ["Escazu", 9.9189, -84.1397],
    ["Liberia", 10.6346, -85.4407]
  ],
  "south africa": [
    ["Johannesburg", -26.2041, 28.0473],
    ["Cape Town", -33.9249, 18.4241],
    ["Durban", -29.8587, 31.0218]
  ],
  nigeria: [
    ["Lagos", 6.5244, 3.3792],
    ["Abuja", 9.0765, 7.3986],
    ["Port Harcourt", 4.8156, 7.0498]
  ],
  ghana: [
    ["Accra", 5.6037, -0.187],
    ["Kumasi", 6.6666, -1.6163],
    ["Takoradi", 4.9016, -1.7831]
  ],
  kenya: [
    ["Nairobi", -1.2921, 36.8219],
    ["Mombasa", -4.0435, 39.6682],
    ["Kisumu", -0.0917, 34.768]
  ],
  egypt: [
    ["Cairo", 30.0444, 31.2357],
    ["Alexandria", 31.2001, 29.9187],
    ["Giza", 30.0131, 31.2089]
  ],
  morocco: [
    ["Casablanca", 33.5731, -7.5898],
    ["Marrakesh", 31.6295, -7.9811],
    ["Rabat", 34.0209, -6.8416]
  ],
  turkey: [
    ["Istanbul", 41.0082, 28.9784],
    ["Ankara", 39.9334, 32.8597],
    ["Izmir", 38.4237, 27.1428]
  ],
  israel: [
    ["Tel Aviv", 32.0853, 34.7818],
    ["Jerusalem", 31.7683, 35.2137],
    ["Haifa", 32.794, 34.9896]
  ],
  malaysia: [
    ["Kuala Lumpur", 3.1319, 101.6841],
    ["Penang", 5.4141, 100.3288],
    ["Johor Bahru", 1.4927, 103.7414]
  ],
  philippines: [
    ["Manila", 14.5995, 120.9842],
    ["Cebu City", 10.3157, 123.8854],
    ["Davao City", 7.1907, 125.4553]
  ],
  thailand: [
    ["Bangkok", 13.7563, 100.5018],
    ["Chiang Mai", 18.7883, 98.9853],
    ["Phuket", 7.8804, 98.3923]
  ],
  vietnam: [
    ["Ho Chi Minh City", 10.8231, 106.6297],
    ["Hanoi", 21.0278, 105.8342],
    ["Da Nang", 16.0544, 108.2022]
  ],
  indonesia: [
    ["Jakarta", -6.2088, 106.8456],
    ["Surabaya", -7.2575, 112.7521],
    ["Bali", -8.4095, 115.1889]
  ],
  senegal: [
    ["Dakar", 14.7167, -17.4677],
    ["Thies", 14.791, -16.9359],
    ["Saly", 14.438, -17.0105]
  ],
  gambia: [
    ["Banjul", 13.4549, -16.579],
    ["Serrekunda", 13.4432, -16.6819],
    ["Brikama", 13.2714, -16.6494]
  ],
  kuwait: [
    ["Kuwait City", 29.3759, 47.9774],
    ["Salmiya", 29.3339, 48.0761],
    ["Hawally", 29.3375, 48.0286]
  ],
  qatar: [
    ["Doha", 25.2854, 51.531],
    ["Al Rayyan", 25.2919, 51.4244],
    ["Lusail", 25.4164, 51.4904]
  ],
  bahrain: [
    ["Manama", 26.2285, 50.586],
    ["Riffa", 26.129, 50.555],
    ["Muharraq", 26.2572, 50.6119]
  ],
  oman: [
    ["Muscat", 23.588, 58.3829],
    ["Salalah", 17.0194, 54.0897],
    ["Sohar", 24.342, 56.7299]
  ],
  jordan: [
    ["Amman", 31.9539, 35.9106],
    ["Irbid", 32.5556, 35.85],
    ["Aqaba", 29.5319, 35.0061]
  ],
  "united arab emirates": [
    ["Dubai", 25.2048, 55.2708],
    ["Abu Dhabi", 24.4539, 54.3773],
    ["Sharjah", 25.3463, 55.4209]
  ],
  "saudi arabia": [
    ["Riyadh", 24.7136, 46.6753],
    ["Jeddah", 21.5433, 39.1728],
    ["Dammam", 26.4207, 50.0888]
  ]
};

const businessProfiles = {
  restaurants: {
    label: "Restaurant",
    aliases: ["restaurant", "restaurants", "resturant", "resturants", "food", "dining", "cafe", "bar"],
    filters: [["amenity", "restaurant"], ["amenity", "cafe"], ["amenity", "fast_food"], ["amenity", "bar"], ["amenity", "pub"]]
  },
  coffee_shops: {
    label: "Coffee Shop",
    aliases: ["coffee", "coffee shop", "cafe", "espresso"],
    filters: [["amenity", "cafe"], ["shop", "coffee"]]
  },
  bakeries: {
    label: "Bakery",
    aliases: ["bakery", "bakeries", "pastry", "cake shop"],
    filters: [["shop", "bakery"], ["shop", "pastry"], ["shop", "confectionery"]]
  },
  hotels: {
    label: "Hotel",
    aliases: ["hotel", "hotels", "motel", "guest house", "guesthouse", "hostel", "lodging", "resort"],
    filters: [["tourism", "hotel"], ["tourism", "motel"], ["tourism", "guest_house"], ["tourism", "hostel"], ["tourism", "apartment"], ["tourism", "resort"]]
  },
  boutiques: {
    label: "Boutique",
    aliases: ["boutique", "botique", "boutiques", "clothing", "fashion", "apparel", "dress", "shoes"],
    filters: [["shop", "boutique"], ["shop", "clothes"], ["shop", "fashion"], ["shop", "shoes"], ["shop", "bag"], ["shop", "fabric"]]
  },
  car_dealers: {
    label: "Car Dealer",
    aliases: ["car dealer", "car dealers", "dealership", "auto sales", "vehicle sales", "cars"],
    filters: [["shop", "car"], ["shop", "motorcycle"], ["shop", "car_parts"], ["amenity", "car_rental"]]
  },
  car_wash: {
    label: "Car Wash",
    aliases: ["car wash", "detailing", "auto detailing"],
    filters: [["amenity", "car_wash"], ["shop", "car_repair"]]
  },
  auto_repair: {
    label: "Auto Repair",
    aliases: ["auto repair", "mechanic", "garage", "tyres", "tires", "car wash"],
    filters: [["shop", "car_repair"], ["shop", "tyres"], ["shop", "car_parts"], ["amenity", "car_wash"], ["craft", "mechanic"]]
  },
  beauty_spas: {
    label: "Beauty & Spa",
    aliases: ["beauty", "spa", "salon", "hair", "barber", "cosmetics", "nails"],
    filters: [["shop", "beauty"], ["shop", "hairdresser"], ["shop", "cosmetics"], ["shop", "perfumery"], ["amenity", "spa"], ["craft", "beauty"]]
  },
  dental: {
    label: "Dentist",
    aliases: ["dentist", "dentists", "dental", "orthodontist"],
    filters: [["amenity", "dentist"], ["healthcare", "dentist"]]
  },
  medical: {
    label: "Medical Clinic",
    aliases: ["doctor", "doctors", "clinic", "medical", "healthcare", "physiotherapy"],
    filters: [["amenity", "doctors"], ["amenity", "clinic"], ["healthcare", "doctor"], ["healthcare", "clinic"], ["healthcare", "physiotherapist"]]
  },
  gyms: {
    label: "Gym & Fitness",
    aliases: ["gym", "gyms", "fitness", "yoga", "pilates", "trainer"],
    filters: [["leisure", "fitness_centre"], ["leisure", "sports_centre"], ["sport", "fitness"], ["amenity", "gym"]]
  },
  real_estate: {
    label: "Real Estate Agency",
    aliases: ["real estate", "realtor", "estate agent", "property"],
    filters: [["office", "estate_agent"], ["shop", "estate_agent"]]
  },
  law: {
    label: "Law Firm",
    aliases: ["law", "lawyer", "lawyers", "attorney", "legal", "notary"],
    filters: [["office", "lawyer"], ["office", "notary"]]
  },
  accounting: {
    label: "Accountant",
    aliases: ["accountant", "accountants", "tax", "bookkeeping", "payroll"],
    filters: [["office", "accountant"], ["office", "tax_advisor"], ["office", "financial"]]
  },
  marketing_agencies: {
    label: "Marketing Agency",
    aliases: ["marketing", "agency", "advertising", "design agency", "seo", "media agency"],
    filters: [["office", "advertising_agency"], ["office", "it"], ["office", "company"]]
  },
  contractors: {
    label: "Contractor",
    aliases: ["contractor", "construction", "builder", "roofer", "painter", "carpenter"],
    filters: [["craft", "builder"], ["craft", "carpenter"], ["craft", "roofer"], ["craft", "painter"], ["shop", "hardware"]]
  },
  roofing: {
    label: "Roofing Contractor",
    aliases: ["roof", "roofer", "roofing"],
    filters: [["craft", "roofer"], ["craft", "builder"]]
  },
  hvac: {
    label: "HVAC Contractor",
    aliases: ["hvac", "air conditioning", "heating", "ventilation"],
    filters: [["craft", "hvac"], ["shop", "heating"], ["shop", "air_conditioning"]]
  },
  plumbers_electricians: {
    label: "Plumber & Electrician",
    aliases: ["plumber", "plumbers", "electrician", "electricians", "hvac"],
    filters: [["craft", "plumber"], ["craft", "electrician"], ["craft", "hvac"], ["shop", "electrical"]]
  },
  pharmacies: {
    label: "Pharmacy",
    aliases: ["pharmacy", "pharmacies", "chemist", "drugstore"],
    filters: [["amenity", "pharmacy"], ["shop", "chemist"]]
  },
  veterinary: {
    label: "Veterinarian",
    aliases: ["vet", "vets", "veterinarian", "veterinary", "animal clinic"],
    filters: [["amenity", "veterinary"], ["healthcare", "veterinary"]]
  },
  schools: {
    label: "Private School",
    aliases: ["school", "schools", "academy", "training", "language school", "music school"],
    filters: [["amenity", "school"], ["amenity", "language_school"], ["amenity", "music_school"], ["office", "educational_institution"]]
  },
  daycare: {
    label: "Daycare",
    aliases: ["daycare", "childcare", "kindergarten", "nursery"],
    filters: [["amenity", "childcare"], ["amenity", "kindergarten"]]
  },
  retail: {
    label: "Retail Store",
    aliases: ["retail", "store", "shop", "supermarket", "grocery", "bakery"],
    filters: [["shop", "supermarket"], ["shop", "convenience"], ["shop", "bakery"], ["shop", "butcher"], ["shop", "greengrocer"], ["shop", "department_store"]]
  },
  jewelers: {
    label: "Jeweler",
    aliases: ["jeweler", "jewellery", "jewelry", "watch"],
    filters: [["shop", "jewelry"], ["shop", "watches"]]
  },
  furniture: {
    label: "Furniture Store",
    aliases: ["furniture", "home decor", "interior"],
    filters: [["shop", "furniture"], ["shop", "interior_decoration"], ["shop", "kitchen"]]
  },
  electronics: {
    label: "Electronics Store",
    aliases: ["electronics", "computer", "phone shop", "mobile phone"],
    filters: [["shop", "electronics"], ["shop", "computer"], ["shop", "mobile_phone"]]
  },
  travel_agencies: {
    label: "Travel Agency",
    aliases: ["travel", "tour", "tourism agency", "travel agency"],
    filters: [["shop", "travel_agency"], ["office", "travel_agent"], ["tourism", "information"]]
  },
  event_venues: {
    label: "Event Venue",
    aliases: ["event", "venue", "wedding", "conference", "banquet"],
    filters: [["amenity", "events_venue"], ["amenity", "conference_centre"], ["amenity", "community_centre"]]
  },
  finance_insurance: {
    label: "Finance & Insurance",
    aliases: ["insurance", "finance", "financial advisor", "bank", "broker"],
    filters: [["office", "insurance"], ["office", "financial_advisor"], ["amenity", "bank"], ["office", "financial"]]
  },
  laundromats: {
    label: "Laundromat",
    aliases: ["laundry", "laundromat", "dry cleaning", "dry cleaner"],
    filters: [["shop", "laundry"], ["shop", "dry_cleaning"]]
  },
  moving_storage: {
    label: "Moving & Storage",
    aliases: ["moving", "storage", "self storage", "movers"],
    filters: [["shop", "storage_rental"], ["amenity", "storage"], ["office", "logistics"]]
  },
  coworking: {
    label: "Coworking Space",
    aliases: ["coworking", "co-working", "shared office", "workspace"],
    filters: [["office", "coworking"], ["amenity", "coworking_space"]]
  },
  photographers: {
    label: "Photographer",
    aliases: ["photographer", "photography", "photo studio"],
    filters: [["craft", "photographer"], ["shop", "photo"]]
  }
};

const defaultBusinessProfileKeys = [
  "restaurants",
  "coffee_shops",
  "bakeries",
  "hotels",
  "boutiques",
  "car_dealers",
  "car_wash",
  "auto_repair",
  "beauty_spas",
  "dental",
  "medical",
  "gyms",
  "real_estate",
  "law",
  "accounting",
  "contractors",
  "roofing",
  "hvac",
  "pharmacies",
  "retail",
  "laundromats",
  "moving_storage"
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function freshOrder(values, seed, namespace = "item") {
  if (!seed) return [...values];
  return [...values]
    .map((value, index) => ({
      value,
      rank: hashString(`${namespace}:${seed}:${JSON.stringify(value)}:${index}`)
    }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ value }) => value);
}

function marketKey(placeName) {
  return normalize(placeName)
    .replace(/^the /, "")
    .replace(/\bof\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function supportedCountryName(value) {
  const key = marketKey(value);
  return [...supportedCountries.keys()].find((country) => marketKey(country) === key || normalize(country) === normalize(value)) || "";
}

function selectedCountryNames(search) {
  const values = [
    ...(Array.isArray(search.countries) ? search.countries : []),
    search.country
  ].filter(Boolean);
  return unique(values.map(supportedCountryName));
}

function unsupportedCountryNames(search) {
  const values = unique([
    ...(Array.isArray(search.countries) ? search.countries : []),
    search.country
  ].filter(Boolean));
  return values.filter((country) => !supportedCountryName(country));
}

function countryCodesFor(names) {
  return names.map((name) => supportedCountries.get(name)).filter(Boolean);
}

function countryNameForCode(code) {
  const normalized = String(code || "").toUpperCase();
  return [...supportedCountries.entries()].find(([, countryCode]) => countryCode === normalized)?.[0] || "";
}

function displayCountry(tags = {}, context = {}) {
  const code = tagValue(tags, ["addr:country", "ISO3166-1", "is_in:country_code"]);
  const explicitCountry = tagValue(tags, ["is_in:country"]);
  return explicitCountry || countryNameForCode(code) || context.countryName || "";
}

function displayCountryCode(tags = {}, context = {}) {
  return tagValue(tags, ["addr:country", "ISO3166-1", "is_in:country_code"]) || context.countryCode || "";
}

function marketsForCountries(countryNames) {
  return countryNames.flatMap((countryName) => {
    const key = marketKey(countryName);
    return (profitableMarkets[key] || []).map(([name, latitude, longitude]) => ({
      name,
      latitude,
      longitude,
      countryName,
      countryCode: supportedCountries.get(countryName)
    }));
  });
}

function normalizeMarketEntry(market) {
  return Array.isArray(market)
    ? { name: market[0], latitude: market[1], longitude: market[2] }
    : market;
}

function profileKeyFromValue(value) {
  const normalized = normalize(value);
  if (businessProfiles[normalized]) return normalized;
  return Object.entries(businessProfiles).find(([key, profile]) => (
    normalize(key) === normalized || profile.aliases.some((alias) => normalized.includes(normalize(alias)))
  ))?.[0] || "";
}

function textProfileKeys(search) {
  const text = normalize(`${search.industry || ""} ${search.keyword || ""}`);
  if (!text || ["business", "businesses", "website", "websites", "website redesign", "lead", "leads"].includes(text)) return [];
  return Object.entries(businessProfiles)
    .filter(([, profile]) => profile.aliases.some((alias) => text.includes(normalize(alias))))
    .map(([key]) => key);
}

function selectedBusinessProfileKeys(search) {
  const explicit = unique((Array.isArray(search.businessTypes) ? search.businessTypes : [])
    .map(profileKeyFromValue));
  const inferred = textProfileKeys(search);
  const keys = explicit.length ? unique([...explicit, ...inferred]) : inferred;
  return keys.length ? keys : defaultBusinessProfileKeys;
}

function searchDepthConfig(search = {}) {
  const depth = search.searchDepth || "deep";
  const configs = {
    quick: { maxMarkets: 2, marketsPerCountry: 1, perMarketMin: 3, marketRadius: 3000, overpassTimeout: 10, outMultiplier: 8 },
    standard: { maxMarkets: 5, marketsPerCountry: 2, perMarketMin: 4, marketRadius: 5000, overpassTimeout: 12, outMultiplier: 10 },
    deep: { maxMarkets: 10, marketsPerCountry: 3, perMarketMin: 5, marketRadius: 8000, overpassTimeout: 16, outMultiplier: 14 },
    maximum: { maxMarkets: 18, marketsPerCountry: 4, perMarketMin: 6, marketRadius: 12000, overpassTimeout: 20, outMultiplier: 18 }
  };
  const config = configs[depth] || configs.deep;
  // Dashboard searches run behind an interactive/serverless response deadline.
  // Keep external-provider fan-out bounded; full enrichment belongs on saved
  // lead detail views, not the initial result request.
  if (search.interactive !== true) return config;
  const strictDataSearch = Boolean(
    (search.requireContact || search.leadQuality === "contact_ready" || search.leadQuality === "owner_data")
    && (search.missingWebsiteOnly || search.leadQuality === "needs_website")
  );
  return {
    ...config,
    // Strict contact + missing-site searches have a much lower match rate.
    // They therefore get a wider, bounded market sample.  This is important
    // in serverless production where one slow public map mirror can otherwise
    // leave a legitimate 50-result request looking like a five-result cap.
    maxMarkets: Math.min(config.maxMarkets, strictDataSearch ? 10 : 6),
    marketsPerCountry: Math.min(config.marketsPerCountry, strictDataSearch ? 3 : 2),
    overpassTimeout: Math.min(config.overpassTimeout, 8)
  };
}

function buildTextQuery(search) {
  const businessLabels = selectedBusinessProfileKeys(search)
    .slice(0, 6)
    .map((key) => businessProfiles[key]?.label)
    .filter(Boolean);
  const text = [
    search.keyword,
    search.industry,
    businessLabels.join(", "),
    search.city,
    search.state,
    search.zip,
    selectedCountryNames(search).join(", ")
  ].filter(Boolean).join(" ").trim();
  return text || "target businesses";
}

function parseGoogleMapsLink(mapLink) {
  if (!mapLink) return null;
  const decoded = decodeURIComponent(mapLink);
  const placeSlugMatch = /\/maps\/place\/([^/@?]+)/i.exec(decoded);
  const placeName = placeSlugMatch
    ? placeSlugMatch[1].replace(/\+/g, " ").replace(/%20/g, " ").trim()
    : "";
  const placeMatch = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i.exec(decoded);
  if (placeMatch) {
    const viewportMatch = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/i.exec(decoded);
    return {
      latitude: Number(placeMatch[1]),
      longitude: Number(placeMatch[2]),
      zoom: viewportMatch?.[3] ? Number(viewportMatch[3]) : null,
      source: "place_coordinates",
      placeName
    };
  }

  const atMatch = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/i.exec(decoded);
  if (atMatch) {
    return {
      latitude: Number(atMatch[1]),
      longitude: Number(atMatch[2]),
      zoom: atMatch[3] ? Number(atMatch[3]) : null,
      source: "viewport_coordinates",
      placeName
    };
  }

  const queryMatch = /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(decoded);
  if (queryMatch) {
    return {
      latitude: Number(queryMatch[1]),
      longitude: Number(queryMatch[2]),
      zoom: null,
      source: "query_coordinates"
    };
  }

  return null;
}

async function resolveGoogleMapsLink(mapLink) {
  if (!mapLink) return "";
  try {
    const url = new URL(mapLink);
    const host = url.hostname.toLowerCase();
    const canResolve = ["maps.app.goo.gl", "goo.gl"].includes(host);
    if (!canResolve || !["http:", "https:"].includes(url.protocol)) return mapLink;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "MATLeadsAIProX/1.0"
        }
      });
      return response.url || mapLink;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return mapLink;
  }
}

function isLegacyDefaultMapLink(mapLink) {
  const normalized = decodeURIComponent(String(mapLink || "")).trim();
  return normalized.includes("@13.4053888,-16.6887424,11z");
}

function zoomToRadiusMeters(zoom) {
  if (!Number.isFinite(zoom)) return null;
  if (zoom >= 15) return 2500;
  if (zoom >= 13) return 6000;
  if (zoom >= 11) return 15000;
  if (zoom >= 9) return 30000;
  return 50000;
}

function searchLocation(search) {
  const parsed = parseGoogleMapsLink(search.mapLink);
  const latitude = parsed?.latitude ?? search.latitude;
  const longitude = parsed?.longitude ?? search.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    zoom: parsed?.zoom || null,
    radiusMeters: Math.min(search.radiusMeters || zoomToRadiusMeters(parsed?.zoom) || 15000, 50000),
    mapLink: search.mapLink || `https://www.google.com/maps/@${latitude},${longitude},12z`,
    coordinateSource: parsed?.source || "manual_coordinates",
    placeName: parsed?.placeName || ""
  };
}

function broadMarketsFor(location) {
  if (!location?.placeName) return null;
  const key = marketKey(location.placeName);
  if (profitableMarkets[key]) return profitableMarkets[key].map(([name, latitude, longitude]) => ({ name, latitude, longitude }));
  if (location.zoom && location.zoom <= 5 && key.includes("europe")) {
    return profitableMarkets.europe.map(([name, latitude, longitude]) => ({ name, latitude, longitude }));
  }
  if (location.zoom && location.zoom <= 5 && key.includes("united states")) {
    return profitableMarkets["united states"].map(([name, latitude, longitude]) => ({ name, latitude, longitude, countryName: "United States", countryCode: "US" }));
  }
  return null;
}

function tagValue(tags, keys) {
  for (const key of keys) {
    if (tags?.[key]) return tags[key];
  }
  return "";
}

const businessPhoneKeys = [
  "phone",
  "contact:phone",
  "telephone",
  "contact:telephone",
  "phone:main",
  "phone:office",
  "contact:office_phone",
  "addr:phone"
];

const businessMobileKeys = [
  "mobile",
  "contact:mobile",
  "contact:cell",
  "phone:mobile",
  "phone:whatsapp",
  "contact:whatsapp"
];

function cleanPhone(value) {
  const candidates = String(value || "")
    .split(/[;|]+/)
    .map((item) => item.replace(/[^\d+()\-\s]/g, "").replace(/\s+/g, " ").trim())
    .filter((item) => {
      const digits = item.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 16;
    });
  // Prefer numbers with international prefix (+), then longer numbers
  return candidates.sort((a, b) => {
    const aHasPlus = a.startsWith("+") ? 1 : 0;
    const bHasPlus = b.startsWith("+") ? 1 : 0;
    if (aHasPlus !== bHasPlus) return bHasPlus - aHasPlus;
    return b.replace(/\D/g, "").length - a.replace(/\D/g, "").length;
  })[0] || "";
}

function phoneFromTags(tags = {}) {
  return cleanPhone(tagValue(tags, businessPhoneKeys));
}

function mobileFromTags(tags = {}) {
  return cleanPhone(tagValue(tags, businessMobileKeys));
}

function splitTagValues(value) {
  return String(value || "").split(";").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function tagMatchesFilter(tags, [key, value]) {
  if (!tags?.[key]) return false;
  return splitTagValues(tags[key]).includes(String(value).toLowerCase());
}

function profileFromTags(tags = {}, profileKeys = Object.keys(businessProfiles)) {
  return profileKeys
    .map((key) => ({ key, profile: businessProfiles[key] }))
    .find(({ profile }) => profile?.filters.some((filter) => tagMatchesFilter(tags, filter))) || null;
}

function categoryFromTags(tags = {}, profileKeys) {
  const profileMatch = profileFromTags(tags, profileKeys);
  if (profileMatch) return profileMatch.profile.label;
  const category = tagValue(tags, ["amenity", "shop", "office", "tourism", "craft", "healthcare", "leisure"]);
  return category ? category.replaceAll("_", " ") : "Local business";
}

function addressFromTags(tags = {}) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"] || tags["addr:town"] || tags["addr:village"],
    tags["addr:postcode"],
    tags["addr:country"]
  ].filter(Boolean);
  return parts.join(", ");
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
    return true;
  }));
}

function socialUrlFromValue(platform, value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z]+:\/\//i.test(raw)) return "";
  if (platform === "whatsapp") {
    let digits = raw.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : "";
  }
  const cleaned = raw.replace(/^@/, "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  if (!cleaned) return "";
  if (cleaned.includes(".") && !cleaned.includes(" ")) return `https://${cleaned}`;
  const slug = encodeURIComponent(cleaned);
  const bases = {
    facebook: "https://www.facebook.com/",
    instagram: "https://www.instagram.com/",
    linkedin: "https://www.linkedin.com/company/",
    x: "https://x.com/",
    youtube: "https://www.youtube.com/@",
    tiktok: "https://www.tiktok.com/@",
    pinterest: "https://www.pinterest.com/",
    threads: "https://www.threads.net/@",
    snapchat: "https://www.snapchat.com/add/",
    whatsapp: "https://wa.me/"
  };
  return bases[platform] ? `${bases[platform]}${slug}` : raw;
}

function socialLinksFromTags(tags = {}) {
  const values = {
    facebook: tagValue(tags, ["contact:facebook", "facebook", "facebook:page", "social:facebook", "brand:facebook"]),
    instagram: tagValue(tags, ["contact:instagram", "instagram", "social:instagram", "brand:instagram"]),
    linkedin: tagValue(tags, ["contact:linkedin", "linkedin", "social:linkedin", "brand:linkedin"]),
    x: tagValue(tags, ["contact:twitter", "twitter", "x", "contact:x", "social:twitter", "social:x", "brand:twitter", "brand:x"]),
    youtube: tagValue(tags, ["contact:youtube", "youtube", "social:youtube", "brand:youtube"]),
    tiktok: tagValue(tags, ["contact:tiktok", "tiktok", "social:tiktok", "brand:tiktok"]),
    pinterest: tagValue(tags, ["contact:pinterest", "pinterest", "social:pinterest", "brand:pinterest"]),
    threads: tagValue(tags, ["contact:threads", "threads", "social:threads", "brand:threads"]),
    snapchat: tagValue(tags, ["contact:snapchat", "snapchat", "social:snapchat", "brand:snapchat"]),
    whatsapp: tagValue(tags, ["contact:whatsapp", "whatsapp", "phone:whatsapp", "social:whatsapp"])
  };
  return compactObject({
    facebook: socialUrlFromValue("facebook", values.facebook),
    instagram: socialUrlFromValue("instagram", values.instagram),
    linkedin: socialUrlFromValue("linkedin", values.linkedin),
    x: socialUrlFromValue("x", values.x),
    youtube: socialUrlFromValue("youtube", values.youtube),
    tiktok: socialUrlFromValue("tiktok", values.tiktok),
    pinterest: socialUrlFromValue("pinterest", values.pinterest),
    threads: socialUrlFromValue("threads", values.threads),
    snapchat: socialUrlFromValue("snapchat", values.snapchat),
    whatsapp: socialUrlFromValue("whatsapp", values.whatsapp)
  });
}

function osmDetailsFromTags(tags = {}, coords = {}, element = {}, context = {}) {
  const websiteUrl = tagValue(tags, ["website", "contact:website", "url"]);
  const email = tagValue(tags, ["email", "contact:email"]);
  const phone = phoneFromTags(tags);
  const mobile = mobileFromTags(tags);
  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "";
  const country = displayCountry(tags, context);
  const countryCode = displayCountryCode(tags, context);
  const ownerName = tagValue(tags, ["owner", "contact:owner"]);
  const operator = tagValue(tags, ["operator", "operator:name"]);
  const contactPerson = tagValue(tags, ["contact:person", "contact:name", "contact:contact_person", "manager"]);

  return {
    ownerContact: compactObject({
      ownerName,
      operator,
      contactPerson,
      contactRole: tags["contact:role"],
      publicContactNote: ownerName || operator || contactPerson
        ? "Owner/operator/contact fields were found in public map data."
        : "Owner or direct contact person was not listed in the public map data."
    }),
    contact: compactObject({
      phone,
      mobile,
      email,
      website: websiteUrl,
      fax: tagValue(tags, ["fax", "contact:fax"])
    }),
    social: socialLinksFromTags(tags),
    location: compactObject({
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: addressFromTags(tags),
      houseNumber: tags["addr:housenumber"],
      street: tags["addr:street"],
      city,
      postcode: tags["addr:postcode"],
      country,
      countryCode,
      googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tags.name || tags.brand || ""} ${addressFromTags(tags)}`.trim() || `${coords.latitude},${coords.longitude}`)}`
    }),
    business: compactObject({
      brand: tags.brand,
      ownerName,
      operator,
      cuisine: tags.cuisine,
      branch: tags.branch,
      description: tags.description,
      officialName: tags.official_name,
      altName: tags.alt_name
    }),
    operations: compactObject({
      openingHours: tags.opening_hours,
      delivery: tags.delivery,
      takeaway: tags.takeaway,
      reservation: tags.reservation,
      outdoorSeating: tags.outdoor_seating,
      wheelchair: tags.wheelchair,
      internetAccess: tags.internet_access
    }),
    payments: compactObject({
      cash: tags["payment:cash"],
      cards: tags["payment:cards"],
      visa: tags["payment:visa"],
      mastercard: tags["payment:mastercard"],
      mobilePay: tags["payment:mobile_pay"]
    }),
    source: compactObject({
      provider: "OpenStreetMap Overpass",
      osmType: element.type,
      osmId: element.id,
      osmUrl: element.type && element.id ? `https://www.openstreetmap.org/${element.type}/${element.id}` : "",
      rawTags: tags
    })
  };
}

function osmCoordinates(element) {
  return {
    latitude: element.lat ?? element.center?.lat,
    longitude: element.lon ?? element.center?.lon
  };
}

function mapOsmElement(element, profileKeys, context = {}) {
  const tags = element.tags || {};
  const coords = osmCoordinates(element);
  const name = tags.name || tags.brand || "Unnamed business";
  const profileMatch = profileFromTags(tags, profileKeys);
  const category = categoryFromTags(tags, profileKeys);
  const phone = phoneFromTags(tags) || mobileFromTags(tags);
  const websiteUrl = tagValue(tags, ["website", "contact:website", "url"]);
  const email = tagValue(tags, ["email", "contact:email"]);
  const social = Object.values(socialLinksFromTags(tags))[0] || "";
  const address = addressFromTags(tags);
  const mapsQuery = `${name} ${address}`.trim() || `${name} ${coords.latitude},${coords.longitude}`;
  const country = displayCountry(tags, context);
  const countryCode = displayCountryCode(tags, context);
  const details = osmDetailsFromTags(tags, coords, element, context);

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    category,
    businessType: profileMatch?.profile.label || category,
    address,
    phone,
    rating: null,
    reviewsCount: 0,
    websiteUrl,
    googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
    latitude: coords.latitude,
    longitude: coords.longitude,
    country,
    countryCode,
    email,
    social,
    openingHours: tags.opening_hours || "",
    details,
    source: "openstreetmap_overpass",
    raw: { osmType: element.type, osmId: element.id, tags }
  };
}

function overpassEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function overpassRegexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overpassFiltersForSearch(search) {
  const filters = selectedBusinessProfileKeys(search)
    .flatMap((key) => businessProfiles[key]?.filters || []);
  const seen = new Set();
  return filters.filter(([key, value]) => {
    const id = `${key}:${value}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildOverpassQuery(location, limit, elementTypes = ["node"], search) {
  const depth = searchDepthConfig(search);
  const radius = Math.min(Math.max(Number(location.radiusMeters || 15000), 500), 50000);
  const lat = location.latitude;
  const lon = location.longitude;
  const filters = overpassFiltersForSearch(search);
  const grouped = filters.reduce((groups, [key, value]) => {
    const values = groups.get(key) || new Set();
    values.add(value);
    groups.set(key, values);
    return groups;
  }, new Map());
  // Query broad, relevant businesses first. Public contact and website tags
  // are then verified from batched OSM records before strict filters run. A
  // source-level "no website" / contact regex was less reliable across public
  // Overpass mirrors and could return an empty pool despite real matches.
  const selectors = [...grouped.entries()].flatMap(([key, values]) => {
    const pattern = `^(${[...values].map(overpassRegexEscape).join("|")})$`;
    return elementTypes.map((type) => (
      `${type}(around:${radius},${lat},${lon})["name"]["${overpassEscape(key)}"~"${pattern}"];`
    ));
  });
  const outLimit = Math.min(Math.max(limit * depth.outMultiplier, 80), 500);

  return `[out:json][timeout:${depth.overpassTimeout}];(${selectors.join("")});out center tags ${outLimit};`;
}

function orderedOverpassEndpoints(search = {}, offset = 0) {
  const endpoints = (env.osm.overpassEndpoints || []).filter(Boolean);
  if (!search.interactive || endpoints.length <= 1) return endpoints;

  // Different market searches start on different mirrors. This avoids sending
  // every concurrent city query to the same public endpoint. Each interactive
  // market uses one bounded attempt so a congested endpoint cannot multiply
  // the total response time before Photon is allowed to help.
  const start = Math.abs(Number(offset) || 0) % endpoints.length;
  const rotated = [...endpoints.slice(start), ...endpoints.slice(0, start)];
  const strictDataSearch = Boolean(
    (search.requireContact || search.leadQuality === "contact_ready" || search.leadQuality === "owner_data")
    && (search.missingWebsiteOnly || search.leadQuality === "needs_website")
  );
  // A second mirror is only worthwhile for the sparse strict workflow. It is
  // still bounded and only used after the first mirror yields no results.
  const attempts = strictDataSearch ? 2 : INTERACTIVE_OVERPASS_ENDPOINT_ATTEMPTS;
  return rotated.slice(0, Math.min(attempts, rotated.length));
}

function leadCountryAllowed(lead, countryCodes) {
  if (!countryCodes.length) return true;
  const tags = lead.raw?.tags || {};
  const country = tagValue(tags, ["addr:country", "ISO3166-1", "is_in:country_code"]);
  if (!country) return true;
  return countryCodes.includes(String(country).toUpperCase());
}

function scoreLead(lead, profileKeys) {
  const tags = lead.raw?.tags || {};
  let score = profileFromTags(tags, profileKeys) ? 50 : 0;
  if (!lead.websiteUrl) score += 22;
  if (lead.phone || lead.email) score += 16;
  if (lead.social) score += 6;
  if (lead.address) score += 5;
  if (tags.opening_hours) score += 4;
  if (lead.websiteUrl) score += 3;
  return score;
}

function filterOsmLeads(leads, search) {
  const profileKeys = selectedBusinessProfileKeys(search);
  const countryCodes = countryCodesFor(selectedCountryNames(search));

  return leads
    .filter((lead) => profileFromTags(lead.raw?.tags || {}, profileKeys))
    .filter((lead) => leadCountryAllowed(lead, countryCodes))
    .map((lead) => ({ ...lead, searchRelevance: scoreLead(lead, profileKeys) }))
    .sort((left, right) => right.searchRelevance - left.searchRelevance || left.name.localeCompare(right.name));
}

function viewboxFor(location) {
  const radius = Math.min(Math.max(Number(location.radiusMeters || 3000), 500), 15000);
  const latDelta = radius / 111320;
  const lonDelta = radius / (111320 * Math.max(Math.cos(location.latitude * Math.PI / 180), 0.2));
  return [
    location.longitude - lonDelta,
    location.latitude + latDelta,
    location.longitude + lonDelta,
    location.latitude - latDelta
  ].join(",");
}

function nominatimTerm(profileKey) {
  const terms = {
    restaurants: "restaurant",
    coffee_shops: "coffee shop",
    bakeries: "bakery",
    hotels: "hotel",
    boutiques: "boutique",
    car_dealers: "car dealer",
    car_wash: "car wash",
    auto_repair: "auto repair",
    beauty_spas: "beauty salon",
    dental: "dentist",
    medical: "clinic",
    gyms: "gym",
    real_estate: "real estate agency",
    law: "lawyer",
    accounting: "accountant",
    marketing_agencies: "marketing agency",
    contractors: "contractor",
    roofing: "roofing contractor",
    hvac: "hvac contractor",
    plumbers_electricians: "plumber",
    pharmacies: "pharmacy",
    veterinary: "veterinary",
    schools: "private school",
    daycare: "daycare",
    retail: "retail store",
    jewelers: "jewelry",
    furniture: "furniture store",
    electronics: "electronics store",
    travel_agencies: "travel agency",
    event_venues: "event venue",
    finance_insurance: "insurance",
    laundromats: "laundromat",
    moving_storage: "self storage",
    coworking: "coworking space",
    photographers: "photographer"
  };
  return terms[profileKey] || businessProfiles[profileKey]?.label || "business";
}

function mapNominatimPlace(place, profileKey, context = {}) {
  const profile = businessProfiles[profileKey];
  const tags = place.extratags || {};
  const latitude = Number(place.lat);
  const longitude = Number(place.lon);
  const name = place.namedetails?.name || place.name || String(place.display_name || "Unknown business").split(",")[0];
  const phone = phoneFromTags(tags) || mobileFromTags(tags);
  const websiteUrl = tagValue(tags, ["website", "contact:website", "url"]);
  const email = tagValue(tags, ["email", "contact:email"]);
  const social = Object.values(socialLinksFromTags(tags))[0] || "";
  const address = place.display_name || "";
  const mapsQuery = `${name} ${address}`.trim() || `${name} ${latitude},${longitude}`;
  const country = displayCountry(tags, context);
  const countryCode = displayCountryCode(tags, context);
  const details = {
    ...osmDetailsFromTags(tags, { latitude, longitude }, { type: place.osm_type, id: place.osm_id }, context),
    source: compactObject({
      provider: "OpenStreetMap Nominatim",
      osmType: place.osm_type,
      osmId: place.osm_id,
      osmUrl: place.osm_type && place.osm_id ? `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}` : "",
      placeRank: place.place_rank,
      importance: place.importance,
      rawTags: tags
    })
  };

  return {
    id: `nominatim-${place.osm_type}-${place.osm_id}`,
    name,
    category: profile?.label || place.type || "Local business",
    businessType: profile?.label || place.type || "Local business",
    address,
    phone,
    rating: null,
    reviewsCount: 0,
    websiteUrl,
    googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
    latitude,
    longitude,
    country,
    countryCode,
    email,
    social,
    openingHours: tags.opening_hours || "",
    details,
    source: "openstreetmap_nominatim",
    raw: { osmType: place.osm_type, osmId: place.osm_id, tags, nominatim: place }
  };
}

function photonOsmType(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "N") return "node";
  if (normalized === "W") return "way";
  if (normalized === "R") return "relation";
  return "node";
}

function photonTagsFromFeature(feature, profileKey) {
  const properties = feature.properties || {};
  const fallbackFilter = businessProfiles[profileKey]?.filters?.[0] || ["shop", "yes"];
  const osmKey = properties.osm_key || fallbackFilter[0];
  const osmValue = properties.osm_value || fallbackFilter[1];
  return compactObject({
    name: properties.name,
    [osmKey]: osmValue,
    "addr:housenumber": properties.housenumber,
    "addr:street": properties.street,
    "addr:city": properties.city || properties.locality || properties.district,
    "addr:postcode": properties.postcode,
    "addr:country": String(properties.countrycode || "").toUpperCase(),
    "is_in:country": properties.country
  });
}

function mapPhotonFeature(feature, profileKey, context = {}) {
  const properties = feature.properties || {};
  const coordinates = feature.geometry?.coordinates || [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  const type = photonOsmType(properties.osm_type);
  const id = properties.osm_id || `${profileKey}-${latitude}-${longitude}`;
  const tags = photonTagsFromFeature(feature, profileKey);
  const lead = mapOsmElement({
    type,
    id,
    lat: latitude,
    lon: longitude,
    tags
  }, [profileKey], context);

  return {
    ...lead,
    id: `photon-${type}-${id}`,
    source: "openstreetmap_photon",
    details: {
      ...lead.details,
      source: compactObject({
        ...(lead.details?.source || {}),
        provider: "OpenStreetMap Photon",
        osmType: type,
        osmId: id,
        osmUrl: type && id ? `https://www.openstreetmap.org/${type}/${id}` : "",
        photonProperties: properties,
        rawTags: tags
      })
    },
    raw: { osmType: type, osmId: id, tags, photon: feature }
  };
}

async function searchPhotonFallback(search, location, limitOverride, profileKeys) {
  if (!location) return [];
  const selectedCountries = selectedCountryNames(search);
  const countryCodes = countryCodesFor(selectedCountries);
  const fallbackCountryName = location.countryName || selectedCountries[0] || "";
  const fallbackCountryCode = location.countryCode || countryCodes[0] || "";
  const orderedProfileKeys = freshOrder(profileKeys, search.refreshSeed, "photon-profile");
  const strictContactSearch = Boolean(search.requireContact || search.leadQuality === "contact_ready" || search.leadQuality === "owner_data");
  const strictMissingWebsiteSearch = Boolean(search.missingWebsiteOnly || search.leadQuality === "needs_website");
  const strictDataSearch = strictContactSearch && strictMissingWebsiteSearch;
  // When the user asks for contact-ready leads, do not let the first two
  // categories consume every fallback slot. Sample every selected vertical so
  // the later OSM-detail enrichment has a broader, genuinely relevant pool.
  const profileCount = strictContactSearch
    ? Math.min(orderedProfileKeys.length, search.interactive ? 3 : 8)
    : Math.min(orderedProfileKeys.length, search.interactive ? 2 : 8);
  const perProfileLimit = strictContactSearch
    ? Math.max(4, Math.ceil(limitOverride / Math.max(profileCount, 1)))
    : limitOverride;
  const collected = [];
  const seen = new Set();

  for (const profileKey of orderedProfileKeys.slice(0, profileCount)) {
    if (collected.length >= limitOverride) break;
    let profileCollected = 0;
    const profileFilters = businessProfiles[profileKey]?.filters || [];
    const filters = [
      ...profileFilters.slice(0, 1),
      ...freshOrder(profileFilters.slice(1), search.refreshSeed, `photon-filter-${profileKey}`)
    // A website-gap search is sparse by design. Sample a second closely
    // related OSM category (for example restaurant + cafe) before filtering
    // so the requested result count is realistically attainable on Vercel.
    ].slice(0, search.interactive ? (strictMissingWebsiteSearch ? 2 : 1) : 6);

    for (const [osmKey, osmValue] of filters) {
      if (collected.length >= limitOverride || profileCollected >= perProfileLimit) break;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), search.interactive ? 4000 : 10000);
      try {
        const url = new URL("https://photon.komoot.io/api/");
        url.searchParams.set("q", nominatimTerm(profileKey));
        url.searchParams.set("lat", String(location.latitude));
        url.searchParams.set("lon", String(location.longitude));
        // Photon is a no-key fallback. A contact + missing-website search must
        // inspect a wider real candidate page before OSM detail verification;
        // otherwise a selected 20 can be reduced to a handful simply because
        // Photon returned its old first 20 features for a city.
        // "Needs Website" also needs a wider raw page. Website URLs are often
        // absent from public map records, so keeping its fallback at 20 made a
        // selected 50 look like a three-to-twenty result cap on Vercel.
        const pageSize = (strictDataSearch || strictMissingWebsiteSearch)
          ? STRICT_PHOTON_PAGE_SIZE
          : 20;
        url.searchParams.set("limit", String(Math.min(pageSize, Math.max(1, Math.min(limitOverride - collected.length, perProfileLimit - profileCollected)))));
        url.searchParams.set("lang", "en");
        url.searchParams.append("osm_tag", `${osmKey}:${osmValue}`);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "User-Agent": "MATLeadsAIProX/1.0"
          }
        });
        if (!response.ok) continue;

        const payload = await response.json();
        for (const feature of payload.features || []) {
          const lead = mapPhotonFeature(feature, profileKey, {
            countryName: fallbackCountryName,
            countryCode: fallbackCountryCode
          });
          if (!lead.name || !Number.isFinite(lead.latitude) || !Number.isFinite(lead.longitude)) continue;
          if (countryCodes.length && lead.countryCode && !countryCodes.includes(String(lead.countryCode).toUpperCase())) continue;
          const key = normalize(`${lead.name}-${lead.latitude.toFixed(5)}-${lead.longitude.toFixed(5)}`);
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push({ ...lead, searchRelevance: scoreLead(lead, profileKeys) });
          profileCollected += 1;
          if (collected.length >= limitOverride || profileCollected >= perProfileLimit) break;
        }
      } catch {
        // Photon is a no-key OSM fallback; failed mirror calls should not mask other provider attempts.
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  return collected;
}

async function searchNominatimFallback(search, location, limitOverride, profileKeys) {
  if (!location) return [];
  const selectedCountries = selectedCountryNames(search);
  const fallbackCountryName = location.countryName || selectedCountries[0] || "";
  const fallbackCountryCode = location.countryCode || countryCodesFor(selectedCountries)[0] || "";
  const countrycodes = countryCodesFor(selectedCountries).map((code) => code.toLowerCase()).join(",");
  const collected = [];
  const seen = new Set();
  const orderedProfileKeys = freshOrder(profileKeys, search.refreshSeed, "nominatim-profile");
  const strictContactSearch = Boolean(search.requireContact || search.leadQuality === "contact_ready" || search.leadQuality === "owner_data");
  const profileCount = strictContactSearch
    ? Math.min(orderedProfileKeys.length, search.interactive ? 3 : 8)
    : Math.min(orderedProfileKeys.length, search.interactive ? 2 : 6);
  const perProfileLimit = strictContactSearch
    ? Math.max(4, Math.ceil(limitOverride / Math.max(profileCount, 1)))
    : limitOverride;

  for (const profileKey of orderedProfileKeys.slice(0, profileCount)) {
    if (collected.length >= limitOverride) break;
    let profileCollected = 0;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), search.interactive ? 4000 : 12000);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("q", nominatimTerm(profileKey));
      url.searchParams.set("limit", String(Math.min(10, Math.max(1, Math.min(limitOverride - collected.length, perProfileLimit - profileCollected)))));
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("extratags", "1");
      url.searchParams.set("namedetails", "1");
      url.searchParams.set("bounded", "1");
      url.searchParams.set("viewbox", viewboxFor(location));
      if (countrycodes) url.searchParams.set("countrycodes", countrycodes);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": "MATLeadsAIProX/1.0"
        }
      });
      if (!response.ok) continue;

      const places = await response.json();
      for (const place of places || []) {
        const lead = mapNominatimPlace(place, profileKey, {
          countryName: fallbackCountryName,
          countryCode: fallbackCountryCode
        });
        if (!lead.name || !Number.isFinite(lead.latitude) || !Number.isFinite(lead.longitude)) continue;
        const key = normalize(`${lead.name}-${lead.latitude.toFixed(5)}-${lead.longitude.toFixed(5)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ ...lead, searchRelevance: scoreLead(lead, profileKeys) });
        profileCollected += 1;
        if (collected.length >= limitOverride || profileCollected >= perProfileLimit) break;
      }
    } catch {
      // Nominatim is a fallback path; failed fallback requests should not mask the primary Overpass error.
    } finally {
      clearTimeout(timeout);
    }
  }

  return collected;
}

function mapPlace(place) {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const phone = place.internationalPhoneNumber || place.nationalPhoneNumber || "";
  const websiteUrl = place.websiteUri || "";
  const openingHours = (place.regularOpeningHours?.weekdayDescriptions || []).join("; ");
  const details = {
    contact: compactObject({
      phone,
      website: websiteUrl
    }),
    social: {},
    location: compactObject({
      latitude,
      longitude,
      address: place.formattedAddress,
      googleMapsLink: place.googleMapsUri
    }),
    business: compactObject({
      businessStatus: place.businessStatus,
      priceLevel: place.priceLevel,
      primaryType: place.primaryTypeDisplayName?.text,
      types: place.types || [],
      summary: place.editorialSummary?.text
    }),
    operations: compactObject({
      openingHours,
      openNow: place.regularOpeningHours?.openNow
    }),
    payments: {},
    source: compactObject({
      provider: "Google Places",
      placeId: place.id,
      rawPlace: place
    })
  };

  return {
    id: place.id || place.name?.split("/").pop(),
    name: place.displayName?.text || "Unknown business",
    category: place.primaryTypeDisplayName?.text || place.types?.[0] || "Local business",
    address: place.formattedAddress || "",
    phone,
    rating: place.rating || null,
    reviewsCount: place.userRatingCount || 0,
    websiteUrl,
    googleMapsLink: place.googleMapsUri || "",
    latitude,
    longitude,
    openingHours,
    details,
    raw: place
  };
}

function providerLeadIdentity(lead = {}) {
  const name = normalize(lead.name || "");
  const latitude = Number(lead.latitude ?? lead.details?.location?.latitude);
  const longitude = Number(lead.longitude ?? lead.details?.location?.longitude);
  if (name && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `location:${name}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
  }
  const phone = String(lead.phone || lead.details?.contact?.phone || "").replace(/\D/g, "");
  const address = normalize(lead.address || lead.details?.location?.address || "");
  return `profile:${name}|${phone || address}`;
}

function mergeProviderLeads(primary = [], supplemental = [], maximum = 60) {
  const byIdentity = new Map();
  for (const lead of [...primary, ...supplemental]) {
    if (!lead?.name) continue;
    const key = providerLeadIdentity(lead);
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, lead);
      continue;
    }
    // Keep the record with richer public contact data while preserving fields
    // discovered by either provider. Never synthesize a value here.
    const merged = {
      ...current,
      ...lead,
      phone: current.phone || lead.phone || "",
      email: current.email || lead.email || "",
      websiteUrl: current.websiteUrl || lead.websiteUrl || "",
      details: {
        ...(current.details || {}),
        ...(lead.details || {}),
        contact: { ...(current.details?.contact || {}), ...(lead.details?.contact || {}) },
        social: { ...(current.details?.social || {}), ...(lead.details?.social || {}) }
      }
    };
    byIdentity.set(key, merged);
  }
  return [...byIdentity.values()].slice(0, Math.max(1, maximum));
}

export class GooglePlacesService {
  async enrichOpenStreetMapContacts(leads, search) {
    const requiresPublicContact = Boolean(search.requireContact || search.leadQuality === "contact_ready" || search.leadQuality === "owner_data");
    const candidateLimit = requiresPublicContact
      ? Math.min(STRICT_CONTACT_DETAIL_CANDIDATE_LIMIT, Math.max(24, Number(search.limit || 0)))
      : search.interactive ? 6 : 15;
    const candidates = leads
      .map((lead, index) => ({ lead, index }))
    .filter(({ lead }) => {
      if (!lead?.raw?.osmType || !lead?.raw?.osmId) return false;
      // The Overpass response above already contains the complete OSM tag set.
      // Re-fetching those same records from the main OSM API adds no data but
      // can consume the entire serverless budget on a large strict search.
      // Photon/Nominatim candidates use partial/synthetic tags, so they still
      // receive the batched detail verification that can reveal public contact
      // and website fields before quality filters are applied.
      const directOverpassRecord = /^openstreetmap_overpass(?:_details)?$/.test(String(lead.source || ""))
        && Object.keys(lead.raw?.tags || {}).length > 0;
      if (directOverpassRecord) return false;
      return !lead.phone || !lead.websiteUrl || !lead.email || !Object.keys(lead.details?.social || {}).length;
    })
      .slice(0, candidateLimit);
    const details = new Map();
    const missingByType = new Map();
    for (const { lead } of candidates) {
      const type = String(lead.raw.osmType);
      const id = String(lead.raw.osmId);
      if (!/^(node|way|relation)$/.test(type) || !/^\d+$/.test(id)) continue;
      const cacheKey = `${type}/${id}`;
      const cached = osmElementDetailsCache.get(cacheKey);
      if (cached?.expiresAt > Date.now()) {
        details.set(cacheKey, cached.element);
        continue;
      }
      const ids = missingByType.get(type) || new Set();
      ids.add(id);
      missingByType.set(type, ids);
    }

    // The OSM read API accepts a comma-separated list of IDs. Batching lets a
    // contact-ready search inspect dozens of real records within the request
    // deadline instead of issuing one slow network call for each business.
    const batches = [];
    for (const [type, ids] of missingByType) {
      const plural = `${type}s`;
      for (let offset = 0; offset < ids.size; offset += 25) {
        batches.push({ type, plural, ids: [...ids].slice(offset, offset + 25) });
      }
    }
    for (let offset = 0; offset < batches.length; offset += OSM_DETAIL_BATCH_CONCURRENCY) {
      await Promise.all(batches.slice(offset, offset + OSM_DETAIL_BATCH_CONCURRENCY).map(async ({ type, plural, ids }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), OSM_DETAIL_BATCH_TIMEOUT_MS);
      try {
        const url = new URL(`https://www.openstreetmap.org/api/0.6/${plural}`);
        url.searchParams.set(plural, ids.join(","));
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json", "User-Agent": "MATLeadsAIProX/1.0" }
        });
        if (!response.ok) return;
        const payload = await response.json();
        for (const element of payload.elements || []) {
          if (!element?.id || !element?.tags) continue;
          const cacheKey = `${type}/${element.id}`;
          details.set(cacheKey, element);
          osmElementDetailsCache.set(cacheKey, { element, expiresAt: Date.now() + OSM_ELEMENT_CACHE_TTL_MS });
        }
      } catch {
        // The original provider fields remain available if a public OSM detail
        // batch is unavailable; this path must never manufacture contact data.
      } finally {
        clearTimeout(timeout);
      }
      }));
    }

    const results = candidates.map(({ lead, index }) => {
      const type = String(lead.raw.osmType);
      const id = String(lead.raw.osmId);
      const element = details.get(`${type}/${id}`);
      if (!element?.tags) return { lead, index };
      const mapped = mapOsmElement(element, selectedBusinessProfileKeys(search), {
        countryName: lead.countryName || lead.country || "",
        countryCode: lead.countryCode || ""
      });
      return {
        index,
        lead: {
          ...lead,
          phone: lead.phone || mapped.phone,
          email: lead.email || mapped.email,
          websiteUrl: lead.websiteUrl || mapped.websiteUrl,
          openingHours: lead.openingHours || mapped.openingHours,
          details: {
            ...lead.details,
            ...mapped.details,
            contact: { ...(lead.details?.contact || {}), ...(mapped.details?.contact || {}) },
            social: { ...(lead.details?.social || {}), ...(mapped.details?.social || {}) }
          },
          raw: mapped.raw,
          source: `${lead.source || "openstreetmap"}_details`
        }
      };
    });
    const enriched = [...leads];
    for (const result of results) {
      if (result) enriched[result.index] = result.lead;
    }
    return enriched;
  }

  async search(search) {
    const initialSelectedCountries = selectedCountryNames(search);
    const shouldIgnoreLegacyDefaultMap = initialSelectedCountries.length > 0 && isLegacyDefaultMapLink(search.mapLink);
    const normalizedSearch = {
      ...search,
      mapLink: shouldIgnoreLegacyDefaultMap ? "" : await resolveGoogleMapsLink(search.mapLink)
    };
    const location = searchLocation(normalizedSearch);
    const selectedCountries = selectedCountryNames(normalizedSearch);
    const unsupportedCountries = unsupportedCountryNames(normalizedSearch);

    if (unsupportedCountries.length) {
      throw new AppError(`Unsupported countries: ${unsupportedCountries.join(", ")}.`, 422, "UNSUPPORTED_COUNTRY");
    }

    if (!location && selectedCountries.length === 0) {
      throw new AppError("Select at least one supported country or paste a Google Maps link with coordinates.", 422, "COUNTRY_OR_MAP_LINK_REQUIRED");
    }

    if (!env.google.placesApiKey) {
      return this.searchOpenStreetMap(normalizedSearch, location);
    }

    const requestedLimit = Math.max(1, Number(normalizedSearch.limit) || 20);
    const targetResultCount = Math.min(requestedLimit, GOOGLE_TEXT_SEARCH_MAX_RESULTS);
    const strictDataSearch = Boolean(
      (normalizedSearch.requireContact || normalizedSearch.leadQuality === "contact_ready" || normalizedSearch.leadQuality === "owner_data")
      && (normalizedSearch.missingWebsiteOnly || normalizedSearch.leadQuality === "needs_website")
    );
    // If a Vercel deployment has a stale/invalid Google key, the fallback must
    // receive the same widened discovery target as the no-key path. Passing
    // only the final requested count (e.g. 50) makes strict filters inspect too
    // few real candidates and is the source of the familiar five-result cap.
    const fallbackCandidateLimit = Math.min(
      1200,
      Math.max(requestedLimit, requestedLimit * (strictDataSearch ? 20 : 2))
    );
    const fallbackSearch = {
      ...normalizedSearch,
      limit: fallbackCandidateLimit,
      requestedResultLimit: requestedLimit
    };
    const requestBody = {
      textQuery: buildTextQuery(normalizedSearch),
      pageSize: Math.min(targetResultCount, GOOGLE_TEXT_SEARCH_PAGE_SIZE),
      languageCode: "en"
    };

    if (location) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: location.latitude,
            longitude: location.longitude
          },
          radius: location.radiusMeters
        }
      };
    } else if (selectedCountries.length) {
      requestBody.includedRegionCodes = countryCodesFor(selectedCountries);
    }

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.primaryTypeDisplayName",
      "places.formattedAddress",
      "places.internationalPhoneNumber",
      "places.nationalPhoneNumber",
      "places.rating",
      "places.userRatingCount",
      "places.websiteUri",
      "places.googleMapsUri",
      "places.location",
      "places.businessStatus",
      "places.priceLevel",
      "places.regularOpeningHours",
      "places.editorialSummary",
      "places.types",
      "nextPageToken"
    ].join(",");
    const places = [];
    const seenPlaceIds = new Set();
    let nextPageToken = "";
    let pagesFetched = 0;
    let pageError = null;

    while (places.length < targetResultCount && pagesFetched < 3) {
      const pageRequestBody = nextPageToken
        ? { ...requestBody, pageToken: nextPageToken }
        : requestBody;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GOOGLE_TEXT_SEARCH_PAGE_TIMEOUT_MS);
      let response;
      try {
        response = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": env.google.placesApiKey,
            "X-Goog-FieldMask": fieldMask
          },
          body: JSON.stringify(pageRequestBody)
        });
      } catch (error) {
        clearTimeout(timeout);
        if (pagesFetched === 0 && error?.name === "AbortError") {
          return this.searchOpenStreetMap(fallbackSearch, location);
        }
        pageError = error?.name === "AbortError" ? "Google Places page timed out." : "Google Places page request failed.";
        break;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text();
        // Invalid Google key / billing / quota should NOT kill scanning: fall back to free OSM automatically.
        if (pagesFetched === 0 && (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 429)) {
          return this.searchOpenStreetMap(fallbackSearch, location);
        }
        let detail = body.slice(0, 400);
        try {
          const parsed = JSON.parse(body);
          detail = parsed.error?.message || parsed.error?.status || detail;
        } catch {}
        if (pagesFetched > 0) {
          pageError = `Google Places returned HTTP ${response.status}.`;
          break;
        }
        throw new AppError(`Google Places request failed (${response.status}): ${detail}. If no key is set, the app should use OpenStreetMap instead - check GOOGLE_PLACES_API_KEY env.`, response.status, "GOOGLE_PLACES_ERROR", body.slice(0, 400));
      }

      const payload = await response.json();
      pagesFetched += 1;
      for (const place of payload.places || []) {
        const id = String(place?.id || "").trim();
        if (!id || seenPlaceIds.has(id)) continue;
        seenPlaceIds.add(id);
        places.push(place);
        if (places.length >= targetResultCount) break;
      }
      nextPageToken = String(payload.nextPageToken || "").trim();
      if (!nextPageToken || !(payload.places || []).length) break;
    }

    const googleLeads = places.map(mapPlace);
    const requestedResultLimit = Math.max(1, Number(normalizedSearch.requestedResultLimit) || requestedLimit);
    // Text Search (New) is capped at 60 records per query. For a large request,
    // or for a strict contact + missing-site request whose qualified pool is
    // usually much smaller than the raw Google page, supplement with the same
    // real OSM market scan used when Google is unavailable. This keeps Vercel
    // from silently turning a 50/100 request into the first five matches.
    const needsSupplement = googleLeads.length < requestedLimit
      && (requestedResultLimit > GOOGLE_TEXT_SEARCH_MAX_RESULTS || strictDataSearch);
    let supplemental = null;
    let supplementWarning = "";
    if (needsSupplement) {
      try {
        supplemental = await this.searchOpenStreetMap({
          ...normalizedSearch,
          limit: Math.min(Math.max(fallbackCandidateLimit, requestedResultLimit), 1200),
          interactive: true
        }, location);
      } catch (error) {
        supplementWarning = "OpenStreetMap coverage supplement was unavailable.";
      }
    }
    const supplementalLeads = supplemental?.leads || [];
    const mergedLeads = mergeProviderLeads(
      googleLeads,
      supplementalLeads,
      Math.max(requestedLimit, requestedResultLimit)
    );
    const supplemented = supplementalLeads.length > 0;

    return {
      source: supplemented ? "google_places_plus_openstreetmap" : "google_places",
      providerLabel: supplemented ? "Google Places + OpenStreetMap" : "Google Places",
      selectedCountries,
      location,
      query: requestBody.textQuery,
      leads: mergedLeads,
      pagination: {
        pagesFetched,
        returned: mergedLeads.length,
        googleReturned: googleLeads.length,
        supplementalReturned: supplementalLeads.length,
        supplementalSource: supplemental?.source || undefined,
        supplemented,
        maxProviderResults: GOOGLE_TEXT_SEARCH_MAX_RESULTS,
        hasMore: Boolean(nextPageToken),
        partial: Boolean(pageError || supplementWarning),
        warning: pageError || supplementWarning || undefined
      }
    };
  }

  async searchOpenStreetMap(search, location) {
    const selectedCountries = selectedCountryNames(search);
    const selectedCountryMarkets = marketsForCountries(selectedCountries);
    const broadMarkets = broadMarketsFor(location);
    const markets = selectedCountryMarkets.length && (!location || broadMarkets)
      ? selectedCountryMarkets
      : broadMarkets;

    if (markets?.length) {
      return this.searchOpenStreetMapMarkets(search, location, markets);
    }

    if (!location) {
      throw new AppError("Select at least one supported country or paste a Google Maps link with coordinates to search real businesses without a Google API key.", 422, "COUNTRY_OR_MAP_LINK_REQUIRED");
    }

    let lastError = null;
    let emptyResult = null;
    const partialLeads = [];
    const partialSeen = new Set();
    const queryVariants = [
      { label: "nodes_and_ways", elementTypes: ["node", "way"] },
      { label: "relations", elementTypes: ["relation"] }
    ];
    const depth = searchDepthConfig(search);
    const mapContext = {
      countryName: location?.countryName || selectedCountries[0] || "",
      countryCode: location?.countryCode || countryCodesFor(selectedCountries)[0] || ""
    };
    const profileKeys = selectedBusinessProfileKeys(search);

    for (const [variantIndex, variant] of queryVariants.entries()) {
      const query = buildOverpassQuery(location, search.limit, variant.elementTypes, search);
      const endpoints = orderedOverpassEndpoints(search, variantIndex);
      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), (depth.overpassTimeout + 4) * 1000);
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "Accept": "application/json",
              "User-Agent": "MATLeadsAIProX/1.0"
            },
            body: new URLSearchParams({ data: query })
          });

          if (!response.ok) {
            lastError = new AppError(`OpenStreetMap Overpass request failed with ${response.status}.`, response.status, "OVERPASS_ERROR");
            continue;
          }

          const payload = await response.json();
          const seen = new Set();
          const leads = filterOsmLeads((payload.elements || [])
            .map((element) => mapOsmElement(element, profileKeys, mapContext))
            .filter((lead) => lead.name && Number.isFinite(lead.latitude) && Number.isFinite(lead.longitude))
            .filter((lead) => {
              const key = normalize(`${lead.name}-${lead.latitude.toFixed(5)}-${lead.longitude.toFixed(5)}`);
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }), search).slice(0, search.limit);

          const result = {
            source: "openstreetmap_overpass",
            providerLabel: "OpenStreetMap Overpass",
            selectedCountries,
            endpoint,
            queryVariant: variant.label,
            location,
            query: buildTextQuery(search),
            leads: await this.enrichOpenStreetMapContacts(leads, search)
          };

          for (const lead of result.leads) {
            const key = providerLeadIdentity(lead);
            if (!key || partialSeen.has(key)) continue;
            partialSeen.add(key);
            partialLeads.push(lead);
          }
          // Continue through the second element type when the first public
          // response is sparse. This prevents a production fallback from
          // stopping at the first few map records.
          if (partialLeads.length >= Math.max(1, Number(search.limit) || 1)) {
            return { ...result, leads: partialLeads.slice(0, search.limit) };
          }
          emptyResult = result;
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    const photonLeads = await searchPhotonFallback(search, location, search.limit, profileKeys);
    const enrichedPhotonLeads = photonLeads.length
      ? await this.enrichOpenStreetMapContacts(photonLeads.slice(0, search.limit), search)
      : [];
    const combinedLeads = mergeProviderLeads(partialLeads, enrichedPhotonLeads, search.limit);
    if (combinedLeads.length >= Math.max(1, Number(search.limit) || 1)) {
      return {
        source: partialLeads.length && enrichedPhotonLeads.length ? "openstreetmap_overpass_plus_photon" : enrichedPhotonLeads.length ? "openstreetmap_photon" : "openstreetmap_overpass",
        providerLabel: partialLeads.length && enrichedPhotonLeads.length ? "OpenStreetMap Overpass + Photon" : enrichedPhotonLeads.length ? "OpenStreetMap Photon" : "OpenStreetMap Overpass",
        selectedCountries,
        queryVariant: "photon_fallback",
        location,
        query: buildTextQuery(search),
        leads: combinedLeads
      };
    }

    const fallbackLeads = await searchNominatimFallback(search, location, search.limit, profileKeys);
    const enrichedFallbackLeads = fallbackLeads.length
      ? await this.enrichOpenStreetMapContacts(fallbackLeads.slice(0, search.limit), search)
      : [];
    const combinedFallbackLeads = mergeProviderLeads(combinedLeads, enrichedFallbackLeads, search.limit);
    if (combinedFallbackLeads.length) {
      return {
        source: combinedLeads.length && enrichedFallbackLeads.length ? "openstreetmap_multi_source" : enrichedFallbackLeads.length ? "openstreetmap_nominatim" : (partialLeads.length ? "openstreetmap_overpass" : "openstreetmap_photon"),
        providerLabel: combinedLeads.length && enrichedFallbackLeads.length ? "OpenStreetMap multi-source" : enrichedFallbackLeads.length ? "OpenStreetMap Nominatim" : (partialLeads.length ? "OpenStreetMap Overpass" : "OpenStreetMap Photon"),
        selectedCountries,
        queryVariant: "nominatim_fallback",
        location,
        query: buildTextQuery(search),
        leads: combinedFallbackLeads
      };
    }

    if (combinedLeads.length) {
      return { ...(emptyResult || { source: partialLeads.length ? "openstreetmap_overpass" : "openstreetmap_photon", providerLabel: partialLeads.length ? "OpenStreetMap Overpass" : "OpenStreetMap Photon" }), leads: combinedLeads.slice(0, search.limit) };
    }
    if (emptyResult) return emptyResult;
    throw new AppError(`OpenStreetMap Overpass search failed: ${lastError?.message || "all endpoints unavailable"}`, 503, "OVERPASS_UNAVAILABLE");
  }

  async searchOpenStreetMapMarkets(search, originalLocation, markets) {
    const depth = searchDepthConfig(search);
    const maxMarkets = Math.min(markets.length, depth.maxMarkets);
    const perMarketLimit = Math.max(depth.perMarketMin, Math.ceil(search.limit / Math.max(maxMarkets, 1)));
    const collected = [];
    const seen = new Set();
    const selectedCountries = selectedCountryNames(search);
    const baseLocation = originalLocation || {
      radiusMeters: search.radiusMeters || 15000,
      placeName: selectedCountries.join(", "),
      coordinateSource: "selected_countries"
    };
    const orderedMarkets = freshOrder(markets, search.refreshSeed, "market");
    const sampled = orderedMarkets.slice(0, Math.min(
      markets.length,
      depth.maxMarkets,
      Math.max(selectedCountries.length * depth.marketsPerCountry, 2, Math.ceil(search.limit / perMarketLimit))
    ));

    const marketResults = await Promise.allSettled(sampled.map(async (market, marketIndex) => {
      const normalizedMarket = normalizeMarketEntry(market);
      const marketLocation = {
        ...baseLocation,
        latitude: normalizedMarket.latitude,
        longitude: normalizedMarket.longitude,
        radiusMeters: Math.min(Math.max(baseLocation.radiusMeters || depth.marketRadius, depth.marketRadius), 50000),
        marketName: normalizedMarket.name,
        countryName: normalizedMarket.countryName,
        countryCode: normalizedMarket.countryCode
      };
      const result = await this.searchOpenStreetMapSingle(search, marketLocation, perMarketLimit, marketIndex);
      return { normalizedMarket, leads: result.leads, source: result.source, providerLabel: result.providerLabel };
    }));

    for (const marketResult of marketResults) {
      if (marketResult.status !== "fulfilled") continue;
      for (const lead of marketResult.value.leads) {
        const key = normalize(`${lead.name}-${lead.latitude?.toFixed?.(4)}-${lead.longitude?.toFixed?.(4)}`);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({
          ...lead,
          marketName: marketResult.value.normalizedMarket.name,
          countryName: marketResult.value.normalizedMarket.countryName,
          countryCode: marketResult.value.normalizedMarket.countryCode
        });
        if (collected.length >= search.limit) break;
      }
      if (collected.length >= search.limit) break;
    }

    const usedPhoton = collected.some((lead) => lead.source === "openstreetmap_photon");

    return {
      source: usedPhoton ? "openstreetmap_photon" : "openstreetmap_overpass",
      providerLabel: usedPhoton ? "OpenStreetMap Photon" : "OpenStreetMap Overpass",
      selectedCountries,
      queryVariant: "profitable_markets",
      location: {
        ...baseLocation,
        broadPlace: true,
        sampledMarkets: sampled.map((market) => {
          const normalizedMarket = normalizeMarketEntry(market);
          return {
            name: normalizedMarket.name,
            latitude: normalizedMarket.latitude,
            longitude: normalizedMarket.longitude,
            countryName: normalizedMarket.countryName
          };
        })
      },
      query: buildTextQuery(search),
      leads: await this.enrichOpenStreetMapContacts(collected, search)
    };
  }

  async searchOpenStreetMapSingle(search, location, limitOverride = search.limit, endpointOffset = 0) {
    const query = buildOverpassQuery(location, limitOverride, ["node", "way"], search);
    const profileKeys = selectedBusinessProfileKeys(search);
    const depth = searchDepthConfig(search);
    const selectedCountries = selectedCountryNames(search);
    const mapContext = {
      countryName: location?.countryName || selectedCountries[0] || "",
      countryCode: location?.countryCode || countryCodesFor(selectedCountries)[0] || ""
    };
    let lastError = null;
    let emptyResult = null;

    const endpoints = orderedOverpassEndpoints(search, endpointOffset);
    for (const endpoint of endpoints) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (depth.overpassTimeout + 4) * 1000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json",
            "User-Agent": "MATLeadsAIProX/1.0"
          },
          body: new URLSearchParams({ data: query })
        });

        if (!response.ok) {
          lastError = new AppError(`OpenStreetMap Overpass request failed with ${response.status}.`, response.status, "OVERPASS_ERROR");
          continue;
        }

        const payload = await response.json();
        const seen = new Set();
        const leads = filterOsmLeads((payload.elements || [])
          .map((element) => mapOsmElement(element, profileKeys, mapContext))
          .filter((lead) => lead.name && Number.isFinite(lead.latitude) && Number.isFinite(lead.longitude))
          .filter((lead) => {
            const key = normalize(`${lead.name}-${lead.latitude.toFixed(5)}-${lead.longitude.toFixed(5)}`);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }), search).slice(0, limitOverride);

        const result = {
          source: "openstreetmap_overpass",
          endpoint,
          location,
          leads
        };
        if (leads.length) return result;
        emptyResult = result;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }

    const photonLeads = await searchPhotonFallback(search, location, limitOverride, profileKeys);
    if (photonLeads.length) {
      return {
        source: "openstreetmap_photon",
        providerLabel: "OpenStreetMap Photon",
        endpoint: "https://photon.komoot.io/api/",
        location,
        leads: photonLeads.slice(0, limitOverride)
      };
    }

    const fallbackLeads = await searchNominatimFallback(search, location, limitOverride, profileKeys);
    if (fallbackLeads.length) {
      return {
        source: "openstreetmap_nominatim",
        endpoint: "https://nominatim.openstreetmap.org/search",
        location,
        leads: fallbackLeads.slice(0, limitOverride)
      };
    }

    if (emptyResult) return emptyResult;
    throw new AppError(`OpenStreetMap Overpass market search failed: ${lastError?.message || "all endpoints unavailable"}`, 503, "OVERPASS_UNAVAILABLE");
  }
}

