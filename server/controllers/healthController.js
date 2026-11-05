import { env } from "../config/env.js";
import { isFirebaseConfigured } from "../config/firebase.js";

export function health(_req, res) {
  const integrations = {
    firebase: isFirebaseConfigured(),
    googlePlaces: Boolean(env.google.placesApiKey),
    openStreetMap: Boolean(env.osm.overpassEndpoints && env.osm.overpassEndpoints.length > 0),
    nvidia: Boolean(env.nvidia.apiKey),
    stripe: Boolean(env.stripe.secretKey),
    paypal: Boolean(env.paypal.clientId && env.paypal.clientSecret)
  };

  const missingRequiredForLiveOperation = [];
  if (!integrations.googlePlaces) missingRequiredForLiveOperation.push("Google Places API");
  if (!integrations.firebase) missingRequiredForLiveOperation.push("Firebase Firestore");
  if (!integrations.nvidia) missingRequiredForLiveOperation.push("NVIDIA API");
  if (!integrations.stripe) missingRequiredForLiveOperation.push("Stripe Billing");

  res.json({
    status: "ok",
    service: "mat-leads-ai-pro-x",
    environment: env.nodeEnv,
    integrations,
    missingRequiredForLiveOperation
  });
}
