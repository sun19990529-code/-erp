const express = require('express');
const router = express.Router();
const { generateOrderNo } = require('../utils/order-number');
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');
const { writeLog } = require('./logs');

// 辅助函数：为委外工序自动创建委外加工单
function createOutsourcingOrderForProcess(db, production, processInfo, quantity) {
  const existing = db.get(`SELECT * FROM outsourcing_orders WHERE production_order_id = ? AND process_id = ?`, [production.id, processInfo.process_id]);
  if (existing) return existing;
  const defaultSupplier = db.get("SELECT id FROM suppliers WHERE status = 'active' ORDER BY id LIMIT 1") || db.get('SELECT id FROM suppliers LIMIT 1');
  if (!defaultSupplier) { console.warn('[production] 无可用供应商，无法自动创建委外单'); return null; }
  const orderNo = generateOrderNo('WW');
  const result = db.run(`
    INSERT INTO outsourcing_orders
      (order_no, supplier_id, production_order_id, process_id, total_amount, operator, remark, status)
    VALUES (?, ?, ?, ?, 0, '系统自动', ?, 'pending')
  `, [orderNo, defaultSupplier.id, production.id, processInfo.process_id, `自动创建 - 工序: ${processInfo.process_name}`]);
  const orderId = result.lastInsertRowid;
  db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)', [orderId, production.product_id, quantity || production.quantity]);
  return { id: orderId, order_no: orderNo, process_id: processInfo.process_id, process_name: processInfo.process_name };
}

// 辅助函数：生产完成时自动创建成品入库单
function createFinishedProductInbound(db, production, quantity) {
  const warehouse = db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
  if (!warehouse) return null;
  const orderNo = generateOrderNo('IN');
  const result = db.run(`INSERT INTO inbound_orders (order_no, type, warehouse_id, production_order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
    [orderNo, warehouse.id, production.id, `生产完成自动入库 - 生产工单: ${production.order_no}`]);
  const inboundId = result.lastInsertRowid;
  const batchNo = `PRD-${production.order_no}`;
  db.run(`INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, 0)`, [inboundId, production.product_id, batchNo, quantity]);
  const inventory = db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [warehouse.id, production.product_id, batchNo]);
  if (inventory) {
    db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [quantity, inventory.id]);
  } else {
    db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [warehouse.id, production.product_id, batchNo, quantity]);
  }
  return { id: inboundId, order_no: orderNo };
}

// 辅助函数：更新订单进度
function updateOrderProgress(db, orderId) {
  const productionOrders = db.all('SELECT * FROM production_orders WHERE order_id = ?', [orderId]);
  if (productionOrders.length === 0) return;
  let totalProgress = 0;
  productionOrders.forEach(po => {
    if (po.status === 'completed') { totalProgress += 100; }
    else {
      const productProcesses = db.all(`SELECT pp.id FROM product_processes pp WHERE pp.product_id = ? ORDER BY pp.sequence`, [po.product_id]);
      const completedProcesses = db.all(`SELECT DISTINCT ppr.process_id FROM production_process_records ppr WHERE ppr.production_order_id = ? AND ppr.status = 'completed'`, [po.id]);
      if (productProcesses.length > 0) { totalProgress += Math.round((completedProcesses.length / productProcesses.length) * 100); }
    }
  });
  const avgProgress = Math.round(totalProgress / productionOrders.length);
  let newStatus = 'pending';
  if (avgProgress > 0 && avgProgress < 100) newStatus = 'processing';
  else if (avgProgress >= 100) newStatus = 'completed';
  db.run('UPDATE orders SET progress = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [avgProgress, newStatus, orderId]);
  if (newStatus === 'completed') { createFinishedProductOutbound(db, orderId); }
}

// 辅助函数：订单完成时自动创建出库单
function createFinishedProductOutbound(db, orderId) {
  const existing = db.get(`SELECT * FROM outbound_orders WHERE order_id = ? AND type = 'finished'`, [orderId]);
  if (existing) return existing;
  const order = db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return null;
  const warehouse = db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
  if (!warehouse) return null;
  const orderItems = db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  if (orderItems.length === 0) return null;
  
  // 【修复#3】先检查所有产品库存是否充足
  for (const item of orderItems) {
    const inv = db.get('SELECT SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id = ?', [warehouse.id, item.product_id]);
    if (!inv || inv.total < item.quantity) {
      // 库存不足，不创建出库单，等待库存到位后手动出库
      return { pending: true, message: `成品库存不足，请入库后手动创建出库单` };
    }
  }
  
  const orderNo = generateOrderNo('OUT');
  const result = db.run(`INSERT INTO outbound_orders (order_no, type, warehouse_id, order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
    [orderNo, warehouse.id, orderId, `订单完成自动出库 - 销售订单: ${order.order_no}`]);
  const outboundId = result.lastInsertRowid;
  orderItems.forEach(item => {
    let remaining = item.quantity;
    const batches = db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC', [warehouse.id, item.product_id]);
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, batch.quantity);
      db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
      db.run(`INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`, [outboundId, item.product_id, batch.batch_no, deduct, item.unit_price || 0]);
      remaining -= deduct;
    }
  });
  return { id: outboundId, order_no: orderNo };
}

