import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

class FakeClassList {
  constructor(initial = '') {
    this.values = new Set(initial.split(/\s+/).filter(Boolean));
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }

  toString() {
    return Array.from(this.values).join(' ');
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.parentNode = null;
    this.textContent = '';
    this.classList = new FakeClassList();
  }

  set className(value) {
    this.classList = new FakeClassList(value);
  }

  get className() {
    return this.classList.toString();
  }

  set innerHTML(value) {
    this.children = [];
    if (String(value).includes('data-details-modal-backdrop')) {
      this.appendChild(elementWithAttribute('div', 'data-details-modal-backdrop'));
      const panel = elementWithAttribute('div', 'data-details-modal-panel');
      const label = elementWithAttribute('p', 'data-details-modal-label');
      const title = elementWithAttribute('h3', 'data-details-modal-title');
      const close = elementWithAttribute('button', 'data-details-modal-close');
      const body = elementWithAttribute('div', 'data-details-modal-body');
      panel.appendChild(label);
      panel.appendChild(title);
      panel.appendChild(close);
      panel.appendChild(body);
      this.appendChild(panel);
    }
  }

  get innerHTML() {
    return '';
  }

  setAttribute(name, value = '') {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  querySelector(selector) {
    return findFirst(this, selector);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matches(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  focus() {
    this.focused = true;
  }

  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }
}

class FakeTemplateElement extends FakeElement {
  constructor() {
    super('template');
    this.content = new FakeDocumentFragment();
  }
}

class FakeDocumentFragment extends FakeElement {
  constructor() {
    super('#fragment');
  }

  cloneNode() {
    const clone = new FakeDocumentFragment();
    this.children.forEach((child) => clone.appendChild(child));
    return clone;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.listeners = new Map();
    this.templates = new Map();
    this.activeElement = null;
  }

  createElement(tagName) {
    return tagName === 'template' ? new FakeTemplateElement() : new FakeElement(tagName);
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  getElementById(id) {
    return this.templates.get(id) || null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }
}

function elementWithAttribute(tagName, attribute) {
  const element = new FakeElement(tagName);
  element.setAttribute(attribute, '');
  return element;
}

function matches(element, selector) {
  const match = selector.match(/^\[([^\]]+)\]$/);
  return !!(match && element.hasAttribute(match[1]));
}

function findFirst(root, selector) {
  for (const child of root.children) {
    if (matches(child, selector)) return child;
    const match = findFirst(child, selector);
    if (match) return match;
  }
  return null;
}

test('details modal creates a shared shell and opens template triggers', () => {
  const document = new FakeDocument();
  const window = { PNSQCModal: {} };
  const context = createContext({
    document,
    window,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLTemplateElement: FakeTemplateElement,
  });
  const source = readFileSync('src/js/details-modal.js', 'utf8');
  new Script(source).runInContext(context);

  const modal = document.querySelector('[data-details-modal]');
  assert.ok(modal);
  assert.equal(typeof window.PNSQCModal.createDetailsModalShell, 'function');

  const template = new FakeTemplateElement();
  template.id = 'details-template';
  template.content.appendChild(new FakeElement('p'));
  document.templates.set(template.id, template);

  const trigger = new FakeElement('button');
  trigger.setAttribute('data-details-modal-open', template.id);
  trigger.setAttribute('data-details-modal-title', 'Presentation Title');
  trigger.setAttribute('data-details-modal-label', 'Presentation');

  document.listeners.get('click')({ target: trigger });

  assert.equal(modal.classList.contains('hidden'), false);
  assert.equal(document.body.classList.contains('overflow-hidden'), true);
  assert.equal(modal.querySelector('[data-details-modal-title]').textContent, 'Presentation Title');
  assert.equal(modal.querySelector('[data-details-modal-label]').textContent, 'Presentation');
  assert.equal(modal.querySelector('[data-details-modal-body]').children.length, 1);
});
