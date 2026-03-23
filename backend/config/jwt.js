/**
 * 集中管理 JWT 配置，消除硬编码
 * access token: 短效（2h），用于 API 鉴权
 * refresh token: 长效（30d），仅用于换发新 access token
 */
const JWT_SECRET = process.env.JWT_SECRET || 'mes_super_secret_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (JWT_SECRET + '_refresh');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const JWT_REFRESH_EXPIRES_IN = '30d';
const JWT_REFRESH_MAX_AGE = 30 * 24 * 3600; // 30 天（秒）

module.exports = { JWT_SECRET, JWT_REFRESH_SECRET, JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, JWT_REFRESH_MAX_AGE };
