export const byId = (id) => document.getElementById(id);
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function message(text, error = false) {
  const status = byId('session-status');
  status.textContent = text;
  status.setAttribute('role', error ? 'alert' : 'status');
}
