/*
 * Apariencia antes del primer pintado (sin parpadeo): pone data-theme, data-contrast, data-brand, data-accent
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
  var pt = read('nv_theme_mode', ['system', 'light', 'dark']) || 'light'
  var pc = read('nv_contrast', ['normal', 'high']) || 'system'
  var brand = read('nv_brand', ['noraves', 'rocio']) || 'noraves'
  var accent = read('nv_accent', ['brand', 'green', 'violet', 'orange', 'teal']) || 'brand'
  var theme = pt === 'system' ? (mq('(prefers-color-scheme: dark)') ? 'dark' : 'light') : pt
  var contrast = pc === 'system' ? (mq('(prefers-contrast: more)') ? 'high' : 'normal') : pc
  var root = d.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-contrast', contrast)
  root.setAttribute('data-brand', brand)
  root.setAttribute('data-accent', accent)
  var hcAccent = { green: '#0f3d24', violet: '#2e1065', orange: '#431407', teal: '#0b3b38' }
  var color =
    contrast === 'high'
      ? hcAccent[accent] || (brand === 'rocio' ? '#1f1d1b' : '#0b2c61')
      : theme === 'dark'
        ? '#14171b'
        : '#fbfbf9'
  // Accesibilidad (src/shared/domain/accessibility.ts: sanitizeA11y y a11yAttributes).
  var a = {}
  try {
    var raw = JSON.parse(w.localStorage.getItem('nv_a11y'))
    if (raw && typeof raw === 'object') a = raw
  } catch (e) {}
  var on = function (k) {
    return a[k] === true
  }
  var sizes = ['normal', 'large', 'xlarge']
  root.setAttribute('data-text-size', sizes.indexOf(a.textSize) >= 0 ? a.textSize : 'normal')
  root.setAttribute('data-motion', on('reduceMotion') ? 'reduce' : 'normal')
  root.setAttribute('data-links', on('underlineLinks') ? 'underline' : 'normal')
  root.setAttribute('data-spacing', on('textSpacing') ? 'wide' : 'normal')
  root.setAttribute('data-font', on('readableFont') ? 'readable' : 'normal')
  root.setAttribute('data-focus', on('strongFocus') ? 'strong' : 'normal')
  root.setAttribute('data-images', on('hideImages') ? 'hidden' : 'shown')
  root.setAttribute('data-reader', on('readAloud') ? 'on' : 'off')
  var meta = d.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', color)
})(document, window)
