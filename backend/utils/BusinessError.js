/**
 * 自定义业务错误类
 * 
 * 用于标识来自业务逻辑的可预期错误（如库存不足、越界报工等），
 * 与系统级异常（数据库崩溃、网络错误等）严格区分。
 * 
 * 用法：
 *   throw new BusinessError('原材料库存不足');
 *   throw new BusinessError('越界拦截：产出超出投入上限', 422);
 * 
 * 在 catch 中：
 *   if (error instanceof BusinessError) {
 *     return res.status(error.statusCode).json({ success: false, message: error.message });
 *   }
 */
class BusinessError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BusinessError';
    this.statusCode = statusCode;
  }
}

module.exports = { BusinessError };
