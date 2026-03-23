/**
 * Zod 输入校验中间件工厂
 * 用法：router.post('/', validate(schema), handler)
 */
const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return res.status(400).json({ success: false, message: `输入校验失败: ${messages}` });
      }
      next(error);
    }
  };
}

module.exports = { validate };
