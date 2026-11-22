const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const safeUrl = req.originalUrl || req.url;
    console.log(
      `${req.method} ${safeUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`
    );
  });
  next();
};

module.exports = requestLogger;
