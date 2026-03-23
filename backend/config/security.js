/**
 * 安全配置集中管理
 */
const BCRYPT_ROUNDS = 12; // bcrypt 哈希轮次，建议生产环境 ≥ 12

module.exports = { BCRYPT_ROUNDS };
