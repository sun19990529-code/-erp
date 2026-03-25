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
        const issues = error.issues || error.errors || [];
        const messages = issues.map(e => `${e.path?.join('.') || ''}: ${e.message}`).join('; ');
        return res.status(400).json({ success: false, message: `输入校验失败: ${messages}` });
      }
      // preprocess 等抛出的非 ZodError
      console.error('[validate]', error.message);
      return res.status(400).json({ success: false, message: error.message || '输入数据格式错误' });
    }
  };
}

/**
 * 路由参数 :id 整数校验中间件
 * 用法：router.get('/:id', validateId, handler)
 */
function validateId(req, res, next) {
  const id = req.params.id;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ success: false, message: `无效的ID参数: ${id}` });
  }
  req.params.id = parseInt(id, 10);
  next();
}

module.exports = { validate, validateId };
