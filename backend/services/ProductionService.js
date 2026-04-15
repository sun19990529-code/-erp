const { BusinessError } = require('../utils/BusinessError');
const { generateOrderNo } = require('../utils/order-number');
const { ENTITY_STATUS } = require('../constants/status');
const Decimal = require('decimal.js');

// 模块级仓库ID缓存（仓库主数据几乎不变动，避免每次报工都查表）
let _warehouseCache = null;
let _warehouseCacheTime = 0;
const WAREHOUSE_CACHE_TTL = 5 * 60 * 1000; // 5分钟

class ProductionService {

  static async getWarehouseIds(db) {
    const now = Date.now();
    if (_warehouseCache && (now - _warehouseCacheTime) < WAREHOUSE_CACHE_TTL) {
      return _warehouseCache;
    }
    const [semi, finished] = await Promise.all([
      db.get("SELECT id FROM warehouses WHERE type = 'semi' LIMIT 1"),
      db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1")
    ]);
    _warehouseCache = { semiId: semi?.id || null, finishedId: finished?.id || null };
    _warehouseCacheTime = now;
    return _warehouseCache;
  }
  
  static async createOutsourcingOrderForProcess(db, production, processInfo, quantity) {
    const existing = await db.get(`SELECT * FROM outsourcing_orders WHERE production_order_id = ? AND process_id = ?`, [production.id, processInfo.process_id]);
    if (existing) return existing;
    const defaultSupplier = await db.get("SELECT id FROM suppliers WHERE status = ? ORDER BY id LIMIT 1", [ENTITY_STATUS.ACTIVE]) || await db.get('SELECT id FROM suppliers LIMIT 1');
    if (!defaultSupplier) { console.warn('[production] 无可用供应商，无法自动创建委外单'); return null; }
    const orderNo = generateOrderNo('WW');
    const result = await db.run(`
      INSERT INTO outsourcing_orders
        (order_no, supplier_id, production_order_id, process_id, total_amount, operator, remark, status)
      VALUES (?, ?, ?, ?, 0, '系统自动', ?, 'pending')
    `, [orderNo, defaultSupplier.id, production.id, processInfo.process_id, `自动创建 - 工序: ${processInfo.process_name}`]);
    const orderId = result.lastInsertRowid;
    await db.run('INSERT INTO outsourcing_items (outsourcing_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, 0)', [orderId, production.product_id, quantity || production.quantity]);
    return { id: orderId, order_no: orderNo, process_id: processInfo.process_id, process_name: processInfo.process_name };
  }

