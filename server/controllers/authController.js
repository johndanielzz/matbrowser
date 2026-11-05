import { AuthService } from "../services/authService.js";

const authService = new AuthService();

export async function register(req, res) {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}

export async function login(req, res) {
  const result = await authService.login(req.body);
  res.json(result);
}

export async function refresh(req, res) {
  const result = await authService.refreshSession(req.body?.refreshToken);
  res.json(result);
}

export async function me(req, res) {
  res.json({ user: await authService.currentUser(req.user) });
}

export async function profile(req, res) {
  res.json({ user: await authService.currentUser(req.user) });
}

export async function updateProfile(req, res) {
  res.json(await authService.updateProfile(req.user, req.body));
}

export async function settings(req, res) {
  const user = await authService.currentUser(req.user);
  res.json({ settings: user.settings, user });
}

export async function updateSettings(req, res) {
  res.json(await authService.updateSettings(req.user, req.body));
}
