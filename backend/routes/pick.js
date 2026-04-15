const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');
const { generateOrderNo } = require('../utils/order-number');
const { convertToKg } = require('../utils/unit-convert');
const { sendNotification } = require('./notifications');
const { BusinessError } = require('../utils/BusinessError');

// 领料/退料单列表
router.get('/', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { status, order_id, type } = req.query;
    let sql = `
      SELECT po.*, w.name as warehouse_name,
        o.order_no, ppo.order_no as production_order_no
      FROM pick_orders po
      JOIN warehouses w ON po.warehouse_id = w.id
      LEFT JOIN orders o ON po.order_id = o.id
      LEFT JOIN production_orders ppo ON po.production_order_id = ppo.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (order_id) { sql += ' AND po.order_id = ?'; params.push(order_id); }
    if (type) { sql += ' AND po.type = ?'; params.push(type); }
    sql += ' ORDER BY po.created_at DESC';
    const orders = await req.db.all(sql, params);
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', validateId, requirePermission('warehouse_view'), async (req, res) => {
  try {
    const order = await req.db.get(`SELECT po.*, w.name as warehouse_name, o.order_no, ppo.order_no as production_order_no FROM pick_orders po JOIN warehouses w ON po.warehouse_id = w.id LEFT JOIN orders o ON po.order_id = o.id LEFT JOIN production_orders ppo ON po.production_order_id = ppo.id WHERE po.id = ?`, [req.params.id]);
    const items = await req.db.all(`SELECT pi.*, p.code, p.name, p.unit FROM pick_items pi JOIN products p ON pi.material_id = p.id WHERE pi.pick_order_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('warehouse_create'), async (req, res) => {
  try {
    const { order_id, production_order_id, warehouse_id, operator, remark, items, type, pick_type } = req.body;
    const pickType = type === 'return' ? 'return' : 'pick';
    const prefix = pickType === 'return' ? 'RT' : 'PK';
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个物料' });
    const orderNo = generateOrderNo(prefix);
    
    let processedRemark = remark || '';
    if (pick_type === 'replenish') {
      processedRemark = processedRemark ? `【追加补料单】${processedRemark}` : '【追加补料单】';
    }

    // 预取产品信息（用于单位换算）
    const materialIds = [...new Set(items.map(i => i.material_id).filter(Boolean))];
    const productMap = new Map();
    if (materialIds.length > 0) {
      const ph = materialIds.map(() => '?').join(',');
      const rows = await req.db.all(`SELECT id, name, unit, outer_diameter, wall_thickness, length FROM products WHERE id IN (${ph})`, materialIds);
      rows.forEach(p => productMap.set(p.id, p));
    }

    // 【防发呆校验】放长至 20%
    const overIssueWarnings = [];
    if (pickType === 'pick' && pick_type !== 'replenish') {
      for (const item of (items || [])) {
        if (item.material_id && item.required_quantity > 0) {
          const product = productMap.get(item.material_id);
          const inputQuantity = item.input_quantity || item.quantity;
          const inputUnit = item.input_unit || '公斤';
          const kgQuantity = convertToKg(inputQuantity, inputUnit, product);
          // 容忍度 20%，基础偏差不低于 2公斤
          const maxAllowed = Math.max(item.required_quantity * 1.20, item.required_quantity + 2);
          if (kgQuantity > maxAllowed) {
            const overPercent = (((kgQuantity - item.required_quantity) / item.required_quantity) * 100).toFixed(0);
            overIssueWarnings.push(`「${product?.name || item.material_id}」超出${overPercent}%`);
          }
        }
      }
    }
    
    // 如果存在超发，记录并放行，同时发送机器人通知
    if (overIssueWarnings.length > 0) {
      const msg = `[耗料预警] 发现生产作业超额领料异常！工单涉及物料过量消耗：${overIssueWarnings.join('；')}`;
      // 调用现有的 sendNotification (通知系统/机器人机制)
      await sendNotification(req.db, null, 'warning', '领料超限', msg, 'production', production_order_id);
    }

    let pickId;
    await req.db.transaction(async () => {
      const result = await req.db.run(`INSERT INTO pick_orders (order_no, order_id, production_order_id, warehouse_id, operator, remark, status, type) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [orderNo, order_id || null, production_order_id || null, warehouse_id, operator, processedRemark || null, pickType]);
      pickId = result.lastInsertRowid;
      for (const item of (items || [])) {
        if (item.material_id && item.quantity > 0) {
          const product = productMap.get(item.material_id);
          const inputQuantity = item.input_quantity || item.quantity;
          const inputUnit = item.input_unit || '公斤';
          const quantityKg = convertToKg(inputQuantity, inputUnit, product);
          await req.db.run(`INSERT INTO pick_items (pick_order_id, material_id, quantity, input_quantity, input_unit, remark) VALUES (?, ?, ?, ?, ?, ?)`,
            [pickId, item.material_id, quantityKg, inputQuantity, inputUnit, item.remark || null]);
        }
      }
    });
    res.json({ success: true, data: { id: pickId, order_no: orderNo }, over_issue_warning: overIssueWarnings.length > 0 });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    
    await req.db.transaction(async () => {
      if (status === 'completed') {
        const order = await req.db.get('SELECT * FROM pick_orders WHERE id = ? FOR UPDATE', [req.params.id]);
        const isReturn = order.type === 'return';
        const items = await req.db.all('SELECT pi.*, p.name as material_name FROM pick_items pi JOIN products p ON pi.material_id = p.id WHERE pi.pick_order_id = ?', [req.params.id]);
        
        if (items.length > 0) {
          const materialIds = [...new Set(items.map(i => i.material_id))];
          const ph = materialIds.map(() => '?').join(',');
          const invRows = await req.db.all(`SELECT * FROM inventory WHERE warehouse_id = ? AND product_id IN (${ph}) ORDER BY product_id ASC FOR UPDATE`, [order.warehouse_id, ...materialIds]);
          
          const invMap = {}; // key: product_id_batch_no
          const totalInvMap = {}; // key: product_id
          const batchLists = {}; // key: product_id
          
          for(let r of invRows) {
            const key = `${r.product_id}_${r.batch_no}`;
            invMap[key] = r;
            totalInvMap[r.product_id] = (totalInvMap[r.product_id] || 0) + r.quantity;
            if (!batchLists[r.product_id]) batchLists[r.product_id] = [];
            batchLists[r.product_id].push(r);
          }
          
          Object.values(batchLists).forEach(list => list.sort((a,b) => new Date(a.updated_at) - new Date(b.updated_at)));

          // 第一遍内存校验（如果是领料）
          if (!isReturn) {
            const consumedMap = {};
            for (const item of items) {
              consumedMap[item.material_id] = (consumedMap[item.material_id] || 0) + item.quantity;
              const totalAvailable = totalInvMap[item.material_id] || 0;
              if (consumedMap[item.material_id] > totalAvailable) {
                throw new BusinessError(`物料「${item.material_name}」库存不足，累计需要 ${consumedMap[item.material_id]}，当前总库存 ${totalAvailable}`);
              }
              if (item.batch_no && item.batch_no !== 'DEFAULT_BATCH') {
                const bKey = `${item.material_id}_${item.batch_no}`;
                const bInv = invMap[bKey];
                if (!bInv || bInv.quantity < item.quantity) {
                  throw new BusinessError(`物料「${item.material_name}」批次[${item.batch_no}]库存不足，需要 ${item.quantity}，该批次库存 ${bInv?.quantity || 0}`);
                }
                bInv.quantity -= item.quantity; // 内存扣减占用
              } else {
                // 内存模拟 FIFO 检测，这里不再模拟扣减，因为上面 totalAvailable 已经阻断
              }
            }
          }

          // 第二遍执行数据库变更
          for (const item of items) {
            if (isReturn) {
              const batch = item.batch_no || 'DEFAULT_BATCH';
              const key = `${item.material_id}_${batch}`;
              const existingInv = invMap[key];
              if (existingInv) {
                await req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, existingInv.id]);
                // 同步内存防止同一项出现多次叠加写入异常
                existingInv.quantity += item.quantity; 
              } else {
                const resIns = await req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [order.warehouse_id, item.material_id, batch, item.quantity]);
                invMap[key] = { id: resIns.lastInsertRowid, quantity: item.quantity };
              }
            } else {
              let traceSupplierBatch = null, traceHeatNo = null;
              if (item.batch_no && item.batch_no !== 'DEFAULT_BATCH') {
                const bKey = `${item.material_id}_${item.batch_no}`;
                // 注意第一遍校验已经将 invMap[bKey].quantity 减去了。这只影响逻辑状态。执行写入直接用恒定数字。
                await req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [item.quantity, order.warehouse_id, item.material_id, item.batch_no]);
                // 获取原本行的追溯信息
                const originalRow = invRows.find(r => r.product_id === item.material_id && r.batch_no === item.batch_no);
                if (originalRow) {
                  traceSupplierBatch = originalRow.supplier_batch_no;
                  traceHeatNo = originalRow.heat_no;
                }
              } else {
                let remaining = item.quantity;
                const batches = batchLists[item.material_id] || [];
                for (const batch of batches) {
                  if (remaining <= 0) break;
                  if (batch.quantity <= 0) continue; // 已经被前面耗尽（同种物品分配多行时）
                  const deduct = Math.min(remaining, batch.quantity);
                  await req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
                  if (!traceSupplierBatch) traceSupplierBatch = batch.supplier_batch_no;
                  if (!traceHeatNo) traceHeatNo = batch.heat_no;
                  batch.quantity -= deduct; // 内存扣减供后续同行使用
                  remaining -= deduct;
                }
              }
              if (traceSupplierBatch || traceHeatNo) {
                await req.db.run('UPDATE pick_items SET supplier_batch_no = ?, heat_no = ? WHERE id = ?', [traceSupplierBatch || null, traceHeatNo || null, item.id]);
              }
            }
            
            if (order.order_id && !isReturn) {
              await req.db.run('UPDATE order_materials SET picked_quantity = picked_quantity + ? WHERE order_id = ? AND material_id = ?',
                [item.quantity, order.order_id, item.material_id]);
            }
          } // end for items
        } // end if items.length > 0
        // 【联动#6】领料完成后检查生产工单原材料是否领齐
        if (order.production_order_id) {
          const production = await req.db.get('SELECT * FROM production_orders WHERE id = ?', [order.production_order_id]);
          if (production && production.order_id) {
            const requiredMaterials = await req.db.all('SELECT * FROM order_materials WHERE order_id = ?', [production.order_id]);
            const allPicked = requiredMaterials.length > 0 && requiredMaterials.every(m => (m.picked_quantity || 0) >= m.required_quantity);
            if (allPicked) {
              await req.db.run("UPDATE production_orders SET material_ready = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [order.production_order_id]);
            }
          }
        }
        
        // 【通知】领料完成后检查库存水位
        if (!isReturn) {
          for (const item of items) {
            const totalInv = await req.db.get(
              `SELECT COALESCE(inv_sum.total, 0) as total, p.stock_threshold, p.name 
               FROM products p 
               LEFT JOIN (SELECT product_id, SUM(quantity) as total FROM inventory WHERE product_id = ? GROUP BY product_id) inv_sum 
               ON p.id = inv_sum.product_id 
               WHERE p.id = ?`, [item.material_id, item.material_id]);
            if (totalInv && totalInv.stock_threshold > 0 && totalInv.total <= totalInv.stock_threshold) {
              await sendNotification(req.db, null, 'warning', `库存预警：${totalInv.name}`, `物料「${totalInv.name}」当前库存 ${totalInv.total}，已低于安全水位 ${totalInv.stock_threshold}`, 'inventory', item.material_id);
            }
          }
        }
      }
      await req.db.run('UPDATE pick_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { order_id, production_order_id, warehouse_id, operator, remark, items } = req.body;

    // 预取产品信息（用于单位换算）
    const materialIds = [...new Set(items.map(i => i.material_id).filter(Boolean))];
    const productMap = new Map();
    if (materialIds.length > 0) {
      const ph = materialIds.map(() => '?').join(',');
      const rows = await req.db.all(`SELECT id, unit, outer_diameter, wall_thickness, length FROM products WHERE id IN (${ph})`, materialIds);
      rows.forEach(p => productMap.set(p.id, p));
    }

    await req.db.transaction(async () => {
      await req.db.run('UPDATE pick_orders SET order_id = ?, production_order_id = ?, warehouse_id = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [order_id || null, production_order_id || null, warehouse_id, operator, remark, req.params.id]);
      await req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [req.params.id]);
      for (const item of items) {
        const product = productMap.get(item.material_id);
        const inputQuantity = item.input_quantity || item.quantity;
        const inputUnit = item.input_unit || '公斤';
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        await req.db.run('INSERT INTO pick_items (pick_order_id, material_id, quantity, input_quantity, input_unit) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.material_id, quantityKg, inputQuantity, inputUnit]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('warehouse_delete'), async (req, res) => {
  try {
    const { force } = req.query;
    const order = await req.db.get('SELECT * FROM pick_orders WHERE id = ?', [req.params.id]);
    const isAdmin = req.user?.role_code === 'admin';
    if (order && order.status === 'completed' && force !== 'true' && !isAdmin) {
      return res.status(400).json({ success: false, message: '已完成的领料单不能删除，如需删除请联系管理员' });
    }
    
    await req.db.transaction(async () => {
      // 仅对已完成领料的单据回滚库存（领料=加回库存）
      if (order && order.status === 'completed') {
        const items = await req.db.all('SELECT * FROM pick_items WHERE pick_order_id = ?', [req.params.id]);
        for (const item of items) {
          // 回退库存：优先回退到最近的同物料批次，若无则新建
          const latestBatch = await req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? ORDER BY updated_at DESC LIMIT 1 FOR UPDATE', [order.warehouse_id, item.material_id]);
          if (latestBatch) {
            await req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [item.quantity, latestBatch.id]);
          } else {
            await req.db.run('INSERT INTO inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)',
              [order.warehouse_id, item.material_id, item.quantity]);
          }
        }
      }
      await req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM pick_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