// ==================== 工序 ====================
router.get('/processes', requirePermission('production_view'), (req, res) => {
  try {
    const processes = req.db.all('SELECT * FROM processes ORDER BY sequence');
    res.json({ success: true, data: processes });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 生产工单 ====================
router.get('/', requirePermission('production_view'), (req, res) => {
  try {
    const { status, process, processCode, order_id, page = 1, pageSize = 20 } = req.query;
    if (processCode) {
      const sql = `SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit, o.order_no, o.customer_name FROM production_orders po JOIN products p ON po.product_id = p.id LEFT JOIN orders o ON po.order_id = o.id WHERE po.status != 'completed' AND po.current_process = ? ORDER BY po.created_at DESC`;
      const orders = req.db.all(sql, [processCode]);
      return res.json({ success: true, data: orders });
    }
    let sql = `SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit, o.order_no, o.customer_name FROM production_orders po JOIN products p ON po.product_id = p.id LEFT JOIN orders o ON po.order_id = o.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (process) { sql += ' AND po.current_process = ?'; params.push(process); }
    if (order_id) { sql += ' AND po.order_id = ?'; params.push(order_id); }
    sql += ' ORDER BY po.created_at DESC';
    const result = req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', validateId, requirePermission('production_view'), (req, res) => {
  try {
    const order = req.db.get(`SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit, o.order_no as ref_order_no, o.customer_name FROM production_orders po JOIN products p ON po.product_id = p.id LEFT JOIN orders o ON po.order_id = o.id WHERE po.id = ?`, [req.params.id]);
    const processRecords = req.db.all(`SELECT ppr.*, pr.name as process_name, pr.code as process_code FROM production_process_records ppr JOIN processes pr ON ppr.process_id = pr.id WHERE ppr.production_order_id = ? ORDER BY pr.sequence`, [req.params.id]);
    const outsourcingOrders = req.db.all(`SELECT oo.id, oo.order_no, oo.status, oo.created_at, s.name as supplier_name, pr.name as process_name FROM outsourcing_orders oo LEFT JOIN suppliers s ON oo.supplier_id = s.id LEFT JOIN processes pr ON oo.process_id = pr.id WHERE oo.production_order_id = ? ORDER BY oo.created_at DESC`, [req.params.id]);
    const inboundOrders = req.db.all(`SELECT io.*, w.name as warehouse_name FROM inbound_orders io LEFT JOIN warehouses w ON io.warehouse_id = w.id WHERE io.production_order_id = ? ORDER BY io.created_at DESC`, [req.params.id]);
    res.json({ success: true, data: { ...order, processRecords, outsourcingOrders, inboundOrders } });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('production_create'), (req, res) => {
  try {
    const { order_id, product_id, quantity, operator, remark, start_time, end_time } = req.body;
    if (!product_id || !quantity) return res.status(400).json({ success: false, message: '缺少必要参数：product_id 或 quantity' });
    const orderNo = generateOrderNo('PO');
    let productionId;
    
    req.db.transaction(() => {
      const result = req.db.run(`INSERT INTO production_orders (order_no, order_id, product_id, quantity, operator, remark, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, order_id || null, product_id, quantity, operator || null, remark || null, start_time || null, end_time || null]);
      productionId = result.lastInsertRowid;
      const productProcesses = req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [product_id]);
      if (productProcesses.length > 0) {
        productProcesses.forEach(pp => { req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES (?, ?, 'pending')`, [productionId, pp.process_id]); });
        req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, productionId]);
      }
    });
    writeLog(req.db, req.user?.id, '创建生产工单', 'production', productionId, `工单号: ${orderNo}`);
    res.json({ success: true, data: { id: productionId, order_no: orderNo } });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 工序操作
router.post('/:id/process', validateId, requirePermission('production_edit'), (req, res) => {
  try {
    const { process_id, operator, input_quantity, output_quantity, defect_quantity, remark, outsourcing_id, materials } = req.body;
    const productionId = req.params.id;
    
    let responseData = { success: true };
    
    // 参数校验
    if (!process_id || typeof process_id !== 'number' && isNaN(Number(process_id))) {
      return res.status(400).json({ success: false, message: '工序ID无效' });
    }
    if ((output_quantity != null && output_quantity < 0) || (defect_quantity != null && defect_quantity < 0)) {
      return res.status(400).json({ success: false, message: '数量不能为负数' });
    }
    
    req.db.transaction(() => {
      // 每次报工都插入新记录（支持多次报工）
      req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, operator, input_quantity, output_quantity, defect_quantity, status, start_time, end_time, remark, outsourcing_id) VALUES (?, ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
        [productionId, process_id, operator, input_quantity, output_quantity, defect_quantity, remark, outsourcing_id || null]);
      
      const production = req.db.get('SELECT * FROM production_orders WHERE id = ?', [productionId]);
      const productProcesses = req.db.all(`SELECT pp.*, p.code as process_code, p.name as process_name FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
      const currentProcess = req.db.get('SELECT * FROM processes WHERE id = ?', [process_id]);
      const currentIndex = productProcesses.findIndex(pp => pp.process_id == process_id);
      
      // 计算该工序的累计产出量
      const processTotal = req.db.get('SELECT COALESCE(SUM(output_quantity), 0) as total_output, COALESCE(SUM(defect_quantity), 0) as total_defect FROM production_process_records WHERE production_order_id = ? AND process_id = ?', [productionId, process_id]);
      const cumulativeOutput = processTotal.total_output;
      
      // ========== 首道工序：扣减原材料库存 + 记录实际消耗 ==========
      if (currentIndex === 0) {
        const productProcessId = productProcesses[0].id;
        const processMaterials = req.db.all(`SELECT pm.*, p.name as material_name, p.code as material_code, p.unit as material_unit FROM process_materials pm JOIN products p ON pm.material_id = p.id WHERE pm.product_process_id = ?`, [productProcessId]);
        
        if (processMaterials.length > 0 && processMaterials.some(m => m.quantity > 0)) {
          const rawWarehouse = req.db.get("SELECT id FROM warehouses WHERE type = 'raw' LIMIT 1");
          if (!rawWarehouse) {
            throw new Error('系统中未找到原材料仓库，请先在仓库管理中创建');
          }
          
          const actualQty = output_quantity || 0;
          const consumedMaterials = [];
          // 前端传来的实际用量映射：{ material_id: actual_quantity }
          const materialOverrides = {};
          if (Array.isArray(materials)) {
            materials.forEach(m => {
              if (m.material_id && m.actual_quantity != null) {
                const val = parseFloat(m.actual_quantity);
                if (!isNaN(val) && val >= 0) {
                  materialOverrides[m.material_id] = val;
                }
              }
            });
          }
          
          for (const mat of processMaterials) {
            if (mat.quantity <= 0) continue;
            // 计划消耗 = 单位用量 × 产出数
            const plannedQty = mat.quantity * actualQty;
            // 实际消耗：前端传了用实际值，否则用计划值
            const consumeQty = materialOverrides[mat.material_id] !== undefined 
              ? materialOverrides[mat.material_id] 
              : plannedQty;
            if (consumeQty <= 0) continue;
            
            const inventory = req.db.get('SELECT SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id = ?', [rawWarehouse.id, mat.material_id]);
            const availableQty = inventory?.total || 0;
            
            if (availableQty < consumeQty) {
              throw new Error(`原材料「${mat.material_name}」库存不足！需要 ${consumeQty} ${mat.unit || '公斤'}，当前库存 ${availableQty} ${mat.material_unit || '公斤'}`);
            }
            
            let remaining = consumeQty;
            let traceSupplierBatch = null, traceHeatNo = null, traceBatchNo = null;
            const batches = req.db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC', [rawWarehouse.id, mat.material_id]);
            for (const batch of batches) {
              if (remaining <= 0) break;
              const deduct = Math.min(remaining, batch.quantity);
              req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
              // 取第一个被扣减批次的追溯信息（FIFO）
              if (!traceSupplierBatch) traceSupplierBatch = batch.supplier_batch_no;
              if (!traceHeatNo) traceHeatNo = batch.heat_no;
              if (!traceBatchNo) traceBatchNo = batch.batch_no;
              remaining -= deduct;
            }
            
            // 写入材料消耗记录表（含追溯字段）
            req.db.run(
              `INSERT INTO production_material_consumption (production_order_id, process_id, material_id, planned_quantity, actual_quantity, unit, operator, supplier_batch_no, heat_no, batch_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [productionId, process_id, mat.material_id, plannedQty, consumeQty, mat.unit || '公斤', operator, traceSupplierBatch || null, traceHeatNo || null, traceBatchNo || null]
            );
            
            consumedMaterials.push({ name: mat.material_name, quantity: consumeQty, unit: mat.unit || '公斤' });
          }
          
          responseData.consumedMaterials = consumedMaterials;
        }
      }
      
      // ========== 流转逻辑：累计产出 >= 目标才流转 ==========
      const targetQty = production.quantity;
      let outsourcingOrder = null;
      
      // 更新工单状态为 processing
      if (production.status === 'pending') {
        req.db.run('UPDATE production_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['processing', productionId]);
      }
      
      // 更新工单的累计完成数量
      const totalCompleted = req.db.get('SELECT COALESCE(SUM(output_quantity), 0) as total FROM production_process_records WHERE production_order_id = ? AND process_id = (SELECT process_id FROM product_processes WHERE product_id = ? ORDER BY sequence DESC LIMIT 1)', [productionId, production.product_id]);
      req.db.run('UPDATE production_orders SET completed_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalCompleted?.total || 0, productionId]);
      
      // ========== 半成品库存联动 ==========
      const currentPP = productProcesses[currentIndex];
      const actualOutput = output_quantity || 0;
      const semiWarehouse = req.db.get("SELECT id FROM warehouses WHERE type = 'semi' LIMIT 1");
      const finishedWarehouse = req.db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
      
      // 非首道工序：扣减上一道工序的输出产物库存
      if (currentIndex > 0 && actualOutput > 0) {
        const prevPP = productProcesses[currentIndex - 1];
        if (prevPP.output_product_id) {
          if (semiWarehouse) {
            const prevProduct = req.db.get('SELECT name FROM products WHERE id = ?', [prevPP.output_product_id]);
            const inv = req.db.get('SELECT SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id = ?', [semiWarehouse.id, prevPP.output_product_id]);
            const available = inv?.total || 0;
            if (available < actualOutput) {
              throw new Error(`半成品「${prevProduct?.name || prevPP.output_product_id}」库存不足！需要 ${actualOutput}，当前 ${available}`);
            }
            let remaining = actualOutput;
            const batches = req.db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC', [semiWarehouse.id, prevPP.output_product_id]);
            for (const batch of batches) {
              if (remaining <= 0) break;
              const deduct = Math.min(remaining, batch.quantity);
              req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
              remaining -= deduct;
            }
          }
        }
      }
      
      // 当前工序有输出产物：入库半成品仓
      if (currentPP.output_product_id && actualOutput > 0) {
        const isLastProcess = currentIndex === productProcesses.length - 1;
        const targetWarehouse = isLastProcess ? finishedWarehouse : semiWarehouse;
        if (targetWarehouse) {
          const batchNo = `PRD-${production.order_no}`;
          const existingInv = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [targetWarehouse.id, currentPP.output_product_id, batchNo]);
          if (existingInv) {
            req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [actualOutput, existingInv.id]);
          } else {
            req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [targetWarehouse.id, currentPP.output_product_id, batchNo, actualOutput]);
          }
          responseData.semiProductInbound = {
            product_id: currentPP.output_product_id,
            quantity: actualOutput,
            warehouse_type: isLastProcess ? 'finished' : 'semi'
          };
        }
      }
      
      if (cumulativeOutput >= targetQty) {
        // 该工序累计完成目标 → 判断是否流转
        if (currentIndex < productProcesses.length - 1) {
          const nextProcess = productProcesses[currentIndex + 1];
          req.db.run('UPDATE production_orders SET current_process = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextProcess.process_code, productionId]);
          if (nextProcess.is_outsourced === 1) {
            outsourcingOrder = createOutsourcingOrderForProcess(req.db, production, nextProcess, cumulativeOutput);
          }
        } else {
          // 最后一道工序且累计完成 → 工单完工
          req.db.run('UPDATE production_orders SET current_process = ?, status = ?, completed_quantity = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentProcess.code, 'completed', cumulativeOutput, productionId]);
          // 如果没有设置 output_product_id，走旧的成品入库逻辑
          if (!currentPP.output_product_id) {
            const inboundOrder = createFinishedProductInbound(req.db, production, cumulativeOutput);
            responseData.inboundOrder = inboundOrder;
          }
          if (production.order_id) { updateOrderProgress(req.db, production.order_id); }
        }
      }
      
      // 返回累计追踪数据
      responseData.processProgress = {
        cumulative_output: cumulativeOutput,
        target_quantity: targetQty,
        remaining: Math.max(0, targetQty - cumulativeOutput),
        is_completed: cumulativeOutput >= targetQty
      };
      
      responseData.outsourcingOrder = outsourcingOrder;
    });
    // 【修复#2】res.json 移到事务外部，确保事务回滚时不会返回假成功
    res.json(responseData);
  } catch (error) {
    console.error(`[production.js]`, error.message);
    if (error.message && (error.message.includes('库存不足') || error.message.includes('未找到') || error.message.includes('半成品'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', validateId, requirePermission('production_edit'), (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'processing', 'completed', 'quality_hold', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    req.db.run('UPDATE production_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('production_edit'), (req, res) => {
  try {
    const { order_id, product_id, quantity, operator, remark, start_time, end_time } = req.body;
    const order = req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '生产工单不存在' });
    if (order.status !== 'pending') return res.status(400).json({ success: false, message: '只能编辑待处理状态的工单' });
    
    req.db.transaction(() => {
      req.db.run(`
        UPDATE production_orders
        SET order_id = ?, product_id = ?, quantity = ?, operator = ?, remark = ?,
            start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [order_id || null, product_id, quantity, operator, remark, start_time || null, end_time || null, req.params.id]);
      if (product_id != order.product_id) {
        req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [req.params.id]);
        const productProcesses = req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [product_id]);
        if (productProcesses.length > 0) {
          productProcesses.forEach(pp => { req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES (?, ?, 'pending')`, [req.params.id, pp.process_id]); });
          req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, req.params.id]);
        }
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('production_delete'), (req, res) => {
  try {
    const { force } = req.query;
    const order = req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '生产工单不存在' });
    const isAdmin = req.user?.role_code === 'admin';
    if (order.status !== 'pending' && force !== 'true' && !isAdmin) return res.status(400).json({ success: false, message: '只能删除待处理状态的工单，如需删除请联系管理员' });
    req.db.transaction(() => {
      // 清理关联委外单（含检验记录和明细）
      const outsourcings = req.db.all('SELECT id FROM outsourcing_orders WHERE production_order_id = ?', [req.params.id]);
      outsourcings.forEach(oo => {
        req.db.run('DELETE FROM outsourcing_inspections WHERE outsourcing_id = ?', [oo.id]);
        req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [oo.id]);
      });
      req.db.run('DELETE FROM outsourcing_orders WHERE production_order_id = ?', [req.params.id]);
      // 清理关联领料单
      const picks = req.db.all('SELECT id FROM pick_orders WHERE production_order_id = ?', [req.params.id]);
      picks.forEach(pk => {
        req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [pk.id]);
        req.db.run('DELETE FROM pick_orders WHERE id = ?', [pk.id]);
      });
      req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [req.params.id]);
      req.db.run('DELETE FROM production_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[production.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 返工流程 ====================
router.post('/:id/rework', validateId, requirePermission('production_edit'), (req, res) => {
  try {
    const { target_process_id, quantity, reason, operator } = req.body;
    if (!target_process_id) return res.status(400).json({ success: false, message: '请选择返工回退到的目标工序' });
    if (!reason) return res.status(400).json({ success: false, message: '请填写返工原因' });

    const production = req.db.get('SELECT * FROM production_orders WHERE id = ?', [req.params.id]);
    if (!production) return res.status(404).json({ success: false, message: '工单不存在' });

    // 允许从 quality_hold（质检暂停）或 completed（客户退回返工）发起
    if (!['quality_hold', 'completed'].includes(production.status)) {
      return res.status(400).json({ success: false, message: '只有质检暂停或已完成（客户退回）的工单才能发起返工' });
    }

    // 校验目标工序属于该产品的工序配置
    const productProcesses = req.db.all(
      `SELECT pp.*, p.code as process_code, p.name as process_name
       FROM product_processes pp JOIN processes p ON pp.process_id = p.id
       WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
    const targetIndex = productProcesses.findIndex(pp => pp.process_id == target_process_id);
    if (targetIndex === -1) return res.status(400).json({ success: false, message: '目标工序不属于该产品的工序配置' });

    const targetProcess = productProcesses[targetIndex];
    const reworkQty = quantity || production.quantity;

    req.db.transaction(() => {
      // 1. 回退工单：current_process 设为目标工序，状态恢复 processing
      req.db.run(
        'UPDATE production_orders SET current_process = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [targetProcess.process_code, 'processing', req.params.id]);

      // 2. 为目标工序及其之后的工序插入新的 pending 记录（标记为返工重做）
      for (let i = targetIndex; i < productProcesses.length; i++) {
        req.db.run(
          `INSERT INTO production_process_records (production_order_id, process_id, status, remark) VALUES (?, ?, 'pending', ?)`,
          [req.params.id, productProcesses[i].process_id, i === targetIndex ? `返工(${reason})` : '返工待重做']);
      }
    });

    writeLog(req.db, req.user?.id, '发起返工', 'production', req.params.id,
      `回退到工序「${targetProcess.process_name}」，数量 ${reworkQty}，原因：${reason}`);

    res.json({ success: true, message: `已回退到工序「${targetProcess.process_name}」，请安排车间重新报工` });
  } catch (error) {
    console.error('[production.js/rework]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
