/**
@license https://github.com/t2ym/i18n-element/blob/master/LICENSE.md
Copyright (c) 2018, Tetsuya Mori <t2y3141592@gmail.com>. All rights reserved.
*/
import {
  html as litHtml,
  render,
  svg
} from '../../lit-html.js';
import 'i18n-behavior/i18n-behavior.js';
if (!Object.getOwnPropertyDescriptor(DocumentFragment.prototype, 'children')) {
  Object.defineProperty(DocumentFragment.prototype, 'children', {
    enumerable: true,
    configurable: true,
    get: function () {
      var childNodes = this.childNodes;
      var children = Array.prototype.filter.call(childNodes, function (node) {
        return node.nodeType === node.ELEMENT_NODE;
      });
      return children;
    }
  });
}
if (!Object.getOwnPropertyDescriptor(SVGElement.prototype, 'children')) {
  Object.defineProperty(SVGElement.prototype, 'children', {
    enumerable: true,
    configurable: true,
    get: function () {
      var childNodes = this.childNodes;
      var children = Array.prototype.filter.call(childNodes, function (node) {
        return node.nodeType === node.ELEMENT_NODE;
      });
      return children;
    }
  });
}
const isEdge = navigator.userAgent.indexOf(' Edge/') >= 0;
const isIE11 = !function F() {
}.name;
const UncamelCase = function UncamelCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/\b([A-Z]+)([A-Z])([a-z0-9])/, '$1 $2$3').replace(/ /g, '-').toLowerCase();
};
const mixinMethods = (mixin, methods, base) => {
  class MixinClass extends base {
  }
  methods.forEach(method => {
    Object.defineProperty(MixinClass.prototype, method, Object.getOwnPropertyDescriptor(mixin, method));
  });
  return MixinClass;
};
const i18nMethods = ((mixin, excludes) => {
  let result = [];
  for (let method in mixin) {
    if (excludes.indexOf(method) >= 0) {
      continue;
    } else {
      result.push(method);
    }
  }
  return result;
})(BehaviorsStore._I18nBehavior, [
  'properties',
  'listeners',
  'bedoreRegister',
  'registered',
  'created',
  'ready',
  'attached',
  'detached',
  '_onDomChange',
  '_updateEffectiveLang'
]);
const MinimalLegacyElementMixin = { fire: customElements.get('i18n-format').prototype.fire };
const legacyMethods = Object.keys(MinimalLegacyElementMixin);
const Mixin = Object.assign({}, MinimalLegacyElementMixin, BehaviorsStore._I18nBehavior);
const methods = legacyMethods.concat(i18nMethods);
const templateCache = new Map();
const boundElements = new Map();
export const i18n = base => class I18nBaseElement extends mixinMethods(Mixin, methods, base) {
  static get is() {
    return UncamelCase(this.name || this.toString().replace(/^function ([^ \(]*)((.*|[\n]*)*)$/, '$1'));
  }
  static get observedAttributes() {
    let attributes = new Set(super.observedAttributes);
    ['lang'].forEach(attr => attributes.add(attr));
    return [...attributes];
  }
  static get isI18n() {
    return true;
  }
  constructor() {
    super();
    this.is = this.constructor.is;
    this.importMeta = this.constructor.importMeta;
    if (!this.__proto__._fetchStatus) {
      this.__proto__._fetchStatus = {
        fetchingInstance: null,
        ajax: null,
        ajaxLang: null,
        lastLang: null,
        fallbackLanguageList: null,
        targetLang: null,
        lastResponse: {},
        rawResponses: {}
      };
    }
    this.addEventListener('lang-updated', this._updateEffectiveLang.bind(this));
    if (isEdge || isIE11) {
      this._polyfillAttributeChangedCallback();
    }
    this._startMutationObserver();
  }
  resolveUrl(url, base = this.constructor.importMeta.url) {
    return new URL(url, base).href;
  }
  notifyPath() {
  }
  _updateEffectiveLang(event) {
    this.effectiveLang = this.lang;
  }
  get text() {
    return this._getBundle(this.lang);
  }
  getText(name, meta) {
    this._preprocessed = true;
    if (name === this.is) {
      return this._getBundle(this.lang);
    } else {
      let boundElement = this.getBoundElement(name, meta);
      boundElement.lang = this.lang;
      return boundElement._getBundle(this.lang);
    }
  }
  _setText(name, bundle) {
    BehaviorsStore.I18nControllerBehavior.properties.masterBundles.value[''][name] = bundle;
  }
  getBoundElement(name, meta) {
    let boundElement = boundElements.get(name);
    if (!boundElement) {
      class BoundElementClass extends i18n(HTMLElement) {
        static get is() {
          return name;
        }
        static get importMeta() {
          return meta;
        }
        constructor() {
          super();
          this.importMeta = meta;
          Object.defineProperty(this.constructor.prototype, '_fetchStatus', {
            configurable: true,
            enumerable: true,
            writable: true,
            value: {
              fetchingInstance: null,
              ajax: null,
              ajaxLang: null,
              lastLang: null,
              fallbackLanguageList: null,
              targetLang: null,
              lastResponse: {},
              rawResponses: {}
            }
          });
        }
      }
      customElements.define('html-binding-namespace-' + name, BoundElementClass);
      boundElement = document.createElement('html-binding-namespace-' + name);
      boundElements.set(name, boundElement);
    }
    return boundElement;
  }
  _startMutationObserver() {
    this._htmlLangObserver = this._htmlLangObserver || new MutationObserver(this._handleHtmlLangChange.bind(this));
    this._htmlLangObserver.observe(this._html = BehaviorsStore.I18nControllerBehavior.properties.html.value, { attributes: true });
    if (this.lang !== this._html.lang && this._html.lang) {
      setTimeout(() => this.lang = this._html.lang, 0);
    }
  }
  _handleHtmlLangChange(mutations) {
    mutations.forEach(function (mutation) {
      switch (mutation.type) {
      case 'attributes':
        if (mutation.attributeName === 'lang') {
          this.lang = this._html.lang;
        }
        break;
      default:
        break;
      }
    }, this);
  }
  _polyfillAttributeChangedCallback() {
    this._selfObserver = this._selfObserver || new MutationObserver(this._handleSelfAttributeChange.bind(this));
    this._selfObserver.observe(this, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: this.constructor.observedAttributes
    });
  }
  _handleSelfAttributeChange(mutations) {
    mutations.forEach(function (mutation) {
      switch (mutation.type) {
      case 'attributes':
        this.attributeChangedCallback(mutation.attributeName, mutation.oldValue, this.getAttribute(mutation.attributeName));
        break;
      default:
        break;
      }
    }, this);
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'lang') {
      if (this.is !== 'observer-element' && oldValue !== newValue) {
        if (BehaviorsStore.I18nControllerBehavior.properties.masterBundles.value[''][this.constructor.is]) {
          this._langChanged(newValue, oldValue);
        } else {
          this._tasks = this._tasks || [];
          this._tasks.push([
            '_langChanged',
            [
              newValue,
              oldValue
            ]
          ]);
        }
      }
    } else {
      if (typeof super.attributeChangedCallback === 'function') {
        super.attributeChangedCallback(name, oldValue, newValue);
      }
    }
  }
  _processTasks() {
    if (this._tasks) {
      let task;
      while (task = this._tasks.shift()) {
        this[task[0]].apply(this, task[1]);
      }
    }
  }
};
export const html = (strings, ...parts) => {
  let name, meta, element;
  let preprocessedStrings = [];
  let preprocessedParts = [];
  let originalHtml = '';
  if (strings.length !== parts.length + 1) {
    throw new Error(`html: strings.length (= ${ strings.length }) !== parts.length (= ${ parts.length }) + 1`);
  }
  let offset = 0;
  if (strings.length > 0 && strings[0] === '' && parts[0] instanceof BindingBase) {
    name = parts[0].name;
    meta = parts[0].meta;
    element = parts[0].element;
    offset++;
  } else if (strings.length > 0 && strings[0] === '<!-- localizable -->' && parts[0] instanceof BindingBase) {
    name = parts[0].name;
    meta = parts[0].meta;
    element = parts[0].element;
    offset++;
    strings.shift();
    parts.shift();
    return litHtml(strings, ...parts);
  } else {
    return litHtml(strings, ...parts);
  }
  let i;
  for (i = 0; i + offset < parts.length; i++) {
    let string = strings[i + offset];
    let match = string.match(/([.?@])[^ =]*=$/);
    if (match) {
      switch (match[1]) {
      case '.':
        originalHtml += string.replace(/[.]([^ =]*)=$/, '$1=');
        originalHtml += `{{parts.${ i }:property}}`;
        break;
      case '?':
        originalHtml += string.replace(/[?]([^ =]*)=$/, '$1=');
        originalHtml += `{{parts.${ i }:boolean}}`;
        break;
      case '@':
        originalHtml += string.replace(/[@]([^ =]*)=$/, '$1=');
        originalHtml += `{{parts.${ i }:event}}`;
        break;
      default:
        originalHtml += string;
        originalHtml += `{{parts.${ i }}}`;
        break;
      }
    } else {
      originalHtml += string;
      originalHtml += `{{parts.${ i }}}`;
    }
  }
  originalHtml += strings[i + offset];
  let preprocessedHtml = templateCache.get(name + originalHtml);
  if (!preprocessedHtml) {
    let template = document.createElement('template');
    let _originalHtml = originalHtml;
    if (isEdge) {
      while (originalHtml.indexOf('transform=') >= 0) {
        originalHtml = originalHtml.replace('transform=', 'x-transform-x=');
      }
    }
    template.innerHTML = originalHtml;
    BehaviorsStore._I18nBehavior._constructDefaultBundle(template, name);
    preprocessedHtml = template.innerHTML;
    if (isEdge) {
      while (preprocessedHtml.indexOf('x-transform-x=') >= 0) {
        preprocessedHtml = preprocessedHtml.replace('x-transform-x=', 'transform=');
      }
    }
    templateCache.set(name + _originalHtml, preprocessedHtml);
    element._processTasks();
  }
  let index;
  let partIndex = 0;
  let text = element.getText(name, meta);
  while ((index = preprocessedHtml.indexOf('{{')) >= 0) {
    let preprocessedString;
    if (index > 3 && preprocessedHtml.substring(index - 3, index) === '$="') {
      preprocessedString = preprocessedHtml.substring(0, index - 3) + '="';
    } else {
      preprocessedString = preprocessedHtml.substring(0, index);
    }
    preprocessedHtml = preprocessedHtml.substring(index);
    index = preprocessedHtml.indexOf('}}');
    if (index < 0) {
      throw new Error('html: no matching }} for {{');
    }
    let part = preprocessedHtml.substring(0, index + 2);
    preprocessedHtml = preprocessedHtml.substring(index + 2);
    let partMatch = part.match(/^{{parts[.]([0-9]*)(:[a-z]*)?}}$/);
    if (partMatch && partMatch[2]) {
      switch (partMatch[2]) {
      case ':property':
        preprocessedString = preprocessedString.replace(/([^ =]*)=(["]?)$/, '.$1=$2');
        break;
      case ':boolean':
        preprocessedString = preprocessedString.replace(/([^ =]*)=(["]?)$/, '?$1=$2');
        break;
      case ':event':
        preprocessedString = preprocessedString.replace(/([^ =]*)=(["]?)$/, '@$1=$2');
        break;
      default:
        break;
      }
    }
    preprocessedStrings.push(preprocessedString);
    if (partMatch) {
      preprocessedParts.push(parts[parseInt(partMatch[1]) + offset]);
      partIndex++;
    } else {
      let partPath = part.substring(2, part.length - 2).split(/[.]/);
      let value = text;
      let tmpPart = partPath.shift();
      if (tmpPart === 'model') {
        value = text.model;
      } else if (tmpPart === 'effectiveLang') {
        value = element.effectiveLang || element.lang;
      }
      while (tmpPart = partPath.shift()) {
        value = value[tmpPart];
      }
      preprocessedParts.push(value);
    }
  }
  preprocessedStrings.push(preprocessedHtml);
  return litHtml(preprocessedStrings, ...preprocessedParts);
};
class ObserverElement extends i18n(HTMLElement) {
  static get importMeta() {
    return import.meta;
  }
}
customElements.define(ObserverElement.is, ObserverElement);
export const observer = document.createElement(ObserverElement.is);
class BindingBase {
  toString() {
    return '';
  }
}
class ElementBinding extends BindingBase {
  constructor(element) {
    super();
    if (element instanceof HTMLElement && element.constructor.isI18n) {
      this.name = element.constructor.is;
      this.meta = element.constructor.importMeta;
      this.element = element;
    } else {
      this.name = null;
      this.meta = null;
      this.element = null;
    }
  }
}
class NameBinding extends BindingBase {
  constructor(name, meta) {
    super();
    this.name = name || null;
    this.meta = meta || null;
    this.element = observer.getBoundElement(name, meta);
  }
}
class ElementNameBinding extends BindingBase {
  constructor(element, name) {
    super();
    if (element instanceof HTMLElement && element.constructor.isI18n && name) {
      this.name = name;
      this.meta = element.constructor.importMeta;
      this.element = element;
    } else {
      this.name = null;
      this.meta = null;
      this.element = null;
    }
  }
}
export const bind = function (target, meta) {
  let partsGenerator;
  let localizableText;
  let binding;
  if (target instanceof BindingBase && typeof arguments[1] === 'function' && typeof arguments[2] === 'object') {
    binding = target;
    partsGenerator = arguments[1];
    localizableText = arguments[2];
  } else if (typeof target === 'string' && typeof meta === 'object' && typeof arguments[2] === 'function' && typeof arguments[3] === 'object') {
    binding = new NameBinding(target, meta);
    partsGenerator = arguments[2];
    localizableText = arguments[3];
  } else if (target instanceof HTMLElement && target.constructor.isI18n && typeof arguments[1] === 'string' && typeof arguments[2] === 'function' && typeof arguments[3] === 'object') {
    binding = new ElementNameBinding(target, arguments[1]);
    partsGenerator = arguments[2];
    localizableText = arguments[3];
  } else if (target instanceof HTMLElement && target.constructor.isI18n && typeof arguments[1] === 'function' && typeof arguments[2] === 'object') {
    binding = new ElementBinding(target);
    partsGenerator = arguments[1];
    localizableText = arguments[2];
  }
  if (binding) {
    if (!BehaviorsStore.I18nControllerBehavior.properties.masterBundles.value[''][binding.name]) {
      binding.element._setText(binding.name, localizableText);
    }
    let text = binding.element.getText(binding.name, binding.meta);
    if (!binding.element.effectiveLang) {
      text = localizableText;
    }
    return partsGenerator(binding, text, text.model, binding.element.effectiveLang || binding.element.lang);
  } else {
    if (target instanceof HTMLElement && target.constructor.isI18n) {
      if (!meta) {
        return new ElementBinding(target);
      } else {
        return new ElementNameBinding(target, meta);
      }
    }
    if (typeof target === 'string' && meta && typeof meta === 'object') {
      return new NameBinding(target, meta);
    }
    return new BindingBase();
  }
};
