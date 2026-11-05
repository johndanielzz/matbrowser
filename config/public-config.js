// Public, non-secret defaults committed with the repository.
//
// These values are safe to publish: a Firebase Web API key is public by design (it ships in
// every client app), and the project id, OpenStreetMap endpoints and NVIDIA model names are not
// credentials. Baking them in means a fresh GitHub -> Vercel deployment boots with working
// Firebase Authentication, OpenStreetMap lead search and NVIDIA model selection even when no
// environment variables have been added yet.
//
// Secrets still have to come from environment variables on the host that runs the app:
// NVIDIA_API_KEY, the Firebase service-account credentials (FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY / FIREBASE_SERVICE_ACCOUNT), Stripe keys and PayPal credentials.
export const publicConfig = {
  firebase: {
    projectId: "mat-lead-c0ca4",
    webApiKey: "AIzaSyA0nRrFw0WGjwfrJb-mnzFreR62hw8iLNw"
  },
  osm: {
    overpassEndpoints: [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://api.openstreetmap.fr/oapi/interpreter"
    ]
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "mistralai/mistral-nemotron",
    modelFallbacks: ["nvidia/nemotron-3.5-lightning-30b-a3b"],
    timeoutMs: 60000
  }
};