  static async createFinishedProductInbound(db, production, quantity) {
    const { finishedId } = await ProductionService.getWarehouseIds(db);
    if (!finishedId) return null;
    const warehouse = { id: finishedId };
    const orderNo = generateOrderNo('IN');
    const result = await db.run(`INSERT INTO inbound_orders (order_no, type, warehouse_id, production_order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
      [orderNo, warehouse.id, production.id, `生产完成自动入库 - 生产工单: ${production.order_no}`]);
    const inboundId = result.lastInsertRowid;
    const batchNo = `PRD-${production.order_no}`;
    await db.run(`INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, 0)`, [inboundId, production.product_id, batchNo, quantity]);
    const inventory = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [warehouse.id, production.product_id, batchNo]);
    if (inventory) {
      await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [quantity, inventory.id]);
    } else {
      await db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [warehouse.id, production.product_id, batchNo, quantity]);
    }
    return { id: inboundId, order_no: orderNo };
  }

  static async updateOrderProgress(db, orderId) {
    const productionOrders = await db.all('SELECT * FROM production_orders WHERE order_id = ?', [orderId]);
    if (productionOrders.length === 0) return;
  
    const prodIds = [...new Set(productionOrders.map(po => po.product_id))];
    const prodPh = prodIds.map(() => '?').join(',');
    // 查每个产品有几道工序
    const allProcessCounts = await db.all(
      `SELECT product_id, COUNT(*) as total FROM product_processes WHERE product_id IN (${prodPh}) GROUP BY product_id`, prodIds
    );
    const processCountMap = Object.fromEntries(allProcessCounts.map(r => [r.product_id, r.total]));

    // 查每个产品的工序列表（用于逐工序计算产出比）
    const allProcesses = await db.all(
      `SELECT pp.product_id, pr.code as process_code FROM product_processes pp JOIN processes pr ON pp.process_id = pr.id WHERE pp.product_id IN (${prodPh}) ORDER BY pp.sequence`, prodIds
    );

    const poIds = productionOrders.map(po => po.id);
    const poPh = poIds.map(() => '?').join(',');
    // 查每个工单每道工序的累计产出
    const allOutputs = await db.all(
      `SELECT ppr.production_order_id, pr.code as process_code, COALESCE(SUM(ppr.output_quantity), 0) as output
       FROM production_process_records ppr JOIN processes pr ON ppr.process_id = pr.id
       WHERE ppr.production_order_id IN (${poPh}) AND ppr.status = 'completed'
       GROUP BY ppr.production_order_id, pr.code`, poIds
    );
    const outputMap = {};
    allOutputs.forEach(r => {
      if (!outputMap[r.production_order_id]) outputMap[r.production_order_id] = {};
      outputMap[r.production_order_id][r.process_code] = parseFloat(r.output) || 0;
    });

    let totalProgress = new Decimal(0);
    for (const po of productionOrders) {
      if (po.status === 'completed') {
        totalProgress = totalProgress.plus(100);
      } else {
        const ppList = allProcesses.filter(pp => pp.product_id === po.product_id);
        const poOutputs = outputMap[po.id] || {};
        const target = po.quantity || 0;
        if (ppList.length > 0 && target > 0) {
          let weightedSum = new Decimal(0);
          for (const pp of ppList) {
            const out = poOutputs[pp.process_code] || 0;
            weightedSum = weightedSum.plus(Decimal.min(new Decimal(out).div(target), 1));
          }
          totalProgress = totalProgress.plus(weightedSum.div(ppList.length).times(100));
        }
      }
    }
    const avgProgress = totalProgress.div(productionOrders.length).toDecimalPlaces(0).toNumber();
    const newStatus = avgProgress >= 100 ? 'completed' : avgProgress > 0 ? 'processing' : 'pending';
    await db.run('UPDATE orders SET progress = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [avgProgress, newStatus, orderId]);
    if (newStatus === 'completed') { await ProductionService.createFinishedProductOutbound(db, orderId); }
  }

  static async createFinishedProductOutbound(db, orderId) {
    const existing = await db.get(`SELECT * FROM outbound_orders WHERE order_id = ? AND type = 'finished'`, [orderId]);
    if (existing) return existing;
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return null;
    const warehouse = await db.get("SELECT id FROM warehouses WHERE type = 'finished' LIMIT 1");
    if (!warehouse) return null;
    const orderItems = await db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    if (orderItems.length === 0) return null;
    
    // N+1 Optimization 
    const prodIds = [...new Set(orderItems.map(item => item.product_id))];
    const prodPh = prodIds.map(() => '?').join(',');
    const invRecords = await db.all(`SELECT product_id, SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id IN (${prodPh}) GROUP BY product_id`, [warehouse.id, ...prodIds]);
    const invMap = Object.fromEntries(invRecords.map(r => [r.product_id, r.total]));

    for (const item of orderItems) {
      const invTotal = invMap[item.product_id] || 0;
      if (invTotal < item.quantity) {
        return { pending: true, message: `成品库存不足，请入库后手动创建出库单` };
      }
    }
    
    const orderNo = generateOrderNo('OUT');
    const result = await db.run(`INSERT INTO outbound_orders (order_no, type, warehouse_id, order_id, total_amount, operator, remark, status) VALUES (?, 'finished', ?, ?, 0, '系统自动', ?, 'approved')`,
      [orderNo, warehouse.id, orderId, `订单完成自动出库 - 销售订单: ${order.order_no}`]);
    const outboundId = result.lastInsertRowid;
    for (const item of orderItems) {
      let remaining = item.quantity;
      const batches = await db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC FOR UPDATE', [warehouse.id, item.product_id]);
      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity);
        await db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
        await db.run(`INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`, [outboundId, item.product_id, batch.batch_no, deduct, item.unit_price || 0]);
        remaining -= deduct;
      }
    }
    return { id: outboundId, order_no: orderNo };
  }

  static async submitProcessReport(db, productionId, params) {
    const { process_id, operator, input_quantity, output_quantity, defect_quantity, remark, outsourcing_id, force } = params;
    let responseData = { success: true };
    
    const production = await db.get('SELECT * FROM production_orders WHERE id = ? FOR UPDATE', [productionId]);
    if (!production) throw new BusinessError('该工单不存在');

    const productProcesses = await db.all(`SELECT pp.*, p.code as process_code, p.name as process_name FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [production.product_id]);
    const currentProcess = await db.get('SELECT * FROM processes WHERE id = ?', [process_id]);
    const currentIndex = productProcesses.findIndex(pp => pp.process_id == process_id);
    
