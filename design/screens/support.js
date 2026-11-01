/*
  덕후브 화면 파일(.dc.html)을 일반 브라우저·GitHub Pages에서 보여주기 위한 작은 렌더러.
  {{값}} 자리를 채우고 <sc-for>(반복), <sc-if>(조건)를 펼친다.
*/
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(s) { Object.assign(this.state, s); }
    forceUpdate() {}
  }
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function fill(text, scope) {
    return text.replace(HOLE, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  function renderChildren(parent, scope) {
    Array.prototype.slice.call(parent.childNodes).forEach(function (n) { renderNode(n, scope); });
  }

  function expand(node, scope) {
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(node.childNodes).forEach(function (c) { frag.appendChild(c.cloneNode(true)); });
    renderChildren(frag, scope);
    return frag;
  }

  function renderNode(node, scope) {
    if (node.nodeType === 3) {
      if (node.nodeValue.indexOf('{{') !== -1) node.nodeValue = fill(node.nodeValue, scope);
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();

    if (tag === 'sc-for') {
      var m = (node.getAttribute('list') || '').match(/\{\{\s*([^}]+?)\s*\}\}/);
      var list = m ? lookup(m[1], scope) : [];
      var as = node.getAttribute('as') || 'item';
      var out = document.createDocumentFragment();
      (list || []).forEach(function (item, i) {
        var s = Object.create(scope);
        s[as] = item; s.$index = i;
        out.appendChild(expand(node, s));
      });
      node.parentNode.replaceChild(out, node);
      return;
    }
    if (tag === 'sc-if') {
      var mv = (node.getAttribute('value') || '').match(/\{\{\s*([^}]+?)\s*\}\}/);
      var ok = mv ? lookup(mv[1], scope) : false;
      if (ok) node.parentNode.replaceChild(expand(node, scope), node);
      else node.parentNode.removeChild(node);
      return;
    }

    Array.prototype.slice.call(node.attributes).forEach(function (a) {
      if (a.value.indexOf('{{') !== -1) node.setAttribute(a.name, fill(a.value, scope));
    });
    renderChildren(node, scope);
  }

  function boot() {
    var root = document.querySelector('x-dc');
    var script = document.querySelector('script[data-dc-script]');
    if (!root) return;
    var helmet = root.querySelector('helmet');
    if (helmet) {
      Array.prototype.slice.call(helmet.children).forEach(function (c) { document.head.appendChild(c); });
      helmet.parentNode.removeChild(helmet);
    }
    var vals = {};
    if (script) {
      try {
        var Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
        vals = new Component({}).renderVals() || {};
      } catch (e) { console.error(e); }
    }
    renderChildren(root, vals);
    root.style.display = 'block';
    root.style.width = 'max-content';
    root.style.margin = '0 auto';
  }

  var base = document.createElement('style');
  base.textContent = 'html{background:#E9E9EC}x-dc{display:none}';
  document.head.appendChild(base);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
