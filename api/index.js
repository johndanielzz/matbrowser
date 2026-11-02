const { handleMain, handleContent } = require('../server');

module.exports = (req, res) => {
  const path = new URL(req.url, `https://${req.headers.host || 'localhost'}`).pathname;
  return path === '/proxy' || path === '/matform' || path === '/blocked' || path === '/favicon.ico'
    ? handleContent(req, res)
    : handleMain(req, res);
};