    const historyTotal = await db.get('SELECT COALESCE(SUM(input_quantity), 0) as total_input, COALESCE(SUM(output_quantity), 0) as total_output, COALESCE(SUM(defect_quantity), 0) as total_defect FROM production_process_records WHERE production_order_id = ? AND process_id = ? AND status = ?', [productionId, process_id, 'completed']);
    const willTotalOutput = (historyTotal.total_output || 0) + (output_quantity || 0);
    const willTotalDefect = (historyTotal.total_defect || 0) + (defect_quantity || 0);
    
    if (currentIndex > 0) {
      const prevProcess = productProcesses[currentIndex - 1];
      const prevProcessTotal = await db.get('SELECT COALESCE(SUM(output_quantity), 0) as total_output FROM production_process_records WHERE production_order_id = ? AND process_id = ? AND status = ?', [productionId, prevProcess.process_id, 'completed']);
      if ((willTotalOutput + willTotalDefect) > prevProcessTotal.total_output) {
        throw new BusinessError(`越界拦截：前置工序[${prevProcess.process_name}]累计产出为 ${prevProcessTotal.total_output}，本次报工后总产出将达 ${willTotalOutput + willTotalDefect}，已超限！请核对报工数量。`);
      }
    } else {
      const willTotalInput = (historyTotal.total_input || 0) + (input_quantity || 0);
      if ((willTotalOutput + willTotalDefect) > willTotalInput) {
        throw new BusinessError(`越界拦截：首道工序本次报工后总产出(${willTotalOutput + willTotalDefect})将超过总投入数量(${willTotalInput})！`);
      }
    }
    
