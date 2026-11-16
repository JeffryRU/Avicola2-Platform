/*
 * Apariencia antes del primer pintado (sin parpadeo): pone data-theme, data-contrast y data-brand
 * en <html> y el color de la barra del navegador. Es un archivo aparte (no un script en línea)
 * porque la CSP solo permite scripts propios ('self').
 * Misma regla que src/shared/domain/appearance.ts (resolveAppearance y themeColor); lo comprueba
 * src/shared/unit-tests/appearance.test.ts. Las claves las guarda BrowserStore como JSON.
 */
;(function (d, w) {
  var read = function (k, ok) {
    try {
      var v = JSON.parse(w.localStorage.getItem(k))
      return ok.indexOf(v) >= 0 ? v : null
    } catch (e) {
      return null
    }
  }
  var mq = function (q) {
    try {
      return w.matchMedia(q).matches
    } catch (e) {
      return false
    }
  }
  var pt = read('nv_theme', ['light', 'dark']) || 'system'
  var pc = read('nv_contrast', ['normal', 'high']) || 'system'
  var brand = read('nv_brand', ['noraves', 'rocio']) || 'noraves'
  var theme = pt === 'system' ? (mq('(prefers-color-scheme: dark)') ? 'dark' : 'light') : pt
  var contrast = pc === 'system' ? (mq('(prefers-contrast: more)') ? 'high' : 'normal') : pc
  var root = d.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-contrast', contrast)
  root.setAttribute('data-brand', brand)
  var color =
    contrast === 'high' ? (brand === 'rocio' ? '#1f1d1b' : '#0b2c61') : theme === 'dark' ? '#14171b' : '#fbfbf9'
  var meta = d.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', color)
})(document, window)
