// Vercel Node.js serverless entry point. Keep this ES module: Vercel's current
// JavaScript function runtime loads .mjs entries as native Node functions.
import server from '../server.js';

const { handleMain, handleContent } = server;

export default function handler(req, res) {
  const pathname = new URL(req.url, `https://${req.headers.host || 'localhost'}`).pathname;
  const isContentRequest = pathname === '/proxy' || pathname === '/matform' || pathname === '/blocked' || pathname === '/favicon.ico';
  return isContentRequest ? handleContent(req, res) : handleMain(req, res);
}
