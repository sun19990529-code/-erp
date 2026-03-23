/**
 * Swagger API 文档配置
 * 访问地址：http://localhost:3198/api-docs
 */
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: '铭晟 ERP-MES 系统 API',
    version: '1.4.2',
    description: '面向中小型制造企业的一体化 ERP + MES 管理平台 API 接口文档',
    contact: { name: '铭晟技术团队' },
  },
  servers: [
    { url: 'http://localhost:3198/api', description: '开发服务器' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order_no: { type: 'string', example: 'SO20260323001' },
          customer_name: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'cancelled'] },
          total_amount: { type: 'number' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      ProductionOrder: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order_no: { type: 'string' },
          product_id: { type: 'integer' },
          quantity: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'quality_hold', 'cancelled'] },
        },
      },
      InboundOrder: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order_no: { type: 'string' },
          type: { type: 'string', enum: ['raw', 'semi', 'finished'] },
          warehouse_id: { type: 'integer' },
          status: { type: 'string', enum: ['pending_inspection', 'approved', 'completed', 'rejected'] },
        },
      },
      OutboundOrder: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order_no: { type: 'string' },
          type: { type: 'string', enum: ['finished', 'raw', 'transfer'] },
          warehouse_id: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'approved', 'completed', 'cancelled'] },
        },
      },
      PurchaseOrder: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          order_no: { type: 'string' },
          supplier_id: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'received', 'cancelled'] },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', example: 'admin123' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: '认证', description: '用户登录和令牌管理' },
    { name: '订单', description: '销售订单管理' },
    { name: '生产', description: '生产工单管理' },
    { name: '仓库', description: '入库/出库/库存管理' },
    { name: '采购', description: '采购订单管理' },
    { name: '委外', description: '委外加工管理' },
    { name: '质检', description: '质量检验管理' },
    { name: '领料', description: '物料领用管理' },
    { name: '基础数据', description: '产品/供应商/客户/部门' },
    { name: '系统', description: '角色/权限/用户/备份' },
  ],
  paths: {
    '/users/login': {
      post: {
        tags: ['认证'], summary: '用户登录', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: { 200: { description: '登录成功，返回 token 和 refreshToken' }, 401: { description: '用户名或密码错误' } },
      },
    },
    '/users/refresh': {
      post: {
        tags: ['认证'], summary: '刷新令牌', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
        responses: { 200: { description: '返回新的 access token' }, 401: { description: '刷新令牌无效' } },
      },
    },
    '/orders': {
      get: { tags: ['订单'], summary: '查询订单列表', parameters: [{ in: 'query', name: 'keyword', schema: { type: 'string' } }, { in: 'query', name: 'status', schema: { type: 'string' } }], responses: { 200: { description: '订单列表' } } },
      post: { tags: ['订单'], summary: '创建订单', responses: { 200: { description: '创建成功' } } },
    },
    '/orders/{id}/status': {
      put: { tags: ['订单'], summary: '更新订单状态', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '更新成功' } } },
    },
    '/production': {
      get: { tags: ['生产'], summary: '查询生产工单', responses: { 200: { description: '工单列表' } } },
      post: { tags: ['生产'], summary: '创建生产工单', responses: { 200: { description: '创建成功' } } },
    },
    '/warehouse/inbound': {
      get: { tags: ['仓库'], summary: '查询入库单', responses: { 200: { description: '入库单列表' } } },
      post: { tags: ['仓库'], summary: '创建入库单', responses: { 200: { description: '创建成功' } } },
    },
    '/warehouse/outbound': {
      get: { tags: ['仓库'], summary: '查询出库单', responses: { 200: { description: '出库单列表' } } },
      post: { tags: ['仓库'], summary: '创建出库单', responses: { 200: { description: '创建成功' } } },
    },
    '/warehouse/inventory': {
      get: { tags: ['仓库'], summary: '查询库存', parameters: [{ in: 'query', name: 'warehouse_type', schema: { type: 'string' } }], responses: { 200: { description: '库存列表' } } },
    },
    '/purchase': {
      get: { tags: ['采购'], summary: '查询采购单', responses: { 200: { description: '采购单列表' } } },
      post: { tags: ['采购'], summary: '创建采购单', responses: { 200: { description: '创建成功' } } },
    },
    '/outsourcing': {
      get: { tags: ['委外'], summary: '查询委外单', responses: { 200: { description: '委外单列表' } } },
      post: { tags: ['委外'], summary: '创建委外单', responses: { 200: { description: '创建成功' } } },
    },
    '/pick': {
      get: { tags: ['领料'], summary: '查询领料单', responses: { 200: { description: '领料单列表' } } },
    },
    '/inspection/inbound': {
      get: { tags: ['质检'], summary: '查询来料检验', responses: { 200: { description: '检验列表' } } },
      post: { tags: ['质检'], summary: '创建来料检验', responses: { 200: { description: '创建成功' } } },
    },
  },
};

function setupSwagger(app) {
  const specs = swaggerJsdoc({ definition: swaggerDefinition, apis: [] });
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: '铭晟 ERP-MES API 文档',
  }));
  console.log('📚 API 文档已挂载: http://localhost:3198/api-docs');
}

module.exports = { setupSwagger };
