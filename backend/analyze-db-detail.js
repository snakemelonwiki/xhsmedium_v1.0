/**
 * 根因定位分析脚本 - 第二阶段
 * 详细分析慢查询、N+1 问题、实际执行时间
 */
const mysql = require('mysql2/promise');

const DB = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'caigua123...',
  database: 'lan_dual_role_system'
};

async function main() {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('=== 根因定位报告 - 详细分析 ===\n');

    // 【1. 测试实际查询耗时 - leads findFilteredPaged】
    console.log('【A. 实际查询耗时测试】');

    // 测试 leads 列表查询（带 scope=all）
    console.log('\n--- leads.findAllPaged (20条) ---');
    let start = Date.now();
    await conn.query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 20`);
    console.log(`  无过滤: ${Date.now() - start}ms`);

    // 测试带搜索的 leads 查询
    start = Date.now();
    await conn.query(`SELECT * FROM leads WHERE (contact_info LIKE '%test%' OR nickname LIKE '%test%' OR lead_code LIKE '%test%' OR note LIKE '%test%') ORDER BY created_at DESC LIMIT 20`);
    console.log(`  带搜索: ${Date.now() - start}ms`);

    // 测试 posts plaza 查询
    console.log('\n--- posts plaza 查询 ---');
    start = Date.now();
    const plazaSql = `
      SELECT p.id, p.likes,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count
      FROM posts p WHERE 1=1
      ORDER BY leads_count DESC, p.likes DESC
      LIMIT 20 OFFSET 0
    `;
    await conn.query(plazaSql);
    console.log(`  plaza 数据查询: ${Date.now() - start}ms`);

    // 测试 posts plaza 完整查询（带 join 和子查询）
    start = Date.now();
    const fullPlazaSql = `
      SELECT p.id, p.employee_id, p.account_id, p.platform, p.title,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count,
        (SELECT COUNT(*) FROM favorites fav WHERE fav.target_type = 'post' AND fav.target_id = p.id) AS favorite_count
      FROM posts p
      LEFT JOIN employees e ON e.id = p.employee_id
      LEFT JOIN accounts a ON a.id = p.account_id
      WHERE 1=1
      ORDER BY leads_count DESC, p.likes DESC
      LIMIT 20 OFFSET 0
    `;
    await conn.query(fullPlazaSql);
    console.log(`  plaza 完整查询: ${Date.now() - start}ms`);

    // 测试 orders 列表查询
    console.log('\n--- orders.listPaged ---');
    start = Date.now();
    await conn.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 20`);
    console.log(`  无过滤: ${Date.now() - start}ms`);

    // 测试 notifications 查询
    console.log('\n--- notifications.listForUser ---');
    start = Date.now();
    await conn.query(`SELECT * FROM notifications WHERE receiver_id = 'test-load-admin' ORDER BY read_status ASC, created_at DESC LIMIT 20`);
    console.log(`  基础查询: ${Date.now() - start}ms`);

    // 【2. 分析 mapLeads 的 N+1 问题】
    console.log('\n【B. N+1 问题分析 (mapLeads)】');
    console.log('leads 列表 mapLeads 会执行:');
    console.log('  1. SELECT * FROM leads ORDER BY created_at DESC LIMIT 20');
    console.log('  2. SELECT * FROM lead_follow_records WHERE lead_id IN (...) ORDER BY created_at DESC');
    console.log('  3. SELECT * FROM collaboration_tasks WHERE lead_id IN (...) ORDER BY requested_at DESC');
    console.log('  4. SELECT * FROM accounts WHERE id IN (...)');
    console.log('  5. SELECT * FROM posts WHERE id IN (...)');

    // 测试这些 N+1 查询
    start = Date.now();
    const leads = await conn.query(`SELECT id FROM leads ORDER BY created_at DESC LIMIT 20`);
    const leadIds = leads[0].map(r => r.id);
    await conn.query(`SELECT * FROM lead_follow_records WHERE lead_id IN ('${leadIds.join("','")}') ORDER BY created_at DESC`);
    console.log(`  lead_follow_records 查询: ${Date.now() - start}ms`);

    start = Date.now();
    await conn.query(`SELECT * FROM collaboration_tasks WHERE lead_id IN ('${leadIds.join("','")}') ORDER BY requested_at DESC`);
    console.log(`  collaboration_tasks 查询: ${Date.now() - start}ms`);

    // 【3. 分析 orders 的 filesort 问题】
    console.log('\n【C. orders 索引缺失问题】');
    const ordersIdx = await conn.query('SHOW INDEX FROM orders');
    const hasOrdersCreatedIdx = ordersIdx[0].some(r => r.Key_name === 'idx_orders_created_at');
    console.log(`  orders.created_at 索引存在: ${hasOrdersCreatedIdx}`);
    console.log(`  orders 索引列表: ${ordersIdx[0].map(r => r.Key_name + ':' + r.Column_name).join(', ')}`);

    // 测试 explain orders with scope filter
    console.log('\n--- orders with admin filter ---');
    const ordersAdminExplain = await conn.query(`EXPLAIN SELECT * FROM orders ORDER BY created_at DESC LIMIT 20`);
    console.log(`  type: ${ordersAdminExplain[0][0].type}`);
    console.log(`  key: ${ordersAdminExplain[0][0].key}`);
    console.log(`  rows: ${ordersAdminExplain[0][0].rows}`);
    console.log(`  Extra: ${ordersAdminExplain[0][0].Extra}`);

    // 【4. 分析 posts plaza 的完整查询】
    console.log('\n【D. posts plaza 查询分析】');
    console.log('findPlaza 执行复杂 SQL:');
    console.log('  1. Count 子查询 (带 leads_count 子查询)');
    console.log('  2. 数据查询 (带 2 个 leads_count + 1 个 favorites_count 子查询 + 2 个 JOIN)');
    console.log('  3. posts.plaza 每次查询最多 3 个子查询，N+1 问题严重');

    // 【5. 测试 notifications 复合索引使用情况】
    console.log('\n【E. notifications 索引分析】');
    const notifIdx = await conn.query('SHOW INDEX FROM notifications');
    console.log('notifications 索引:');
    notifIdx[0].forEach(r => {
      console.log(`  ${r.Key_name}: ${r.Column_name} (${r.Seq_in_index})`);
    });

    // 测试 notifications 查询的 Extra
    const notifExplain = await conn.query(`EXPLAIN SELECT * FROM notifications WHERE receiver_id = 'test-load-admin' ORDER BY read_status ASC, created_at DESC LIMIT 20`);
    console.log(`\nnotifications 查询分析:`);
    console.log(`  type: ${notifExplain[0][0].type}`);
    console.log(`  key: ${notifExplain[0][0].key}`);
    console.log(`  rows: ${notifExplain[0][0].rows}`);
    console.log(`  Extra: ${notifExplain[0][0].Extra}`);

    // 【6. 分析 posts 缺少 likes 索引】
    console.log('\n【F. posts 排序字段索引】');
    const postsIdx = await conn.query('SHOW INDEX FROM posts');
    const hasLikesIdx = postsIdx[0].some(r => r.Column_name === 'likes');
    console.log(`  posts.likes 索引存在: ${hasLikesIdx}`);
    console.log(`  posts 排序: leads_count DESC, likes DESC, published_at DESC`);
    console.log(`  问题: leads_count 是计算字段无法索引，likes 无索引导致 filesort`);

    // 【7. 连接泄漏检测】
    console.log('\n【G. 连接泄漏检测】');
    const [procs] = await conn.query('SHOW PROCESSLIST');
    const sleepConns = procs.filter(p => p.Command === 'Sleep' && p.Time > 60);
    console.log(`  60秒以上空闲连接: ${sleepConns.length}`);
    if (sleepConns.length > 0) {
      console.log('  空闲连接详情:');
      sleepConns.slice(0, 5).forEach(p => {
        console.log(`    [${p.Id}] ${p.User}@${p.Host} - Sleep ${p.Time}s`);
      });
    }

    // 【8. 并发场景模拟 - 连接池争用】
    console.log('\n【H. 连接池争用分析】');
    console.log('  当前后端配置 connectionLimit=50');
    console.log('  当前 MySQL 占用: 62 连接 (41.1%)');
    console.log('  压测 VU=50 场景:');
    console.log('    - 每个 VU 可能有多个请求');
    console.log('    - leads.list 请求会执行 5 个查询 (leads + 4 个 N+1)');
    console.log('    - 50 VU 并发 = 250 个并发查询');
    console.log('    - 连接池 50 但 MySQL 总连接只有 151');
    console.log('    - 瓶颈: MySQL 单线程 JOIN + filesort + 无索引覆盖');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(console.error);