    await db.run(`INSERT INTO production_process_records (production_order_id, process_id, operator, input_quantity, output_quantity, defect_quantity, status, start_time, end_time, remark, outsourcing_id) VALUES (?, ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
      [productionId, process_id, operator, input_quantity, output_quantity, defect_quantity, remark, outsourcing_id || null]);
    
    const cumulativeOutput = willTotalOutput;
    
    if (currentIndex === 0) {
      if (!force) {
        const completedPick = await db.get(
          "SELECT id FROM pick_orders WHERE production_order_id = ? AND type = 'pick' AND status = 'completed' LIMIT 1",
          [productionId]
        );
        if (!completedPick) {
          throw new BusinessError('请先为该工单创建并完成领料单，再进行首道工序报工');
        }
      }

      const pickedTotal = await db.get(
        `SELECT COALESCE(SUM(pi.quantity), 0) as total_picked
         FROM pick_items pi
         JOIN pick_orders pk ON pi.pick_order_id = pk.id
         WHERE pk.production_order_id = ? AND pk.type = 'pick' AND pk.status = 'completed'`,
        [productionId]
      );
      const totalPicked = pickedTotal?.total_picked || 0;
      const willTotalInput = (historyTotal.total_input || 0) + (input_quantity || 0);
      if (totalPicked > 0 && willTotalInput > totalPicked) {
        throw new BusinessError(`投入量超限：已领料 ${totalPicked}，累计投入将达 ${willTotalInput}，超出已领材料数量！`);
      }

      const pickedMaterials = await db.all(
        `SELECT pi.material_id, p.name as material_name, p.code as material_code, p.unit,
                p.outer_diameter, p.wall_thickness, p.length as material_length,
                SUM(pi.quantity) as picked_quantity, pi.batch_no, pi.supplier_batch_no, pi.heat_no
         FROM pick_items pi
         JOIN pick_orders pk ON pi.pick_order_id = pk.id
         JOIN products p ON pi.material_id = p.id
         WHERE pk.production_order_id = ? AND pk.type = 'pick' AND pk.status = 'completed'
         GROUP BY pi.material_id, p.name, p.code, p.unit, p.outer_diameter, p.wall_thickness, p.length, pi.batch_no, pi.supplier_batch_no, pi.heat_no`,
        [productionId]
      );
      responseData.pickedMaterials = pickedMaterials;
      responseData.totalPicked = totalPicked;
    }
    
    const targetQty = production.quantity;
    let outsourcingOrder = null;
    
    if (production.status === 'pending') {
      await db.run('UPDATE production_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['processing', productionId]);
    }
    
    const totalCompleted = await db.get('SELECT COALESCE(SUM(output_quantity), 0) as total FROM production_process_records WHERE production_order_id = ? AND process_id = (SELECT process_id FROM product_processes WHERE product_id = ? ORDER BY sequence DESC LIMIT 1)', [productionId, production.product_id]);
    await db.run('UPDATE production_orders SET completed_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalCompleted?.total || 0, productionId]);
    
    const currentPP = productProcesses[currentIndex];
    const actualOutput = output_quantity || 0;
    const { semiId, finishedId } = await ProductionService.getWarehouseIds(db);
    const semiWarehouse = semiId ? { id: semiId } : null;
    const finishedWarehouse = finishedId ? { id: finishedId } : null;
    
    if (currentIndex > 0 && actualOutput > 0) {
      const prevPP = productProcesses[currentIndex - 1];
      if (prevPP.output_product_id && semiWarehouse) {
        const batches = await db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC FOR UPDATE', [semiWarehouse.id, prevPP.output_product_id]);
        let available = 0;
        for (const row of batches) available += row.quantity;
        
        if (available < actualOutput) {
          const prevProduct = await db.get('SELECT name FROM products WHERE id = ?', [prevPP.output_product_id]);
          throw new BusinessError(`半成品「${prevProduct?.name || prevPP.output_product_id}」库存不足！需要 ${actualOutput}，当前 ${available}`);
        }
        
        let remaining = actualOutput;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, batch.quantity);
          await db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
          remaining -= deduct;
        }
      }
    }
    
    if (currentPP.output_product_id && actualOutput > 0) {
      const isLastProcess = currentIndex === productProcesses.length - 1;
      let targetWarehouse;
      if (isLastProcess) {
        targetWarehouse = finishedWarehouse;
      } else if (currentPP.output_product_id === production.product_id) {
        targetWarehouse = semiWarehouse;
      } else {
        targetWarehouse = semiWarehouse;
      }
      if (targetWarehouse) {
        const batchNo = `PRD-${production.order_no}`;
        const existingInv = await db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [targetWarehouse.id, currentPP.output_product_id, batchNo]);
        if (existingInv) {
          await db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [actualOutput, existingInv.id]);
        } else {
          await db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [targetWarehouse.id, currentPP.output_product_id, batchNo, actualOutput]);
        }
        responseData.semiProductInbound = {
          product_id: currentPP.output_product_id,
          quantity: actualOutput,
          warehouse_type: isLastProcess ? 'finished' : 'semi'
        };
      }
    }
    
    if (cumulativeOutput >= targetQty) {
      if (currentIndex < productProcesses.length - 1) {
        const nextProcess = productProcesses[currentIndex + 1];
        await db.run('UPDATE production_orders SET current_process = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [nextProcess.process_code, productionId]);
        if (nextProcess.is_outsourced === 1) {
          outsourcingOrder = await ProductionService.createOutsourcingOrderForProcess(db, production, nextProcess, cumulativeOutput);
        }
      } else {
        await db.run('UPDATE production_orders SET current_process = ?, status = ?, completed_quantity = ?, end_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentProcess.code, 'completed', cumulativeOutput, productionId]);
        if (!currentPP.output_product_id) {
          const inboundOrder = await ProductionService.createFinishedProductInbound(db, production, cumulativeOutput);
          responseData.inboundOrder = inboundOrder;
        }
        if (production.order_id) { await ProductionService.updateOrderProgress(db, production.order_id); }
      }
    }
    
    responseData.processProgress = {
      cumulative_output: cumulativeOutput,
      target_quantity: targetQty,
      remaining: Math.max(0, targetQty - cumulativeOutput),
      is_completed: cumulativeOutput >= targetQty
    };
    responseData.outsourcingOrder = outsourcingOrder;

    return responseData;
  }
}

module.exports = ProductionService;
