const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'backend/routes');

const filePermissions = {
  'warehouse.js': [
    ["'/warehouses'", 'get', 'warehouse_view'],
    ["'/inventory'", 'get', 'warehouse_view'],
    ["'/inventory/warnings'", 'get', 'warehouse_view'],
    ["'/warehouses'", 'post', 'warehouse_create'],
    ["'/warehouses/:id'", 'put', 'warehouse_edit'],
    ["'/warehouses/:id'", 'delete', 'warehouse_delete'],
    ["'/inbound'", 'get', 'warehouse_view'],
    ["'/inbound/:id'", 'get', 'warehouse_view'],
    ["'/inbound'", 'post', 'warehouse_create'],
    ["'/inbound/:id/status'", 'put', 'warehouse_edit'],
    ["'/inbound/:id'", 'put', 'warehouse_edit'],
    ["'/inbound/:id'", 'delete', 'warehouse_delete'],
    ["'/outbound'", 'get', 'warehouse_view'],
    ["'/outbound/:id'", 'get', 'warehouse_view'],
    ["'/outbound'", 'post', 'warehouse_create'],
    ["'/outbound/:id/status'", 'put', 'warehouse_edit'],
    ["'/outbound/:id'", 'put', 'warehouse_edit'],
    ["'/outbound/:id'", 'delete', 'warehouse_delete'],
  ],
  'purchase.js': [
    ["'/'", 'get', 'purchase_view'],
    ["'/:id'", 'get', 'purchase_view'],
    ["'/'", 'post', 'purchase_create'],
    ["'/:id/status'", 'put', 'purchase_edit'],
    ["'/:id'", 'put', 'purchase_edit'],
    ["'/:id'", 'delete', 'purchase_delete'],
  ],
  'outsourcing.js': [
    ["'/'", 'get', 'outsourcing_view'],
    ["'/:id'", 'get', 'outsourcing_view'],
    ["'/'", 'post', 'outsourcing_create'],
    ["'/:id/status'", 'put', 'outsourcing_edit'],
    ["'/:id'", 'put', 'outsourcing_edit'],
    ["'/:id'", 'delete', 'outsourcing_delete'],
  ],
  'inspection.js': [
    ["'/inbound'", 'get', 'inspection_view'],
    ["'/inbound'", 'post', 'inspection_create'],
    ["'/patrol'", 'get', 'inspection_view'],
    ["'/patrol'", 'post', 'inspection_create'],
    ["'/outsourcing'", 'get', 'inspection_view'],
    ["'/outsourcing'", 'post', 'inspection_create'],
    ["'/final'", 'get', 'inspection_view'],
    ["'/final'", 'post', 'inspection_create'],
  ],
  'pick.js': [
    ["'/'", 'get', 'warehouse_view'],
    ["'/:id'", 'get', 'warehouse_view'],
    ["'/'", 'post', 'warehouse_create'],
    ["'/:id/status'", 'put', 'warehouse_edit'],
    ["'/:id'", 'put', 'warehouse_edit'],
    ["'/:id'", 'delete', 'warehouse_delete'],
  ],
  'products.js': [
    ["'/'", 'get', 'basic_data_view'],
    ["'/'", 'post', 'basic_data_create'],
    ["'/:id'", 'put', 'basic_data_edit'],
    ["'/:id'", 'delete', 'basic_data_delete'],
    ["'/:id/processes'", 'get', 'basic_data_view'],
    ["'/:id/processes'", 'post', 'basic_data_edit'],
    ["'/product-processes/:productProcessId/materials'", 'get', 'basic_data_view'],
    ["'/:id/process-materials'", 'get', 'basic_data_view'],
    ["'/:id/processes/:processId'", 'put', 'basic_data_edit'],
    ["'/:id/processes/:processId'", 'delete', 'basic_data_delete'],
  ],
};

let totalRoutes = 0;
for (const [file, patterns] of Object.entries(filePermissions)) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 添加 import
  if (!content.includes('requirePermission')) {
    content = content.replace(
      "const router = express.Router();",
      "const router = express.Router();\nconst { requirePermission } = require('../middleware/permission');"
    );
  }
  
  // 为每个路由添加权限中间件
  for (const [route, method, perm] of patterns) {
    const old = `router.${method}(${route}, (req, res)`;
    const replacement = `router.${method}(${route}, requirePermission('${perm}'), (req, res)`;
    if (content.includes(old)) {
      content = content.replace(old, replacement);
      totalRoutes++;
    }
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[ok]', file, '- matched routes');
}
console.log('Total routes with permission added:', totalRoutes);
