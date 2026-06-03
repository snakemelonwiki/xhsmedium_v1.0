/**
 * 根因定位分析脚本
 * 执行 MySQL 连接池、慢查询、EXPLAIN、索引审计
 */
const mysql = require('mysql2/promise');

const DB = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'caigua123...',
  database: 'lan_dual_role_system',
  multipleStatements: true
};

async function main() {
  let conn;
  try {
    conn = await mysql.createConnection(DB);
    console.log('=== 根因定位报告 ===\n');

    // 【1. MySQL 连接池状态】
    console.log('【1. MySQL 连接池】');
    const [connVars] = await conn.query(`
      SELECT @@max_connections AS max_connections,
             @@wait_timeout AS wait_timeout,
             @@interactive_timeout AS interactive_timeout
    `);
    const [threadsConn] = await conn.query("SHOW STATUS LIKE 'Threads_connected'");
    const [maxUsed] = await conn.query("SHOW STATUS LIKE 'Max_used_connections'");
    console.log(`- MySQL 上限: max_connections=${connVars[0].max_connections}`);
    console.log(`- 当前占用: Threads_connected=${threadsConn[0].Value}`);
    console.log(`- 历史峰值: Max_used_connections=${maxUsed[0].Value}`);
    console.log(`- 连接池配置: 50 (app.module.ts)`);
    const usedPct = (parseInt(threadsConn[0].Value) / parseInt(connVars[0].max_connections) * 100).toFixed(1);
    console.log(`- 占用率: ${usedPct}%`);
    console.log(`- 是否有连接耗尽: ${parseInt(threadsConn[0].Value) >= parseInt(connVars[0].max_connections) - 5 ? '濒临' : '否'}`);
    console.log('');

    // 【2. 慢查询日志】
    console.log('【2. 慢查询日志】');
    const [slowLog] = await conn.query(`
      SELECT @@slow_query_log AS slow_query_log,
             @@long_query_time AS long_query_time,
             @@slow_query_log_file AS slow_query_log_file
    `);
    console.log(`- slow_query_log: ${slowLog[0].slow_query_log}`);
    console.log(`- long_query_time: ${slowLog[0].long_query_time} 秒`);
    console.log(`- slow_query_log_file: ${slowLog[0].slow_query_log_file}`);

    // 【3. 表数据量】
    console.log('\n【表数据量】');
    const tables = ['leads', 'posts', 'orders', 'notifications', 'employees', 'accounts'];
    for (const t of tables) {
      try {
        const [cnt] = await conn.query(`SELECT COUNT(*) AS cnt FROM \`${t}\``);
        console.log(`- ${t}: ${cnt[0].cnt} 行`);
      } catch(e) {
        console.log(`- ${t}: 查询失败 (${e.message})`);
      }
    }

    // 【4. EXPLAIN 分析 - leads 列表】
    console.log('\n【3. EXPLAIN 分析】');
    console.log('\n--- leads 列表查询 ---');
    const leadsExplain = await conn.query(`
      EXPLAIN FORMAT=JSON
      SELECT * FROM leads ORDER BY created_at DESC LIMIT 20
    `);
    console.log(JSON.stringify(leadsExplain[0][0], null, 2).substring(0, 2000));

    // 【5. leads 索引审计】
    console.log('\n--- leads 表索引 ---');
    const leadsIdx = await conn.query('SHOW INDEX FROM leads');
    console.log('索引列: ' + leadsIdx[0].map(r => `${r.Key_name}:${r.Column_name}(${r.Index_type})`).join(', '));

    // 【6. EXPLAIN posts/plaza 查询】
    console.log('\n--- posts plaza 查询 ---');
    try {
      const plazaExplain = await conn.query(`
        EXPLAIN FORMAT=JSON
        SELECT p.id,
          (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count
        FROM posts p
        WHERE 1=1
        ORDER BY leads_count DESC, p.likes DESC
        LIMIT 20 OFFSET 0
      `);
      console.log(JSON.stringify(plazaExplain[0][0], null, 2).substring(0, 2000));
    } catch(e) {
      console.log('posts plaza EXPLAIN 失败: ' + e.message);
    }

    // 【7. posts 索引审计】
    console.log('\n--- posts 表索引 ---');
    const postsIdx = await conn.query('SHOW INDEX FROM posts');
    console.log('索引列: ' + postsIdx[0].map(r => `${r.Key_name}:${r.Column_name}`).join(', '));

    // 【8. EXPLAIN orders 查询】
    console.log('\n--- orders 列表查询 ---');
    try {
      const ordersExplain = await conn.query(`
        EXPLAIN FORMAT=JSON
        SELECT * FROM orders ORDER BY created_at DESC LIMIT 20
      `);
      console.log(JSON.stringify(ordersExplain[0][0], null, 2).substring(0, 2000));
    } catch(e) {
      console.log('orders EXPLAIN 失败: ' + e.message);
    }

    // 【9. orders 索引审计】
    console.log('\n--- orders 表索引 ---');
    const ordersIdx = await conn.query('SHOW INDEX FROM orders');
    console.log('索引列: ' + ordersIdx[0].map(r => `${r.Key_name}:${r.Column_name}`).join(', '));

    // 【10. EXPLAIN notifications 查询】
    console.log('\n--- notifications 列表查询 ---');
    try {
      const notifExplain = await conn.query(`
        EXPLAIN FORMAT=JSON
        SELECT * FROM notifications WHERE receiver_id = 'test-load-admin'
        ORDER BY read_status ASC, created_at DESC LIMIT 20
      `);
      console.log(JSON.stringify(notifExplain[0][0], null, 2).substring(0, 2000));
    } catch(e) {
      console.log('notifications EXPLAIN 失败: ' + e.message);
    }

    // 【11. notifications 索引审计】
    console.log('\n--- notifications 表索引 ---');
    const notifIdx = await conn.query('SHOW INDEX FROM notifications');
    console.log('索引列: ' + notifIdx[0].map(r => `${r.Key_name}:${r.Column_name}`).join(', '));

    // 【12. 当前连接活动】
    console.log('\n【5. 连接活动 (SHOW PROCESSLIST)】');
    const [procs] = await conn.query('SHOW PROCESSLIST');
    console.log(`总连接数: ${procs.length}`);
    procs.slice(0, 10).forEach(p => {
      const info = (p.Info || '').substring(0, 80);
      console.log(`  [${p.Id}] ${p.User}@${p.Host} - ${p.Command} - ${info}`);
    });
    if (procs.length > 10) console.log(`  ... 还有 ${procs.length - 10} 个连接`);

    // 【13. 关键字段选择性分析】
    console.log('\n【4. 字段选择性分析】');
    const selectivityQueries = [
      { sql: "SELECT COUNT(DISTINCT status) FROM leads", name: 'leads.status' },
      { sql: "SELECT COUNT(DISTINCT process_status) FROM leads", name: 'leads.process_status' },
      { sql: "SELECT COUNT(DISTINCT employee_id) FROM leads", name: 'leads.employee_id' },
      { sql: "SELECT COUNT(DISTINCT assigned_sales_user_id) FROM leads WHERE assigned_sales_user_id IS NOT NULL AND assigned_sales_user_id != ''", name: 'leads.assigned_sales_user_id (非空)' },
      { sql: "SELECT COUNT(DISTINCT order_status) FROM orders", name: 'orders.order_status' },
      { sql: "SELECT COUNT(DISTINCT receiver_id) FROM notifications", name: 'notifications.receiver_id' },
      { sql: "SELECT COUNT(DISTINCT receiver_id) FROM notifications WHERE receiver_id = 'test-load-admin'", name: 'notifications.receiver_id = test-load-admin' },
    ];
    for (const q of selectivityQueries) {
      try {
        const [r] = await conn.query(q.sql);
        console.log(`- ${q.name}: ${r[0][Object.keys(r[0])[0]]} 个不同值`);
      } catch(e) {
        console.log(`- ${q.name}: 查询失败`);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(console.error);
