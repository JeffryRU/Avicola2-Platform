/* =============================================================
   Noraves · consultas para revisar los datos en Azure SQL
   Ábrelas en Azure Data Studio, SSMS, el editor de consultas del
   portal de Azure o la extensión "SQL Server (mssql)" de VS Code.
   Las tablas usan el prefijo np_ en el esquema dbo.
   ============================================================= */

-- 1. Tablas creadas por la app
SELECT name AS tabla, create_date
FROM sys.tables WHERE name LIKE 'np[_]%' ORDER BY name;

-- 2. Vendedores y productos
SELECT id, usuario, nombre, zona, activo FROM dbo.np_vendedores ORDER BY id;
SELECT id, categoria, nombre, kg_por_unidad FROM dbo.np_productos ORDER BY categoria, orden;

-- 3. Últimas proyecciones registradas (una fila por vendedor y día)
SELECT TOP (50)
  CONVERT(varchar(10), p.fecha, 23)  AS fecha,
  v.usuario, v.nombre, p.categoria, p.estado,
  p.total_unidades, p.total_kg,
  DATEADD(HOUR, -5, p.enviado_en)    AS enviado_hora_peru,
  p.envio_id
FROM dbo.np_proyecciones p
JOIN dbo.np_vendedores v ON v.id = p.vendedor_id
ORDER BY p.enviado_en DESC;

-- 4. Detalle por producto de una fecha (cambia la fecha)
DECLARE @fecha DATE = CAST(GETDATE() AS DATE);
SELECT v.usuario, pr.nombre AS producto, d.unidades, d.kg
FROM dbo.np_proyecciones p
JOIN dbo.np_vendedores v       ON v.id = p.vendedor_id
JOIN dbo.np_proyeccion_detalle d ON d.proyeccion_id = p.id
JOIN dbo.np_productos pr       ON pr.id = d.producto_id
WHERE p.fecha = @fecha
ORDER BY v.usuario, pr.orden;

-- 5. Total por día de la semana actual (lunes a domingo)
DECLARE @lunes DATE = DATEADD(DAY, -((DATEPART(WEEKDAY, GETDATE()) + @@DATEFIRST - 2) % 7), CAST(GETDATE() AS DATE));
SELECT CONVERT(varchar(10), p.fecha, 23) AS fecha,
       COUNT(DISTINCT p.vendedor_id) AS vendedores,
       SUM(p.total_unidades) AS unidades, SUM(p.total_kg) AS kg
FROM dbo.np_proyecciones p
WHERE p.fecha BETWEEN @lunes AND DATEADD(DAY, 6, @lunes)
GROUP BY p.fecha ORDER BY p.fecha;

-- 6. Matriz producto x día (semana actual, todos los vendedores)
SELECT pr.nombre AS producto,
  SUM(CASE WHEN p.fecha = @lunes                   THEN d.unidades ELSE 0 END) AS lun,
  SUM(CASE WHEN p.fecha = DATEADD(DAY,1,@lunes)    THEN d.unidades ELSE 0 END) AS mar,
  SUM(CASE WHEN p.fecha = DATEADD(DAY,2,@lunes)    THEN d.unidades ELSE 0 END) AS mie,
  SUM(CASE WHEN p.fecha = DATEADD(DAY,3,@lunes)    THEN d.unidades ELSE 0 END) AS jue,
  SUM(CASE WHEN p.fecha = DATEADD(DAY,4,@lunes)    THEN d.unidades ELSE 0 END) AS vie,
  SUM(CASE WHEN p.fecha = DATEADD(DAY,5,@lunes)    THEN d.unidades ELSE 0 END) AS sab,
  SUM(CASE WHEN p.fecha = DATEADD(DAY,6,@lunes)    THEN d.unidades ELSE 0 END) AS dom,
  SUM(d.unidades) AS total_unidades, SUM(d.kg) AS total_kg
FROM dbo.np_proyeccion_detalle d
JOIN dbo.np_proyecciones p ON p.id = d.proyeccion_id
JOIN dbo.np_productos pr   ON pr.id = d.producto_id
WHERE p.fecha BETWEEN @lunes AND DATEADD(DAY, 6, @lunes)
GROUP BY pr.nombre, pr.orden ORDER BY pr.orden;
