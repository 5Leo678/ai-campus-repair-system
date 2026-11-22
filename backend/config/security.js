const MIN_JWT_SECRET_LENGTH = 32;

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_LENGTH) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes');
  }
  return secret;
};

const validateSecurityConfig = () => {
  getJwtSecret();
};

module.exports = {
  getJwtSecret,
  validateSecurityConfig
};
