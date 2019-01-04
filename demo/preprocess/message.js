import {
  html,
  bind
} from './i18n.js';
export const binding = bind('get-message', import.meta);
let mutatingMessage = '';
setInterval(() => {
  mutatingMessage = Date.now();
  binding.element.fire('lang-updated');
}, 500);
const getMutatingMessage = () => {
  return mutatingMessage;
};
export const getMessage = () => {
  return html([
    '<!-- localizable -->',
    '<div>',
    '</div><div>',
    '</div>'
  ], ...bind(('get-message', binding), (_bind, text, model, effectiveLang) => [
    _bind,
    text['div'],
    getMutatingMessage()
  ], {
    'meta': {},
    'model': {},
    'div': 'message'
  }));
};
